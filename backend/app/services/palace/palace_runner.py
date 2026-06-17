"""Palace simulation runner.

Orchestrates the execution of the AWS Palace Docker image. Manages workspaces,
writes configs, handles timeouts, captures stdout/stderr, and tracks runtime.
Includes a mock execution mode for testing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
import tempfile
from typing import Any, Dict, Optional

from app.services.palace.exceptions import PalaceRunnerError
from app.services.palace.models import EMGeometry

logger = logging.getLogger(__name__)


class PalaceRunner:
    """Orchestrates running Palace simulations locally via Docker."""

    def __init__(
        self,
        docker_image: str = "palace-sim:latest",
        timeout_seconds: float = 300.0,
        mock_mode: bool = False,
    ):
        """Initialize Palace runner.

        Args:
            docker_image: Docker image tag for Palace solver.
            timeout_seconds: Maximum execution time in seconds.
            mock_mode: If True, simulate execution and generate dummy output files.
        """
        self.docker_image = docker_image
        self.timeout_seconds = timeout_seconds
        self.mock_mode = mock_mode

    async def run_simulation(
        self,
        config_data: Dict[str, Any],
        mesh_content: bytes | None = None,
        np: int = 1,
        serial: bool = False,
        geometry: Optional[EMGeometry] = None,
    ) -> Dict[str, Any]:
        """Run the Palace solver inside a Docker container.

        Args:
            config_data: Configuration dictionary to write.
            mesh_content: Optional bytes of the GMSH mesh file to write.
            np: Number of processors for MPI.
            serial: If True, call Palace without MPI.
            geometry: Optional EMGeometry object to build a physical GMSH mesh.

        Returns:
            A dictionary containing:
              - "output_dir": Path to the output folder.
              - "stdout": Captured stdout string.
              - "stderr": Captured stderr string.
              - "runtime_seconds": Solver runtime.
              - "temp_dir_obj": The TemporaryDirectory object (keep this for cleanup).

        Raises:
            PalaceRunnerError: If the execution fails or times out.
        """
        # Create temp dir within project workspace
        project_root = Path(__file__).resolve().parents[3]
        tmp_dir_root = project_root / "tmp"
        tmp_dir_root.mkdir(exist_ok=True)

        temp_dir_obj = tempfile.TemporaryDirectory(dir=tmp_dir_root)
        job_dir = Path(temp_dir_obj.name)

        try:
            # Pre-flight Docker checks (only in real mode)
            if not self.mock_mode:
                logger.info("Performing pre-flight Docker checks...")
                # 1. Check Docker daemon availability
                try:
                    logger.info("Verifying Docker daemon connectivity...")
                    proc_info = await asyncio.create_subprocess_exec(
                        "docker", "info",
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout_info, stderr_info = await proc_info.communicate()
                    if proc_info.returncode != 0:
                        err_msg = stderr_info.decode(errors="replace").strip()
                        logger.error("Docker daemon is not running: %s", err_msg)
                        raise PalaceRunnerError(f"Docker daemon is unavailable or not running. Error: {err_msg}")
                    logger.info("Docker daemon is running and reachable.")
                except FileNotFoundError:
                    logger.error("Docker executable not found on the system path.")
                    raise PalaceRunnerError("Docker executable not found on the system path. Please install Docker.")
                except Exception as ex:
                    if isinstance(ex, PalaceRunnerError):
                        raise ex
                    logger.exception("Unexpected error verifying Docker daemon availability:")
                    raise PalaceRunnerError(f"Docker daemon is unavailable: {ex}")

                # 2. Check Docker image existence
                try:
                    logger.info("Checking local availability of Palace Docker image '%s'...", self.docker_image)
                    proc_img = await asyncio.create_subprocess_exec(
                        "docker", "image", "inspect", self.docker_image,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout_img, stderr_img = await proc_img.communicate()
                    if proc_img.returncode != 0:
                        logger.error("Required Docker image '%s' is missing locally.", self.docker_image)
                        raise PalaceRunnerError(f"Docker image '{self.docker_image}' is missing or not built locally.")
                    logger.info("Docker image '%s' verified locally.", self.docker_image)
                except Exception as ex:
                    if isinstance(ex, PalaceRunnerError):
                        raise ex
                    logger.exception("Unexpected error inspecting Docker image:")
                    raise PalaceRunnerError(f"Failed to verify Docker image '{self.docker_image}': {ex}")

            # Write config file to workspace
            config_file_path = job_dir / "config.json"
            with open(config_file_path, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2)

            # Generate/write mesh file
            mesh_file_path = job_dir / "mesh.msh"
            if geometry is not None:
                from app.services.palace.gmsh_builder import GmshBuilder
                try:
                    # Generate a coarse mesh for speed in mock mode
                    GmshBuilder.generate_mesh(geometry, mesh_file_path, coarse=self.mock_mode)
                except Exception as mesh_err:
                    logger.warning(f"Failed to generate GMSH mesh (falling back to dummy): {mesh_err}")
                    if self.mock_mode:
                        with open(mesh_file_path, "w", encoding="utf-8") as f:
                            f.write("$MeshFormat\n2.2 0 8\n$EndMeshFormat\n")
                    else:
                        raise mesh_err
            elif mesh_content:
                with open(mesh_file_path, "wb") as f:
                    f.write(mesh_content)
            else:
                if not self.mock_mode:
                    raise PalaceRunnerError("No geometry or mesh content provided to generate mesh.msh in real mode.")
                else:
                    with open(mesh_file_path, "w", encoding="utf-8") as f:
                        f.write("$MeshFormat\n2.2 0 8\n$EndMeshFormat\n")

            # Ensure output directory exists (mapped to "/data/out" in docker)
            output_dir = job_dir / "out"
            output_dir.mkdir(exist_ok=True)

            logger.info("Setting up Palace job in: %s", job_dir)

            if self.mock_mode:
                # Mock execution path: generate mock outputs directly
                logger.info("Running in mock mode. Generating dummy Palace outputs...")
                start_time = time.perf_counter()
                await asyncio.sleep(0.5)  # Simulate small delay

                solver_type = config_data.get("Problem", {}).get("Type", "Eigenmode").lower()
                if solver_type == "eigenmode":
                    # Write eig.csv
                    eig_path = output_dir / "eig.csv"
                    with open(eig_path, "w", encoding="utf-8") as f:
                        f.write("m, Re{f} (GHz), Im{f} (GHz), Q, Error (Bkwd.), Error (Abs.)\n")
                        f.write("1.00e+00, +5.120000000000e+00, +1.000000000000e-05, +1.200000000000e+06, +1.0e-12, +1.0e-10\n")
                        f.write("2.00e+00, +5.490000000000e+00, +1.000000000000e-05, +1.100000000000e+06, +1.0e-12, +1.0e-10\n")
                        f.write("3.00e+00, +7.020000000000e+00, +1.000000000000e-05, +2.100000000000e+06, +1.0e-12, +1.0e-10\n")

                    # Write port-EPR.csv
                    epr_path = output_dir / "port-EPR.csv"
                    with open(epr_path, "w", encoding="utf-8") as f:
                        f.write("m, EPR[1], EPR[2]\n")
                        f.write("1.00e+00, +9.200000000000e-01, +1.000000000000e-02\n")
                        f.write("2.00e+00, +1.000000000000e-02, +8.900000000000e-01\n")
                        f.write("3.00e+00, +5.000000000000e-03, +0.000000000000e+00\n")

                elif solver_type == "electrostatic":
                    # Write terminal-C.csv (capacitance matrix in Farads)
                    c_path = output_dir / "terminal-C.csv"
                    with open(c_path, "w", encoding="utf-8") as f:
                        f.write("i, C[i][1] (F), C[i][2] (F), C[i][3] (F)\n")
                        f.write("1.00e+00, +6.520000000000e-14, -3.400000000000e-15, -8.500000000000e-15\n")
                        f.write("2.00e+00, -3.400000000000e-15, +5.870000000000e-14, -8.000000000000e-17\n")
                        f.write("3.00e+00, -8.500000000000e-15, -8.000000000000e-17, +4.210000000000e-14\n")

                runtime = time.perf_counter() - start_time
                logger.info("Mock simulation execution completed in %.2f seconds.", runtime)
                return {
                    "output_dir": output_dir,
                    "stdout": "Mock execution succeeded.\n",
                    "stderr": "",
                    "runtime_seconds": runtime,
                    "temp_dir_obj": temp_dir_obj,
                }

            # Real Docker execution path
            cmd = [
                "docker", "run", "--rm",
                "-e", "OMPI_ALLOW_RUN_AS_ROOT=1",
                "-e", "OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1",
                "-v", f"{job_dir}:/data",
                self.docker_image,
                "-np", str(np)
            ]
            if serial:
                cmd.append("-serial")
            cmd.append("/data/config.json")

            logger.info("Launching Docker container to run Palace simulation...")
            logger.info("Docker command: %s", " ".join(cmd))
            start_time = time.perf_counter()

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=self.timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.error("Palace simulation timed out after %.2f seconds. Terminating process...", self.timeout_seconds)
                try:
                    proc.terminate()
                    await proc.wait()
                except Exception as ex:
                    logger.warning("Failed to terminate timed out Palace process: %s", ex)
                raise PalaceRunnerError(f"Palace simulation timed out after {self.timeout_seconds}s.")

            runtime = time.perf_counter() - start_time
            stdout = stdout_bytes.decode(errors="replace")
            stderr = stderr_bytes.decode(errors="replace")

            logger.info("Palace simulation completed in %.2f seconds with exit code %d.", runtime, proc.returncode)
            if stdout:
                logger.info("Palace stdout:\n%s", stdout)
            if stderr:
                logger.warning("Palace stderr:\n%s", stderr)

            if proc.returncode != 0:
                raise PalaceRunnerError(
                    f"Palace solver container exited with non-zero code {proc.returncode}.\n"
                    f"Stdout:\n{stdout}\n"
                    f"Stderr:\n{stderr}"
                )

            # Discover and verify output files existence
            solver_type = config_data.get("Problem", {}).get("Type", "Eigenmode").lower()
            logger.info("Discovering Palace simulation output files in: %s", output_dir)
            
            # Inspect output directory structure immediately after Palace exits
            for path in output_dir.rglob("*"):
                logger.info(f"FOUND: {path}")

            if solver_type == "eigenmode":
                eig_file = output_dir / "eig.csv"
                if not eig_file.exists():
                    logger.error("Required output file 'eig.csv' not found.")
                    raise PalaceRunnerError(f"Palace simulation succeeded but expected output file 'eig.csv' is missing at: {eig_file}")
                logger.info("Discovered output file: %s", eig_file)

                epr_file = output_dir / "port-EPR.csv"
                if epr_file.exists():
                    logger.info("Discovered optional EPR file: %s", epr_file)
                else:
                    logger.warning("Optional EPR file 'port-EPR.csv' not found.")
            elif solver_type == "electrostatic":
                c_file = output_dir / "terminal-C.csv"
                if not c_file.exists():
                    logger.error("Required output file 'terminal-C.csv' not found.")
                    raise PalaceRunnerError(f"Palace simulation succeeded but expected output file 'terminal-C.csv' is missing at: {c_file}")
                logger.info("Discovered output file: %s", c_file)

            return {
                "output_dir": output_dir,
                "stdout": stdout,
                "stderr": stderr,
                "runtime_seconds": runtime,
                "temp_dir_obj": temp_dir_obj,
            }

        except Exception as e:
            # Clean up temp dir if we encountered an error during setup/execution
            temp_dir_obj.cleanup()
            if isinstance(e, PalaceRunnerError):
                raise e
            raise PalaceRunnerError(f"Failed to execute Palace runner: {e}") from e
