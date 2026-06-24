import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">System Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller Quantum Studio is built using a modern, scalable microservices architecture designed to decouple the lightweight visual frontend from the computationally intensive physics backend.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="System Architecture Overview" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Frontend: React & WebGL</h2>
      <p className="text-slate-600 mb-6">
        The user interface is a Single Page Application (SPA) built with React and TypeScript. The infinite canvas is rendered using WebGL to guarantee 60fps performance even when viewing masks with over 100,000 polygon vertices.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Backend: Python & Rust</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>FastAPI Gateway:</strong> Handles REST endpoints, authentication, and WebSocket streaming.</li>
        <li><strong>Qiskit Metal Wrapper:</strong> A dedicated Python service that translates the QCLang JSON AST into Qiskit Metal Python classes to generate the raw GDSII files.</li>
        <li><strong>Rust DRC Engine:</strong> A highly optimized WebAssembly-compatible Rust binary that performs boolean polygon intersections for Design Rule Checking.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Simulation Cluster</h2>
      <p className="text-slate-600 mb-6">
        When a user triggers a Palace FEA simulation, the FastAPI backend places a task in a Redis queue. A fleet of AWS EC2 instances auto-scales to consume these tasks, running the MPI-distributed Palace C++ binaries and writing the resulting S-parameters back to a PostgreSQL database.
      </p>
    </div>
  );
}