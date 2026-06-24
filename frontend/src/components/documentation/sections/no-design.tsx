import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">No Design Generated</h1>
      <p className="text-lg text-slate-600 mb-8">
        You clicked "Generate" in the Design Copilot, but the canvas remains empty.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Step-by-Step Fixes</h2>
      
      <div className="space-y-6 mb-10">
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">1. Check AI Quotas</h3>
          <p className="text-slate-600">The LLM generation service has strict rate limits. If you've requested 50 designs in the last hour, the API will silently reject the prompt. Check the notification bell for a "Rate Limit Exceeded" alert.</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">2. Unparseable Response</h3>
          <p className="text-slate-600">Sometimes the LLM outputs malformed QCLang JSON. Press `Ctrl + Shift + J` to open the developer console. If you see a `SyntaxError: Unexpected token`, it means the generation failed structurally. Try rephrasing your prompt to be more explicit (e.g., "Generate exactly 3 transmons").</p>
        </div>
      </div>

      <AlertBox type="tip" title="Use Templates Instead">
        If the Copilot is completely unresponsive, navigate to the <strong>Code Editor</strong> tab and paste a standard layout from the <em>QCLang Examples & Templates</em> documentation to jumpstart your workspace manually.
      </AlertBox>
    </div>
  );
}