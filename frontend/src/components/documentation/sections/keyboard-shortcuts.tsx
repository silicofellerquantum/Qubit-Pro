import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Keyboard Shortcuts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Accelerate your layout workflow by mastering the canvas hotkeys.
      </p>

      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Action</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Windows / Linux</th>
              <th className="px-6 py-4 font-semibold text-slate-900">macOS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Pan Canvas</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Middle-Click Drag</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Space + Drag</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Zoom Canvas</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Mouse Wheel</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Pinch Trackpad</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Select Tool (Pointer)</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">V</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">V</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Wire Tool (Route)</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">W</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">W</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Duplicate Selection</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Ctrl + D</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Cmd + D</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Rotate Component 90°</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">R</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">R</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Run Quick DRC</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">F5</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Cmd + R</kbd></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}