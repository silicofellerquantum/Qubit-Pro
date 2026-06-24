import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Docker Compose Deployment</h1>
      <p className="text-lg text-slate-600 mb-8">
        The easiest way to deploy Silicofeller Studio on a local server or private cloud is via our official Docker Compose stack.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The docker-compose.yml</h2>
      <p className="text-slate-600 mb-6">
        This file spins up 5 containers: the React frontend (Nginx), the FastAPI backend, a PostgreSQL database, a Redis queue, and a Celery worker for mesh generation.
      </p>

      <CodeBlock language="yaml" code={`version: '3.8'
services:
  frontend:
    image: silicofeller/studio-ui:latest
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    image: silicofeller/studio-api:latest
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/silicofeller
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis

  worker:
    image: silicofeller/studio-api:latest
    command: celery -A core.tasks worker --loglevel=info
    environment:
      - REDIS_URL=redis://redis:6379/0

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:6-alpine`} />

      <h2 className="text-2xl font-bold mb-4 mt-10">Launch Commands</h2>
      <CodeBlock language="bash" code="docker-compose up -d" />

      <AlertBox type="info" title="Volumes">
        By default, the PostgreSQL and Redis data are ephemeral. For a persistent deployment, ensure you map Docker volumes to the database directories.
      </AlertBox>
    </div>
  );
}