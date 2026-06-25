FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for GMSH and Docker CLI
RUN apt-get update && apt-get install -y \
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

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy and install physics_analysis package
COPY physics_analysis/ ./physics_analysis/
RUN pip install --no-cache-dir ./physics_analysis

# Copy source
COPY . .

# Use Postgres in production (override via env)
ENV DATABASE_URL=postgresql+asyncpg://postgres:password@db:5432/quantum_studio

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
