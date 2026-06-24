import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">SQLAlchemy and Alembic</h1>
      <p className="text-lg text-slate-600 mb-8">
        We manage relational data (Users, Workspaces, Project Metadata, Simulation Runs) using SQLAlchemy ORM.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Asynchronous Queries</h2>
      <p className="text-slate-600 mb-6">
        To take full advantage of FastAPI, we use the `asyncpg` driver with SQLAlchemy 2.0. This ensures database I/O never blocks the event loop.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Database Migrations with Alembic</h2>
      <p className="text-slate-600 mb-6">
        Schema changes (e.g., adding a new `fabrication_foundry` column to the Projects table) are managed via Alembic.
      </p>
      
      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm mb-10 shadow-lg">
        # Create a new migration script<br/>
        alembic revision --autogenerate -m "Add foundry column"<br/>
        <br/>
        # Apply to local database<br/>
        alembic upgrade head
      </div>
    </div>
  );
}