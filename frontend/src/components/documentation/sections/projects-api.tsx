import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Projects API</h1>
      <p className="text-lg text-slate-600 mb-10">
        Manage the lifecycle of your workspace environments programmatically.
      </p>

      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-md text-sm">GET</span>
          <code className="text-lg font-bold text-slate-800">/v1/projects</code>
        </div>
        <p className="text-slate-600 mb-6">Retrieves a paginated list of all projects accessible by your API key.</p>

        <h4 className="font-bold text-slate-900 mb-3 border-b pb-2">Query Parameters</h4>
        <table className="w-full text-left text-sm mb-6 border-collapse">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-3 border-b">Parameter</th>
              <th className="p-3 border-b">Type</th>
              <th className="p-3 border-b">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-3 border-b font-mono text-indigo-600">limit</td>
              <td className="p-3 border-b">integer</td>
              <td className="p-3 border-b">Maximum items to return. Default: 50.</td>
            </tr>
            <tr>
              <td className="p-3 border-b font-mono text-indigo-600">offset</td>
              <td className="p-3 border-b">integer</td>
              <td className="p-3 border-b">Pagination offset.</td>
            </tr>
          </tbody>
        </table>

        <h4 className="font-bold text-slate-900 mb-3">Python Example</h4>
        <CodeBlock language="python" code={`import requests

url = "https://api.silicofeller.com/v1/projects?limit=10"
headers = {"Authorization": "Bearer sk_test_12345"}

response = requests.get(url, headers=headers)
print(response.json())`} />
      </div>

    </div>
  );
}
