import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Databases: SQLite, PostgreSQL, Redis</h1>
      <p className="text-lg text-slate-600 mb-8">
        We utilize different data stores optimized for different environments and workloads.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">PostgreSQL (Production)</h2>
      <p className="text-slate-600 mb-6">
        The heavy-duty primary store for all user and project data in the cloud. It expertly handles concurrent reads/writes and powerful JSONB querying for searching through AST structures.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">SQLite (Local Development)</h2>
      <p className="text-slate-600 mb-6">
        When running the backend locally via `npm run start:local`, the system defaults to a local `app.db` SQLite file. This allows developers to work on the UI without needing to run Docker or configure a local Postgres instance.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Redis (Message Broker)</h2>
      <p className="text-slate-600 mb-6">
        Because HTTP requests are stateless, Redis acts as the glue. It queues tasks for Celery (so a simulation request isn't lost if the server restarts) and manages pub/sub channels for the collaborative WebSocket editor.
      </p>
    </div>
  );
}