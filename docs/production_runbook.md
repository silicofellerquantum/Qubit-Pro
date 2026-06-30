# Quantum Studio — Production Runbook & Operations Manual

This document outlines the deployment, monitoring, scaling, backup, and disaster recovery procedures for running the Silicofeller Quantum Studio platform in a production-hardened environment.

---

## 1. Architecture Overview

Quantum Studio is deployed as a decoupled, multi-container system coordinated via Docker Compose or Kubernetes:

* **Entrypoint / Load Balancer**: Nginx reverse proxy routing traffic, managing rate limits, and terminating SSL.
* **API Engine**: FastAPI backend handling REST requests, auth, project configurations, and metadata.
* **Queue Broker**: Redis handling job synchronization using persistent Append Only Files (AOF).
* **Solver Worker**: Background daemon listening to the queue, executing GMSH and Palace solvers asynchronously, and writing output files.
* **Storage Layer**: Shared workspaces volume between API and Worker, and a dedicated PostgreSQL database.
* **Monitoring Stack**: Prometheus scraping application metrics and Grafana providing real-time telemetry.

---

## 2. Quick Start Deployment (Single-Node)

### Pre-requisites
* Docker Engine (24.0.0+)
* Docker Compose (2.20.0+)
* System Specs: 4+ vCPU, 8GB+ RAM, 50GB SSD space (allocated for workspaces)

### Step 1: Environment Configuration
Create a `.env` file in the root directory. **Never check this file into source control.**
```bash
# App Settings
APP_ENV=production
SECRET_KEY=e83a9d28e77a112df380e2277d33ba7c82c6114e9f7831f2b1a8f9c1e1d  # Must be 32+ chars
PALACE_MOCK_MODE=false # Set to true if running without local MPI/Spack Palace installation

# Database Settings
POSTGRES_DB=quantum_studio
POSTGRES_USER=quantum_admin
POSTGRES_PASSWORD=secure_postgres_db_password_override

# Grafana Monitoring
GF_SECURITY_ADMIN_PASSWORD=secure_grafana_dashboard_admin_password
```

### Step 2: Launch the Stack
Start all services in detached mode:
```bash
docker compose up -d --build
```

Verify that all containers are healthy:
```bash
docker compose ps
```

---

## 3. Telemetry & Observability

### Accessing Dashboards
* **REST API & Probes**: Exposes `http://localhost/live` (liveness), `http://localhost/ready` (readiness), and `http://localhost/health` (deep diagnostics).
* **Prometheus Plaintext**: Exposes `http://localhost/metrics`.
* **Grafana Web Console**: Accessible on host port `3001` (`http://localhost:3001`). Default username: `admin`. The **Quantum Studio Operations** dashboard is pre-loaded at startup.

### Critical Alerting Thresholds

| Metric Name | Description | Warning Limit | Critical Limit | Remedy Action |
| :--- | :--- | :--- | :--- | :--- |
| `quantum_studio_disk_usage_percent` | Workspace partition capacity | > 80% | > 90% | Run workspace cleanup cron, archive old folders. |
| `quantum_studio_db_latency_ms` | PostgreSQL response latency | > 100ms | > 500ms | Optimize database indexes, check connection pool size. |
| `quantum_studio_active_workers` | Live worker Heartbeats | < 1 | 0 | Restart worker container; check worker memory logs. |
| `quantum_studio_queue_depth` | Backlogged simulations | > 5 | > 15 | Spin up additional worker nodes (see Scaling). |

---

## 4. Backup & Disaster Recovery

### 4.1 Automating Database Backups
Create a backup cron script at `/opt/quantum_studio/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/quantum_studio"
TIMESTAMP=$(date +%F_%T)
FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"
# Dump postgres contents securely
docker compose exec -t db pg_dump -U postgres quantum_studio > "$FILE"
# Keep only past 7 days of backups
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Database backup completed: $FILE"
```
Set this script to run nightly via crontab: `0 2 * * * /opt/quantum_studio/backup.sh`.

### 4.2 Database Restore Procedure
To restore the database state from a backup file:
```bash
# Drop existing DB and recreate
docker compose exec -t db dropdb -U postgres --if-exists quantum_studio
docker compose exec -t db createdb -U postgres quantum_studio

# Restore from SQL file
cat /var/backups/quantum_studio/db_backup_2026-06-25.sql | docker compose exec -i db psql -U postgres -d quantum_studio
```

### 4.3 Workspace Purges
Large 3D mesh files can consume significant disk space. Enable the automated partial cleanup policy in `WorkspaceManager` or run a daily cron that triggers the `/api/simulations/cleanup` route for jobs older than 14 days.

---

## 5. Horizontal Scaling (Multi-Worker)

The queue worker architecture is designed to scale horizontally across multiple servers.

```
                  +--------------------------------+
                  |     Primary API Host (VM-1)    |
                  |  [Nginx, API, Postgres, Redis] |
                  +---------------+----------------+
                                  | (Exposes Port 6379, 5432 internally)
                                  v
         +------------------------+------------------------+
         |                                                 |
         v (Runs worker container)                         v (Runs worker container)
+--------------------------------+                +--------------------------------+
|      Worker Host 1 (VM-2)      |                |      Worker Host 2 (VM-3)      |
|  - Connects to Redis on VM-1   |                |  - Connects to Redis on VM-1   |
|  - Connects to DB on VM-1      |                |  - Connects to DB on VM-1      |
|  - Mounts shared NFS workspace |                |  - Mounts shared NFS workspace |
+--------------------------------+                +--------------------------------+
```

### Scaling Worker Containers (Same Node)
To spin up multiple local worker daemons to utilize a multi-core server:
```bash
docker compose up -d --scale worker=3
```

### Scaling Worker Nodes (Distributed Servers)
To deploy workers to dedicated simulation server VMs (VM-2, VM-3, etc.):
1. Mount the `/app/workspaces` directory across all VM hosts using a high-throughput shared network file system (e.g., **Amazon EFS** or an **NFS v4** server).
2. Configure the worker containers on the external VMs to target the primary VM's Redis broker:
   `REDIS_URL=redis://<primary-vm-ip>:6379/0`
3. Configure the worker to target the primary database:
   `DATABASE_URL=postgresql+asyncpg://postgres:password@<primary-vm-ip>:5432/quantum_studio`

---

## 6. Upgrades & Rolling Migrations

To perform a zero-downtime application upgrade:

1. **Pull new images**:
   ```bash
   docker compose pull
   ```
2. **Apply Database Migrations**:
   Run Alembic migrations in a temporary container before updating the running API servers:
   ```bash
   docker compose run --rm backend alembic upgrade head
   ```
3. **Rolling restart of API and Workers**:
   ```bash
   docker compose up -d --no-deps backend
   docker compose up -d --no-deps worker
   ```
4. **Clean up old layers**:
   ```bash
   docker image prune -f
   ```

---

## 7. Troubleshooting Playbook

### Problem A: Simulation queue is growing but jobs are stuck in `QUEUED` or `STARTING`
* **Check worker container logs**:
  ```bash
  docker compose logs worker
  ```
* **Verify Redis connection**:
  Ensure the worker can ping Redis. Run:
  ```bash
  docker compose exec worker python -c "import redis; r=redis.from_url('redis://redis:6379/0'); print(r.ping())"
  ```
* **Verify database session availability**:
  If the database is out of connection slots, workers cannot register startup. Increase `max_connections` in Postgres or scale down connection pool sizes.

### Problem B: Solvers fail with segment faults or "xvfb" errors during rendering
* **Headless Display Server**: Ensure `Xvfb` is running within the container. The `physics_analysis` plotting relies on `xvfb-run`.
* **Resource Limits**: High-fidelity meshes require substantial memory. If a worker is killed abruptly, check system dmesg for Out-of-Memory (OOM) killer events:
  ```bash
  dmesg -T | grep -i oom
  ```

### Problem C: General HTTP 429 Too Many Requests
* **Rate Limiter Triggered**: If clients receive HTTP 429 on standard routes, they are exceeding Nginx's `api_limit` zone (10 req/s, burst 20).
* **Workaround**: If running load tests or high-concurrency automations, edit `/etc/nginx/conf.d/default.conf` and adjust `rate=50r/s` and `burst=100`, then reload Nginx:
  ```bash
  docker compose exec nginx nginx -s reload
  ```
