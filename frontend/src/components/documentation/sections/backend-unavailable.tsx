import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Backend Unavailable</h1>
      <p className="text-lg text-slate-600 mb-8">
        Resolving issues when the frontend cannot communicate with the API.
      </p>

      <div className="bg-rose-50 border-l-4 border-rose-500 p-5 mb-8 rounded-r-xl">
        <h3 className="text-rose-800 font-bold mb-1">Error Symbol</h3>
        <p className="text-rose-700 text-sm">A red "Disconnected" pill appears in the top right of the navigation bar, and the visual editor refuses to save changes.</p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Common Causes</h2>
      <ul className="list-disc pl-6 space-y-4 text-slate-600 mb-8">
        <li>
          <strong>CORS Policy Block:</strong> If you are running the frontend on `localhost:3000` but your `.env` file points to the production API, the browser will block the request. Ensure `NEXT_PUBLIC_API_URL` is set to `http://localhost:8000`.
        </li>
        <li>
          <strong>Docker Networking:</strong> If running via Docker Compose, ensure the `backend` container is fully healthy. Run `docker-compose ps`. If it's restarting in a loop, it usually means the database container isn't ready yet or the `DATABASE_URL` is incorrect.
        </li>
        <li>
          <strong>VPN / Proxy Interference:</strong> Corporate firewalls occasionally block WebSocket connections (`wss://`), falling back to slow HTTP polling. Check your browser network tab for WS connection timeouts.
        </li>
      </ul>
    </div>
  );
}