import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Backend Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        The primary gateway routing all requests between the user and the compute cluster.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Microservice Topology</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>API Gateway (FastAPI):</strong> Handles all incoming HTTP traffic, JWT validation, and rate-limiting.</li>
        <li><strong>WebSocket Manager:</strong> Maintains persistent connections with clients, broadcasting graph mutations for collaborative editing.</li>
        <li><strong>Job Dispatcher:</strong> Evaluates incoming simulation requests, constructs the payload, and pushes it onto the Redis task queue.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Request Lifecycle</h2>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`Client -> [Nginx Load Balancer] -> [FastAPI Gateway]
   |
   +-> 1. Auth Middleware validates JWT
   +-> 2. Pydantic validates incoming QCLang JSON payload
   +-> 3. Rust Extension parses AST for Fatal Syntax Errors
   +-> 4. Payload serialized to PostgreSQL
   +-> 5. 200 OK Response`}
        </pre>
      </div>
    </div>
  );
}