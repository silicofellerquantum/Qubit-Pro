import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Parse QCLang</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller provides a standalone Node.js and Python parser for interacting with QCLang files programmatically.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The QCLang AST Compiler</h2>
      <p className="text-slate-600 mb-6">
        The compiler (written in Rust, wrapped in WebAssembly/Python) takes raw `.qcl` text and outputs a strict JSON AST. This is useful for writing custom linters or integrating with your own internal foundry scripts.
      </p>

      <CodeBlock language="javascript" code={`import { parseQCLang } from '@silicofeller/qclang-parser';
import * as fs from 'fs';

const source = fs.readFileSync('my_chip.qcl', 'utf8');
try {
  const ast = parseQCLang(source);
  console.log("Found components:", ast.components.length);
} catch (error) {
  console.error("Syntax Error on line:", error.line);
}`} />

      <AlertBox type="info" title="Strict Typing">
        The parser enforces strict unit typing. If you define a width as `20GHz`, the parser will immediately throw a Type Error before the AST is even generated. Lengths must be in `m, mm, um, nm` and frequencies in `Hz, kHz, MHz, GHz`.
      </AlertBox>
    </div>
  );
}