import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Physics Tooling</h1>
      <p className="text-lg text-slate-600 mb-8">
        The core domain logic relies heavily on open-source scientific computing libraries.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Qiskit Metal</h2>
      <p className="text-slate-600 mb-6">
        Developed by IBM Quantum, Qiskit Metal provides the fundamental Python classes (e.g., `TransmonCross`, `RouteMeander`) that translate abstract connectivity graphs into raw GDSII geometry.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">NetworkX</h2>
      <p className="text-slate-600 mb-6">
        Before physics simulations run, the DRC engine converts the QCLang AST into a mathematical graph using NetworkX. This allows us to instantly run topological checks, such as identifying isolated "islands" in the ground plane or detecting cyclic routing loops.
      </p>

      <AlertBox type="warning" title="Dependency Management">
        Qiskit Metal has very strict dependencies on specific versions of `gdspy` and `Shapely`. We enforce these via strict version pinning in the `requirements.txt`. Do not upgrade these libraries locally without consulting the core engineering team, as it can cause fatal segmentation faults during GDSII export.
      </AlertBox>
    </div>
  );
}