import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Generate Foundry Package</h1>
      <p className="text-lg text-slate-600 mb-8">
        Bundles the GDSII, DRC Report, and metadata into a secure .tar.gz payload.
      </p>

      <AlertBox type="info" title="Automated FTP">
        If configured, the platform can automatically securely FTP the generated package directly to your contracted foundry partner.
      </AlertBox>
    </div>
  );
}
