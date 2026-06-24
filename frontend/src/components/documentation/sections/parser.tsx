import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Parser</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller AST compiler runs entirely in the browser using a WebAssembly-compiled Rust parser.
      </p>

      <AlertBox type="info" title="Performance">
        WASM parsing guarantees instant feedback as you type in the QCLang console, flagging syntax errors before sending payloads to the backend.
      </AlertBox>
    </div>
  );
}
