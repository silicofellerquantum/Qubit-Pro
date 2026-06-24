import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">FastAPI and Pydantic</h1>
      <p className="text-lg text-slate-600 mb-8">
        The backend API is built entirely on FastAPI, an incredibly performant ASGI web framework for Python.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why FastAPI?</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Async Native:</strong> Allows a single worker to handle thousands of concurrent WebSocket connections for real-time collaborative editing without blocking threads.</li>
        <li><strong>Automatic Docs:</strong> Swagger UI and ReDoc are generated automatically, keeping our API documentation perfectly synced with the codebase.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Pydantic Data Validation</h2>
      <p className="text-slate-600 mb-6">
        Pydantic guarantees that any incoming QCLang JSON string matches the required schema before the physics engine ever touches it.
      </p>

      <CodeBlock language="python" code={`from pydantic import BaseModel, Field

class TransmonComponent(BaseModel):
    id: str
    pos_x: str = Field(pattern=r'^[-+]?[0-9]*\.?[0-9]+[a-z]+$')
    cross_width: str
    
    # If the user sends "pos_x": 50 (integer), 
    # FastAPI automatically rejects it with a 422 Unprocessable Entity error.`} />
    </div>
  );
}