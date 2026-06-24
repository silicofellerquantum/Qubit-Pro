import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI Tools</p>
          <h2>QuantumChipGen AI Copilot</h2>
        </div>
      </div>
      <p>
        Silicofeller includes a built-in Large Language Model (LLM) fine-tuned specifically on QCLang and superconducting hardware design. This is your personal quantum architecture assistant.
      </p>

      <h3>Natural Language Generation</h3>
      <p>You can generate entire chip architectures simply by describing them to the Copilot.</p>
      
      <CodeBlock language="text" code="Generate a 27-qubit heavy-hex lattice with tunable couplers and multiplexed readout resonators grouped by 4." />

      <p>The Copilot will instantly generate the corresponding, compilation-ready QCLang source code.</p>

      <h3>Design Suggestions & Optimization</h3>
      <p>The Copilot continuously analyzes your QCLang AST in the background. If it detects potential frequency collisions or sub-optimal routing paths, it will offer inline suggestions to optimize the layout before compilation.</p>

      <AlertBox type="tip" title="Prompt Engineering">
        For the best results, be specific about: 1. Qubit Count, 2. Topology Type, 3. Coupler Type (Tunable vs Fixed), and 4. Target Frequencies.
      </AlertBox>

      <h3>Automated Error Fixing</h3>
      <p>When the compiler throws a Design Rule Checking (DRC) error (such as a spacing violation), the Copilot provides a one-click <strong>"Fix with AI"</strong> button that patches your QCLang code automatically.</p>
    </>
  );
}
