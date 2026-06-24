import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Anharmonicity (α)</h1>
      <p className="text-lg text-slate-600 mb-8">
        Anharmonicity determines the "speed limit" of your qubit. It dictates how fast you can apply microwave drive pulses without accidentally exciting the qubit into non-computational states.
      </p>

      <div className="bg-slate-900 text-white p-8 rounded-xl text-center mb-10 shadow-lg">
        <h3 className="text-indigo-300 font-bold mb-2">Fundamental Equation</h3>
        <p className="text-2xl font-serif tracking-widest">{"α = f_12 - f_01 ≈ -E_C"}</p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Transmon Compromise</h2>
      <p className="text-slate-600 mb-6">
        A perfect harmonic oscillator (like an LC circuit) has perfectly equally spaced energy levels. You cannot use it as a qubit because driving the $0 \rightarrow 1$ transition would simultaneously drive $1 \rightarrow 2$, $2 \rightarrow 3$, etc.
      </p>
      <p className="text-slate-600 mb-6">
        The Josephson Junction introduces non-linearity, making the $1 \rightarrow 2$ transition slightly lower in frequency than the $0 \rightarrow 1$ transition. This difference is $\alpha$.
      </p>

      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li>In standard transmons, $\alpha$ is strictly negative and roughly equal to the charging energy $-E_C$.</li>
        <li>Typical values range from <strong>-300 MHz to -200 MHz</strong>.</li>
        <li>If you attempt to apply a microwave pulse shorter than $\sim 20$ ns, the frequency bandwidth of the pulse becomes wide enough to overcome $\alpha$, causing leakage into the $|2\rangle$ state.</li>
      </ul>
    </div>
  );
}