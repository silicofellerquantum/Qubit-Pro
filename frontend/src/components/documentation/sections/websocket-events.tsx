import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">WebSocket Events</h1>
      <p className="text-lg text-slate-600 mb-8">
        For real-time UI updates and collaborative editing, Silicofeller streams JSON payloads over WebSockets.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Connection Protocol</h2>
      <p className="text-slate-600 mb-6">
        Connect via `wss://ws.silicofeller.com/stream`. Authentication is handled via a Bearer token in the connection headers.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Common Event Payloads</h2>
      <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-sm mb-10 shadow-lg">
        // Received when a collaborator moves a component<br/>
        &#123;<br/>
        &nbsp;&nbsp;"type": "GRAPH_MUTATION",<br/>
        &nbsp;&nbsp;"component_id": "Q1",<br/>
        &nbsp;&nbsp;"mutation": &#123;<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;"pos_x": "1200um"<br/>
        &nbsp;&nbsp;&#125;,<br/>
        &nbsp;&nbsp;"user_id": "usr_992x"<br/>
        &#125;
      </div>

      <AlertBox type="info" title="Simulation Progress">
        You can subscribe to the `SIMULATION_TICK` event to stream real-time meshing and solving progress logs directly from the AWS Palace cluster to your custom dashboard.
      </AlertBox>
    </div>
  );
}