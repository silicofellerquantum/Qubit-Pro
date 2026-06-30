# Phase 13: Background Execution & Scalability Design & Operational Guide

This document describes the production-grade background execution and scalability subsystem introduced in Phase 13. This subsystem transforms the Quantum Studio simulation platform from an in-process blocking execution model into a highly scalable, distributed, and resilient background-processing architecture.

---

## 1. Queue Architecture & Abstraction

To support different deployment environments (from local single-node development to high-throughput, multi-node production setups), the queue layer is built around a clean, decoupled provider abstraction.

### Abstraction Interface (`QueueBackend`)
Defined in [interface.py](../app/simulation/queue/interface.py), the `QueueBackend` abstract class enforces the contract for queue storage engines:

```python
class QueueBackend(ABC):
    @abstractmethod
    async def enqueue(self, job: SimulationJob) -> None: ...
    @abstractmethod
    async def dequeue(self) -> Optional[SimulationJob]: ...
    @abstractmethod
    async def get_job(self, job_id: str) -> Optional[SimulationJob]: ...
    @abstractmethod
    async def update_job(self, job: SimulationJob) -> None: ...
    @abstractmethod
    async def list_jobs(self, state: Optional[JobState] = None) -> List[SimulationJob]: ...
    @abstractmethod
    async def delete_job(self, job_id: str) -> None: ...
    @abstractmethod
    async def get_metrics(self) -> QueueMetrics: ...
```

### Supported Providers
1. **InMemoryQueue** ([in_memory.py](../app/simulation/queue/in_memory.py)): Thread-safe in-memory queue using `asyncio.Lock` for local development and single-host setups. It implements a custom priority-FIFO sort algorithm.
2. **RedisQueue** ([redis_queue.py](../app/simulation/queue/redis_queue.py)): Uses Redis lists (for atomic job distribution) and hashes (for rich job metadata serialization). Ideal for horizontal scaling across multiple background worker nodes.
3. **RabbitMQQueue** ([rabbitmq_queue.py](../app/simulation/queue/rabbitmq_queue.py)): Uses `aio_pika` to publish and consume messages with persistent AMQP delivery modes and robust connection recovery.

---

## 2. Job Lifecycle States

A simulation job transitions through the following states, tracked in real-time by the scheduler and propagated to the database:

```mermaid
stateDiagram-v2
    [*] --> QUEUED : User clicks "Run Simulation"
    QUEUED --> STARTING : Dequeued by Worker
    STARTING --> RUNNING : Resource checks pass, Solver spawned
    RUNNING --> COMPLETED : Solver exited code 0, Results saved
    RUNNING --> RETRYING : Transient error (e.g. timeout, file lock)
    RETRYING --> QUEUED : Exponential backoff elapsed
    RUNNING --> FAILED : Deterministic error (e.g. empty design) or max retries exceeded
    RUNNING --> CANCELLED : Explicit user cancellation
    QUEUED --> CANCELLED : Cancelled before execution starts
```

* **`QUEUED`**: Job is stored in the queue, waiting for an available worker.
* **`STARTING`**: Worker has picked up the job and is conducting preflight resource checks.
* **`RUNNING`**: Solver process (GMSH / Palace) is actively executing.
* **`PAUSED`**: Reserved for future-ready queue-suspension.
* **`CANCELLED`**: Execution was explicitly terminated by the user.
* **`FAILED`**: Execution terminated with errors, or max retries were exceeded.
* **`COMPLETED`**: Execution finished successfully, results parsed and persisted.
* **`RETRYING`**: Job failed due to a transient issue and is undergoing backoff before being re-enqueued.

---

## 3. Worker Lifecycle & Health Monitoring

Workers operate as standalone daemon processes that pull jobs from the queue and execute them independently without exposing HTTP endpoints, minimizing the attack surface.

```mermaid
sequenceDiagram
    participant Queue as QueueBackend
    participant Worker as BackgroundWorker
    participant Scheduler as JobScheduler
    participant Service as SimulationService
    participant DB as SQLite/PostgreSQL

    Note over Worker: Startup (Spawn Heartbeat & Poll loops)
    loop Heartbeat Loop (Every 5s)
        Worker->>Worker: Collect CPU, RAM, Disk & Uptime
        Worker->>Worker: Update active_workers global registry
    end
    
    loop Polling Loop (Every 1s)
        Worker->>Scheduler: can_run_more()?
        alt Capacity Available
            Scheduler->>Queue: dequeue()
            Queue-->>Scheduler: return SimulationJob
            Scheduler-->>Worker: allocate Job
            Note over Worker: Status = busy, Current Job = Job ID
            Worker->>Scheduler: register_start()
            Worker->>Worker: Enforce CPU affinity & niceness
            Worker->>Worker: Check disk space & memory limit
            Worker->>Service: execute_simulation()
            
            loop Progress Propagation
                Service->>Worker: on_progress(phase)
                Worker->>Queue: update_job(progress, phase)
                Worker->>Worker: check_memory_consumption()
            end
            
            Service-->>Worker: return Results
            Note over Worker: Status = idle
            Worker->>Queue: update_job(COMPLETED)
            Worker->>Scheduler: register_completion()
        else Capacity Full
            Note over Worker: Throttle and sleep
        end
    end
```

### Worker Health Monitoring (`WorkerHealth`)
Workers periodically report their health status to a central registry, exposing:
* `worker_id` and `status` (`idle` | `busy` | `offline`)
* `current_job_id`
* `uptime_seconds`
* `cpu_percent` (utilization)
* `memory_usage_mb` (RAM footprint)
* `disk_usage_percent` (workspace partition)
* `last_heartbeat` timestamp

---

## 4. Scheduling & Concurrency Control

The `JobScheduler` ([scheduler.py](../app/simulation/queue/scheduler.py)) manages worker capacity:
* **FIFO & Priority Scheduling**: Dequeues jobs sorted by priority descending (values 0-10, default 5) and enqueued timestamp ascending.
* **Concurrency Limits**: Enforces `max_concurrency` (default 2) per worker node, preventing resource starvation under heavy simulation loads.
* **GPU Queue Ready**: Designed to easily map solver payloads to different queues based on GPU/CPU flags in `user_settings`.

---

## 5. Resource Limits & Isolation

To guarantee system stability in production, the `ResourceLimiter` ([limits.py](../app/simulation/queue/limits.py)) monitors and restricts resource usage:
1. **CPU Cores**: Limits worker process affinity using `psutil.cpu_affinity` or falls back to raising process niceness (`os.nice(10)`).
2. **RAM**: Recursively calculates memory consumption of the worker and all child solver processes. If the limit (default 8GB) is exceeded, the worker gracefully cancels the simulation to prevent Out-Of-Memory (OOM) kernel panics.
3. **Disk Usage**: Inspects available disk space on the workspace partition before running. If space drops below `min_disk_space_mb` (default 2GB), the run is aborted immediately.
4. **Maximum Runtime (Timeout)**: Enforced via `TimeoutManager` which halts execution and terminates child processes if the simulation runs longer than the configured timeout (default 30 minutes).

---

## 6. Retry & Resiliency Policy

The `RetryManager` ([retry.py](../app/simulation/queue/retry.py)) handles failures intelligently:
* **Transient Failures**: Errors like database locks, temporary filesystem blocks, or network timeouts trigger a retry.
* **Deterministic Failures**: Invalid geometries, empty designs, solver syntax errors, or validation failures bypass retries entirely to avoid wasting compute resources.
* **Exponential Backoff**: Calculated as $base\_backoff \times 2^{retry\_count}$, giving the system time to recover before re-enqueuing.

---

## 7. Graceful Cancellation & Subprocess Termination

When a user cancels a simulation through the REST API, the worker dispatches a signal to `PalaceRunner` which aborts the run cleanly:
1. Sends `SIGTERM` to the Palace and MPI subprocesses.
2. Waits for a grace period (default 5 seconds).
3. If the process is still running, escalates to `SIGKILL` to ensure no orphaned processes remain.
4. Triggers workspace rollback according to the requested policy (e.g. purging temporary meshes and lockfiles).
5. Updates the job state to `CANCELLED` and propagates the status.

---

## 8. Logging Architecture

Worker and simulation execution outputs are cleanly separated to simplify debugging and monitoring:
* **Worker Logs**: Captured via python `logging` under the `app.simulation.queue` logger.
* **Queue Logs**: Tracks enqueue/dequeue events, priority changes, and scheduler decisions.
* **Simulation Logs**: Palace stdout and stderr are written directly to file descriptors inside the simulation's workspace directory (`workspace/<simulation_id>/logs/`), exposing real-time solver progression without polluting the main application log.

---

## 9. Deployment Guide

The queue backend is configurable via environment variables in the `.env` file.

### In-Memory Development Mode
Fast, lightweight, and requires no external dependencies. Excellent for local testing.
```env
QUEUE_BACKEND=in_memory
MAX_CONCURRENCY=2
```

### Redis Production Mode
Enables horizontal scaling with multiple worker daemons running on dedicated compute instances.
1. Install Redis: `sudo apt-get install redis-server`
2. Update `.env`:
```env
QUEUE_BACKEND=redis
REDIS_URL=redis://:yourpassword@redis-server-ip:6379/0
MAX_CONCURRENCY=4
MAX_CPU_CORES=8
MAX_RAM_MB=16384
```

### RabbitMQ Production Mode
Provides enterprise-grade message queuing with full delivery guarantees and high-concurrency support.
1. Install RabbitMQ: `sudo apt-get install rabbitmq-server`
2. Update `.env`:
```env
QUEUE_BACKEND=rabbitmq
AMQP_URL=amqp://guest:guest@rabbitmq-server-ip:5672/
MAX_CONCURRENCY=4
```

---

## 10. Extension & Customization

### Adding a New Queue Backend
To integrate an alternative queuing system (e.g. AWS SQS or Celery):
1. Create a new file in `app/simulation/queue/` (e.g., `sqs_queue.py`).
2. Subclass `QueueBackend` and implement all abstract methods.
3. Register the new backend in the initialization factory in `app/simulation/queue/__init__.py`.

### Tuning Resource Caps
Adjust the default limits in `app/simulation/queue/worker.py` or through the FastAPI settings to match your target compute hardware. For example, if deploying on high-performance compute (HPC) nodes, increase `max_cpu_cores` and `max_ram_mb` to allow deep parallel execution of large 3D structures.
