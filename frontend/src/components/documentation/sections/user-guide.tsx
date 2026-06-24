import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";
import { DocumentationCard } from "../DocumentationCard";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Advanced Documentation</p>
          <h2>User Guide</h2>
        </div>
      </div>
      
      <p className="text-lg text-[var(--muted)] mb-8">
        In-depth architectural overview and API integration details for User Guide. This module provides researchers and hardware engineers with the necessary tooling to optimize their quantum design lifecycle within the Silicofeller platform.
      </p>

      <h3>Architecture & Implementation</h3>
      <p>
        The <strong>User Guide</strong> sub-system is heavily integrated into the core QuantumChipGen pipeline. When designing superconducting layouts, maintaining precise control over this module ensures high-fidelity qubit operation and minimized decoherence.
      </p>

      <ul>
        <li><strong>Scalability:</strong> Designed to support enterprise-level chip scaling from 5 to 1000+ qubits.</li>
        <li><strong>AI Integration:</strong> Fully observable by the Copilot for automated issue resolution.</li>
        <li><strong>Deterministic Outputs:</strong> Guaranteed reproducible results across compilation runs.</li>
      </ul>

      <AlertBox type="info" title="Best Practices">
        Always ensure that your QCLang definitions strictly adhere to the parameter constraints of User Guide to prevent DRC violations during the synthesis phase.
      </AlertBox>

      <h3>Configuration Example</h3>
      <p>Below is a standard reference implementation used by the Silicofeller synthesis engine for this specific module.</p>
      
      <CodeBlock language="qclang" code={`// Example configuration for User Guide
config.enable('user-guide', true);`} />

      <h3>Advanced Integration</h3>
      <p>
        For enterprise users, the User Guide module provides direct access to the lower-level AST nodes and backend PostgreSQL database entries. When running large-scale parameter sweeps (e.g., Ansys Optimetrics), you can batch-submit configurations via our RESTful API.
      </p>

      <div className="grid grid-cols-2 gap-4 mt-8">
        <DocumentationCard title="API Reference" description="View the backend endpoints for this module." icon="code" href="#api-reference" />
        <DocumentationCard title="Support Tickets" description="Need help with this configuration? Contact enterprise support." icon="bot" href="#support" />
      </div>
    </>
  );
}
