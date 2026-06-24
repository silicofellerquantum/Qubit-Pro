import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Authentication</h1>
      <p className="text-lg text-slate-600 mb-8">
        All programmatic access to Silicofeller Quantum Studio is secured via API Keys (Bearer Tokens).
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Generating an API Key</h2>
      <ol className="list-decimal pl-6 space-y-4 text-slate-600 mb-10">
        <li>Log into the Silicofeller Dashboard.</li>
        <li>Navigate to <strong>Account Settings &gt; Developer API</strong>.</li>
        <li>Click <strong>Generate New Token</strong>.</li>
        <li>Assign a scope (e.g., `read-only` or `full-access`).</li>
        <li>Copy the token. It will only be displayed once.</li>
      </ol>

      <AlertBox type="warning" title="Security Best Practices">
        Never hardcode your API key into scripts or commit it to GitHub. Always use environment variables or a secure secret manager (like AWS Secrets Manager or HashiCorp Vault).
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Using the Token</h2>
      <p className="text-slate-600 mb-6">
        Pass the token in the `Authorization` header of your HTTP requests.
      </p>
      <CodeBlock language="bash" code="Authorization: Bearer sf_live_xxxxxxxxxxxxxxxxxxxxxx" />
    </div>
  );
}