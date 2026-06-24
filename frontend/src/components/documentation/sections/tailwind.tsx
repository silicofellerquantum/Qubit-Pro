import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tailwind CSS and Radix UI</h1>
      <p className="text-lg text-slate-600 mb-8">
        Our UI strikes a balance between rapid development and uncompromised accessibility.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Tailwind CSS</h2>
      <p className="text-slate-600 mb-6">
        We use Tailwind for all styling to maintain a strict design system. Custom colors (like `electric-indigo` and `slate`) are defined in `tailwind.config.js` to match Silicofeller's dark, technical branding.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Radix UI Primitives</h2>
      <p className="text-slate-600 mb-6">
        Building accessible dropdowns, modals, and tooltips from scratch is error-prone. We use Radix UI as the unstyled accessible foundation.
      </p>

      <AlertBox type="tip" title="Design System Pattern">
        Never use raw Radix primitives directly in application code. Always use our wrapped, Tailwind-styled versions exported from the `src/components/ui` folder (e.g., `<Button>`, `<Dialog>`). This ensures visual consistency across the entire Studio.
      </AlertBox>
    </div>
  );
}