import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Build the Client from Source</h1>
      <p className="text-lg text-slate-600 mb-8">
        For enterprise users needing strict security audits or custom proxy configurations, the Silicofeller Python Client can be built directly from the source code.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Prerequisites</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li>Python 3.10+</li>
        <li>Rust Toolchain (cargo) for compiling the QCLang parser bindings.</li>
        <li>Git</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Compilation Steps</h2>
      <CodeBlock language="bash" code={`# 1. Clone the repository
git clone https://github.com/silicofeller/silicofeller-client.git
cd silicofeller-client

# 2. Build the Rust extensions
python -m pip install setuptools-rust
python setup.py build_ext --inplace

# 3. Install in development mode
pip install -e .`} />

      <AlertBox type="warning" title="Windows Users">
        If you are building on Windows, ensure you have the Visual Studio C++ Build Tools installed before compiling the Rust extensions, otherwise `cargo` will fail to link the binaries.
      </AlertBox>
    </div>
  );
}