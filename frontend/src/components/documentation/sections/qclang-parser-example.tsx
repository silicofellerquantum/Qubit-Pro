import React from "react";

// Small QCLang parser example demonstrating tokenization and AST generation
export default function QCLangParserExample() {
  const code = `
  // Simple QCLang program
  qubit q0
  h q0
  cx q0, q1
  `;

  // Very naive tokenizer
  const tokens = code
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Mock AST generation
  const ast = tokens.map((t, i) => ({ type: i % 2 === 0 ? "keyword" : "identifier", value: t }));

  return (
    <div className="p-6 bg-gray-50 border border-black/5 rounded-lg">
      <h2 className="text-xl font-bold mb-4">QCLang Parser Example</h2>
      <pre className="bg-white p-3 rounded" style={{ overflowX: "auto" }}>{code}</pre>
      <h3 className="mt-4 font-semibold">Tokens</h3>
      <ul className="list-disc list-inside">
        {tokens.map((t, idx) => (
          <li key={idx}>{t}</li>
        ))}
      </ul>
      <h3 className="mt-4 font-semibold">Mock AST</h3>
      <pre className="bg-white p-3 rounded" style={{ overflowX: "auto" }}>{JSON.stringify(ast, null, 2)}</pre>
    </div>
  );
}
