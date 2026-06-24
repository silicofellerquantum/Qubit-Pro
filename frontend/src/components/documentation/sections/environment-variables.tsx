import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Environment Variables</h1>
      <p className="text-lg text-slate-600 mb-8">
        Configure the behavior of your local or containerized deployment using the following .env file parameters.
      </p>

      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Variable</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Default</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">DATABASE_URL</td>
              <td className="px-6 py-4 font-mono">postgres://localhost:5432</td>
              <td className="px-6 py-4 text-slate-600">Connection string for the primary PostgreSQL database storing AST versions.</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">REDIS_URL</td>
              <td className="px-6 py-4 font-mono">redis://localhost:6379</td>
              <td className="px-6 py-4 text-slate-600">Connection string for the Celery task queue (used for background simulations).</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">JWT_SECRET</td>
              <td className="px-6 py-4 font-mono">changeme</td>
              <td className="px-6 py-4 text-slate-600">Cryptographic key used to sign authentication tokens. Must be changed in production.</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">ENABLE_PALACE</td>
              <td className="px-6 py-4 font-mono">false</td>
              <td className="px-6 py-4 text-slate-600">Set to true if you have a local MPI cluster configured to run Palace binaries.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}