import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";
import { DocumentationCard } from "../DocumentationCard";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Learning Path</p>
          <h2>Tutorials Intermediate</h2>
        </div>
      </div>
      
      <p className="text-[var(--muted)] mb-8 leading-relaxed">
        A step-by-step guide to mastering Tutorials Intermediate in the Silicofeller ecosystem. This module provides researchers and hardware engineers with the necessary tooling to optimize their quantum design lifecycle within the Silicofeller platform. It has been built from the ground up to support massive scale, seamless AI integration via the Copilot, and absolute precision down to the nanometer level.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 bg-[#f8f9fa] border border-[#e9ecef] rounded-[16px]">
          <h4 className="font-bold text-lg mb-2">Key Advantages</h4>
          <p className="text-[var(--muted)] text-sm mb-4">Why use this specific module?</p>
          <ul className="list-disc pl-4 space-y-2 text-sm text-[var(--muted)]">
            <li>Guaranteed reproducible results across compilation runs.</li>
            <li>Optimized for cloud-based parallel execution.</li>
            <li>Fully observable by the QuantumChipGen AI Copilot.</li>
          </ul>
        </div>
        <div className="p-6 bg-[#f8f9fa] border border-[#e9ecef] rounded-[16px]">
          <h4 className="font-bold text-lg mb-2">Integration Level</h4>
          <p className="text-[var(--muted)] text-sm mb-4">System requirements and impact.</p>
          <ul className="list-disc pl-4 space-y-2 text-sm text-[var(--muted)]">
            <li><strong>Latency:</strong> &lt; 50ms overhead</li>
            <li><strong>Dependencies:</strong> Core execution engine</li>
            <li><strong>Supported Exporters:</strong> GDSII, Qiskit Metal</li>
          </ul>
        </div>
      </div>

      <h3>Architecture & Implementation Details</h3>
      <p className="mb-6">
        The <strong>Tutorials Intermediate</strong> sub-system is heavily integrated into the core QuantumChipGen pipeline. When designing superconducting layouts, maintaining precise control over this module ensures high-fidelity qubit operation, minimized cross-talk, and reduced dielectric loss tangents. The data structures are serialized via Protobuf before being handed off to the finite element solvers.
      </p>

      <AlertBox type="info" title="Best Practices">
        Always ensure that your QCLang definitions strictly adhere to the parameter constraints of Tutorials Intermediate to prevent Design Rule Checking (DRC) violations during the final synthesis phase.
      </AlertBox>

      <h3 className="mt-10">Parameter Reference</h3>
      <p className="mb-4">The following table outlines the configuration schema available for <code>tutorials-intermediate</code>. These properties can be manipulated directly via QCLang or the Python bindings.</p>
      
      <div className="p-6 bg-white border border-black/10 rounded-xl mb-8">
          <h4 className="font-bold mb-4">Prerequisites</h4>
          <ul className="list-disc pl-5 text-[var(--muted)] space-y-2">
            <li>Silicofeller CLI v2.4.0+</li>
            <li>Basic knowledge of QCLang</li>
            <li>Python 3.10+ installed globally</li>
          </ul>
        </div>

      <h3 className="mt-10">Configuration & Usage</h3>
      <p className="mb-4">Below is a standard reference implementation used by the Silicofeller synthesis engine. It demonstrates how to initialize the Tutorials Intermediate module correctly.</p>
      
      <CodeBlock language="qclang" code={`// Step 1: Initialize your environment
project init --template tutorials-intermediate

// Step 2: Compile
compile .

// Step 3: Run DRC
drc check`} />

      <h3 className="mt-10">Advanced Enterprise Integration</h3>
      <p className="mb-6">
        For enterprise users, the Tutorials Intermediate module provides direct access to the lower-level Abstract Syntax Tree (AST) nodes and backend PostgreSQL database entries. When running large-scale parameter sweeps (e.g., via Ansys Optimetrics or CST Studio Suite), you can batch-submit highly tuned configurations via our RESTful API endpoint, bypassing the UI entirely for massive throughput.
      </p>

      <AlertBox type="warning" title="Warning">
        Modifying internal AST properties directly can lead to physical layout anomalies. Only do this if you are actively bypassing the built-in Copilot validation.
      </AlertBox>
    </>
  );
}
