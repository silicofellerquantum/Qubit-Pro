import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Database Layer</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller Quantum Studio relies on a hybrid persistence strategy to handle both structured relational data and massive unstructured simulation blobs.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Primary Data Store (PostgreSQL)</h2>
      <p className="text-slate-600 mb-6">
        We use PostgreSQL with the `JSONB` column type to store the raw QCLang Abstract Syntax Trees.
      </p>
      
      <ul className="space-y-4 mb-8">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Revision History</strong>
          <span className="text-slate-600">Every time a user hits "Save", a new immutable row is created in the `ast_revisions` table. This allows for infinite undo/redo capability and deterministic rollbacks if a Tapeout fails DRC.</span>
        </li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Message Broker (Redis)</h2>
      <p className="text-slate-600 mb-6">
        Redis handles three distinct workloads:
      </p>
      <ol className="list-decimal pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Celery Task Queues:</strong> Routing simulation jobs to available workers.</li>
        <li><strong>Pub/Sub:</strong> Routing WebSocket messages between users in a shared collaborative session.</li>
        <li><strong>Rate Limiting:</strong> Fast incrementing counters for API quotas.</li>
      </ol>

      <h2 className="text-2xl font-bold mb-4 mt-10">Object Storage (AWS S3)</h2>
      <p className="text-slate-600 mb-6">
        Gigabyte-sized GDSII mask files and Palace Touchstone (.s2p) results are never stored in Postgres. They are pushed to S3, and the database merely stores a pre-signed URL reference.
      </p>
    </div>
  );
}