import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Integration</p>
          <h2>Export Formats</h2>
        </div>
      </div>
      <p>
        The Silicofeller platform supports exporting synthesized designs to several industry-standard formats for seamless integration with external tapeout and simulation workflows.
      </p>

      <h3>Qiskit Metal</h3>
      <p>Designs can be exported directly into a Qiskit Metal Python script. This enables researchers familiar with IBM's ecosystem to utilize Metal's renderers (like the Ansys or Gmsh renderers) while taking advantage of Silicofeller's AI and QCLang features.</p>

      <h3>GDSII Layouts</h3>
      <p>For direct fabrication and tapeout, Silicofeller generates highly optimized, hierarchical GDSII files. Polygons are cleanly booleaned, and critical dimensions are preserved down to the nanometer level. This format is immediately ready for e-beam lithography.</p>

      <h3>JSON IR (Intermediate Representation)</h3>
      <p>For custom database integrations, the physical layout graph can be exported as a flat JSON IR structure containing exact coordinates, parameterized bounding boxes, and node connectivity.</p>

      <h3>Visual Exports</h3>
      <p>High-resolution SVGs and PNGs of the physical layout topology can be exported directly from the interactive Viewer for use in research papers and presentations.</p>

      <AlertBox type="info" title="SPICE Netlists">
        SPICE and lumped-element equivalent circuit exports for time-domain simulation are currently in active development.
      </AlertBox>
    </>
  );
}
