import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Foundry Rule Decks</h1>
      <p className="text-lg text-slate-600 mb-8">
        Manage custom DRC constraints for proprietary fab facilities.
      </p>

      <h2 className="text-2xl font-bold mb-4">Custom Rule JSON</h2>
      <p className="text-slate-600">
        Administrators can upload custom JSON rule decks that override the default minimum geometries and maximum bounding boxes, ensuring that designers cannot create layouts that exceed the capability of your internal cleanroom.
      </p>
    </div>
  );
}
