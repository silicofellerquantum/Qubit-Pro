import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Python Client SDK</h1>
      <p className="text-lg text-slate-600 mb-8">
        The `silicofeller` Python package provides native objects for interacting with the cloud API, allowing you to manipulate QCLang graphs natively in Python.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Installation</h2>
      <CodeBlock language="bash" code="pip install silicofeller" />

      <h2 className="text-2xl font-bold mb-4 mt-10">Basic Authentication and Project Load</h2>
      <CodeBlock language="python" code={`import silicofeller as sf

# Initialize client (uses SILICOFELLER_API_KEY environment variable)
client = sf.Client()

# Load a project from the cloud
project = client.get_project("proj_alpha_v2")

# Modify a parameter programmatically
q1 = project.get_component("Q1")
q1.set_property("cross_width", "32um")

# Save and run DRC
project.save()
results = project.run_drc()

if results.passed:
    print("Ready for fabrication!")
`} />
    </div>
  );
}