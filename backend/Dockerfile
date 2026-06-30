# ── Stage 1: Runtime base image with system dependencies ──────────────────────
FROM python:3.11-slim

WORKDIR /app

# Configure Python environment
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/home/appuser/.local/bin:${PATH}"

# Install system dependencies for GMSH, Palace, and rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglu1-mesa \
    libxcursor1 \
    libxinerama1 \
    libxft2 \
    libgomp1 \
    xvfb \
    && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-24.0.7.tgz | tar -xz -C /tmp \
    && mv /tmp/docker/docker /usr/local/bin/ \
    && rm -rf /tmp/docker \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Create a secure, non-privileged system user and group
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup --create-home appuser

# Pre-create workspaces and application directories with correct ownership
RUN mkdir -p /app/workspaces && \
    chown -R appuser:appgroup /app

# Copy dependency manifests
COPY --chown=appuser:appgroup requirements.txt .

# Switch to non-root user for pip installation and runtime execution
USER appuser

# Install python dependencies in the user's home directory
RUN pip install --no-cache-dir --user -r requirements.txt

# Copy and install physics_analysis package
COPY --chown=appuser:appgroup physics_analysis/ ./physics_analysis/
RUN pip install --no-cache-dir --user ./physics_analysis

# Copy remaining application source
COPY --chown=appuser:appgroup . .

# Expose FastAPI's default port
EXPOSE 5000

# Default execution command
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
