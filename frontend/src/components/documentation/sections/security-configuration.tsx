import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Security & Deployment Guidelines</h1>
      <p className="text-lg text-slate-600 mb-8">
        Quantum IP is highly sensitive. Whether deploying via Docker or using the cloud service, you must secure your instance properly.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Cloud Data Encryption</h2>
      <p className="text-slate-600 mb-6">
        All QCLang ASTs and simulation results stored in the Silicofeller Cloud are encrypted at rest using AES-256. Database volumes are managed by AWS RDS with KMS encryption keys.
      </p>

      <AlertBox type="warning" title="ITAR / Export Controls">
        In many jurisdictions, advanced quantum processor layouts are restricted by export controls (e.g., ITAR in the US). If your project falls under these regulations, you <strong>cannot</strong> use the public SaaS cloud. You must deploy the on-premise Docker stack within your organization's air-gapped intranet.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Securing Local Deployments</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Change Default Passwords:</strong> The Docker Compose file includes default PostgreSQL and Redis credentials. Change these immediately using environment variables before running in production.</li>
        <li><strong>Reverse Proxy:</strong> Do not expose the FastAPI backend directly to the internet. Always place it behind a reverse proxy like Nginx or Traefik, configured with strict TLS 1.3 certificates.</li>
        <li><strong>Rotate JWT Secrets:</strong> Ensure the `JWT_SECRET` environment variable is generated securely (`openssl rand -hex 32`) and rotated regularly.</li>
      </ul>
    </div>
  );
}