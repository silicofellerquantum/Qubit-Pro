import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Write Effective Design Prompts</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Design Copilot transforms natural language into robust QCLang syntax. Writing precise prompts ensures accurate topology mapping.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-6">
          <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex justify-center items-center text-xs">✓</span> Do
          </h3>
          <ul className="list-disc pl-5 text-emerald-900 text-sm space-y-2">
            <li>Specify exact qubit counts (e.g., "16 qubits").</li>
            <li>Explicitly name the topology ("Heavy Hex").</li>
            <li>Mention frequency targets if critical.</li>
          </ul>
        </div>
        <div className="border border-rose-200 bg-rose-50 rounded-xl p-6">
          <h3 className="font-bold text-rose-800 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 flex justify-center items-center text-xs">✗</span> Don't
          </h3>
          <ul className="list-disc pl-5 text-rose-900 text-sm space-y-2">
            <li>Use ambiguous terms ("Make a large chip").</li>
            <li>Request topologies that aren't mathematically possible (e.g., "7-qubit square grid").</li>
          </ul>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Example Prompt</h2>
      <CodeBlock language="text" code={'Generate a 27-qubit Heavy Hex layout optimized for 5GHz frequency with sapphire substrate overrides.'} />
      
      <AlertBox type="tip" className="mt-8" title="Iterative Refinement">
        If the Copilot hallucinates a connection, simply prompt it again with "Remove the coupler between Q1 and Q5." It maintains conversational context.
      </AlertBox>
    </div>
  );
}
