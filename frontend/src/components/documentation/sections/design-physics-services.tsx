import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design & Physics Services</h1>
      <p className="text-lg text-slate-600 mb-8">
        The heavy lifting of quantum design happens asynchronously in isolated worker containers.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/validation_drc_1782265191432.png" alt="Physics Services" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Qiskit Metal Translation Layer</h2>
      <p className="text-slate-600 mb-6">
        When a DRC check or GDSII export is requested, the Python Celery worker consumes the QCLang JSON. It dynamically instantiates Qiskit Metal Python objects in memory, essentially "rebuilding" the user's schematic programmatically.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Simulation Orchestration</h2>
      <p className="text-slate-600 mb-6">
        For finite element analysis (FEA), the system must orchestrate an MPI job across multiple EC2 instances.
      </p>

      <AlertBox type="warning" title="Memory Limits">
        The Palace adapter generates Gmsh files that can easily exceed 50GB of RAM. The physics service is configured with a memory threshold watch; if the mesher exceeds the node's limit, it fails gracefully and reports an 'OOM Error' to the frontend rather than crashing the entire cluster.
      </AlertBox>
    </div>
  );
}