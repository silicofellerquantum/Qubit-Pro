import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Interactive OpenAPI Reference</h1>
      <p className="text-lg text-slate-600 mb-8">
        Access the full Swagger/ReDoc portal for comprehensive schema definitions.
      </p>
      
      <AlertBox type="tip" title="External Portal">
        The interactive portal is hosted separately at <code>api.silicofeller.com/docs</code>.
      </AlertBox>
    </div>
  );
}
