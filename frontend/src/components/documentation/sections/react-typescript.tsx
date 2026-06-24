import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">React and TypeScript</h1>
      <p className="text-lg text-slate-600 mb-8">
        The entire frontend is built on React 18 using strict TypeScript. This guarantees that UI components accurately reflect the highly structured nature of the QCLang physics schemas.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why TypeScript is Mandatory</h2>
      <p className="text-slate-600 mb-6">
        In a quantum design tool, a `length` property could be `"50um"` (string) or `0.05` (number representing mm). Using raw JavaScript leads to catastrophic layout bugs where components overlap invisibly.
      </p>
      
      <p className="text-slate-600 mb-6">
        Our TypeScript interfaces perfectly mirror the Pydantic models on the backend. We use OpenAPI generators to automatically build the TypeScript types from the FastAPI definitions during every CI/CD build.
      </p>

      <AlertBox type="info" title="Strict Mode">
        The repository enforces `strict: true` in the `tsconfig.json`. No `any` types are permitted in the codebase without an explicit ESLint override comment explaining why the type cannot be statically inferred.
      </AlertBox>
    </div>
  );
}