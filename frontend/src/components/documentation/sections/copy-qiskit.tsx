import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Copy Qiskit Metal Snippets</h1>
      <p className="text-lg text-slate-600 mb-8">
        If you prefer working in Jupyter Notebooks rather than the visual GUI, you can instantly extract the Qiskit Metal Python code for any selected component or your entire graph.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Component Extraction</h2>
      <p className="text-slate-600 mb-6">
        Right-click any component on the canvas and select <strong>Copy Python Snippet</strong>. This copies a fully instantiated Qiskit Metal class definition to your clipboard, perfectly matching the visual parameters you set.
      </p>

      <CodeBlock language="python" code={`# Copied from Silicofeller GUI
from qiskit_metal.qlibrary.qubits.transmon_pocket import TransmonPocket

q1 = TransmonPocket(design, 'Q1', options=dict(
    pos_x='-1.5mm', 
    pos_y='0.0mm', 
    pad_width='425um', 
    pad_gap='30um'
))
gui.rebuild()
`} />

      <AlertBox type="info" title="Full Project Export">
        To export the entire project graph (including all nets, routing logic, and global variables), use the <strong>Export &gt; Qiskit Metal Script</strong> function from the main toolbar.
      </AlertBox>
    </div>
  );
}