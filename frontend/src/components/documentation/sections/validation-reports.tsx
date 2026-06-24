import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validation Reports</h1>
      <p className="text-lg text-slate-600 mb-8">
        A permanent audit trail of all DRC checks run against the design.
      </p>

      <AlertBox type="warning" title="Audit Compliance">
        For ISO-9001 certified fab runs, the Validation Report contains cryptographic hashes of the AST state to prove that the GDSII file matches the validated DRC output.
      </AlertBox>
    </div>
  );
}
