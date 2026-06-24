import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Syntax Reference</h1>
      <p className="text-lg text-slate-600 mb-8">
        A comprehensive guide to the lexical rules and grammar of QCLang.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Variables and Mathematics</h2>
      <p className="text-slate-600 mb-6">
        Variables are defined in the `vars {}` block. You can perform standard arithmetic operations within parameter definitions.
      </p>
      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm mb-10">
        vars &#123;<br/>
        &nbsp;&nbsp;base_freq = 5.0 GHz<br/>
        &nbsp;&nbsp;detuning = 150 MHz<br/>
        &#125;<br/>
        <br/>
        component Transmon as Q2 &#125;<br/>
        &nbsp;&nbsp;target_freq: base_freq + detuning<br/>
        &#125;
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Macros and Loops</h2>
      <p className="text-slate-600 mb-6">
        QCLang supports simple `for` loops to instantiate arrays of components rapidly.
      </p>
      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm mb-10">
        for i in 1..5 &#123;<br/>
        &nbsp;&nbsp;component Transmon as Q_$&#123;i&#125; &#123;<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;pos_x: i * 1.5mm<br/>
        &nbsp;&nbsp;&#125;<br/>
        &#125;
      </div>
    </div>
  );
}