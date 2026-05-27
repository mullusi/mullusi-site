/*
Purpose: boot the Mullusi simulated govern playground.
Governance scope: demo-only simulator startup with explicit no-runtime boundary.
Dependencies: assets/pages/playground-simulator.js and simulator form markup.
Invariants: no network access, no proof stamp issuance, invalid actions remain visibly blocked.
*/

if (!window.MullusiPlaygroundSimulator) {
  throw new Error("Playground simulator module is unavailable.");
}

window.MullusiPlaygroundSimulator.init();
