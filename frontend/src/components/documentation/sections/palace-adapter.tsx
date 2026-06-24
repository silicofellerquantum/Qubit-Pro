import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">AWS Palace FEA Adapter</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller integrates natively with <strong>Palace</strong>, an open-source, massively parallel finite element solver for computational electromagnetics developed by AWS.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why Palace?</h2>
      <p className="text-slate-600 mb-6">
        Commercial solvers like Ansys HFSS are incredibly expensive and notoriously difficult to scale across multiple cloud nodes. Palace is built on MFEM and runs natively on HPC clusters via MPI, allowing us to simulate massive 100+ qubit chips by distributing the mesh across dozens of EC2 instances simultaneously.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Automated Configuration</h2>
      <p className="text-slate-600 mb-6">
        You do not need to manually write Palace configuration files. When triggering a simulation, the Silicofeller backend automatically translates your QCLang AST and material selections into the required palace_config.json and generates the volumetric Gmsh files.
      </p>

      <AlertBox type="warning" title="Mesh Quality">
        The accuracy of Palace depends entirely on the quality of the volumetric mesh. If you experience simulation divergence, go back to the Export settings and increase the <strong>Mesh Refinement Level</strong> near the Josephson Junctions.
      </AlertBox>
    </div>
  );
}