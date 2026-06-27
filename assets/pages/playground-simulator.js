/*
Purpose: run the Mullusi simulated govern evaluation in the browser.
Governance scope: deterministic demo-only verdict generation with no server proof stamp.
Dependencies: sim-form markup and browser form events.
Invariants: no network access, no live runtime claim, invalid actions are blocked with explicit reason text.
*/

(() => {
  const allowedActions = new Set(["transfer_funds", "read_balance", "deploy_gateway"]);
  let traceCounter = 1;

  function evaluate(action, balance, amount, lineage) {
    const trace = [
      `01 Observe - action "${action}" with balance ${balance}, amount ${amount}.`,
      "02 Activate symbols - Sigma(action), Lambda(policy, budget, causality) bound.",
    ];
    let verdict = "pass";
    let reason = "All constraints satisfied.";

    if (!allowedActions.has(action)) {
      verdict = "violation";
      reason = `policy: action "${action}" is not permitted.`;
      trace.push("03 Propagate - policy constraint Lambda rejected the action.");
    } else if (action === "transfer_funds" && amount > balance) {
      verdict = "violation";
      reason = `budget: amount ${amount} exceeds balance ${balance}.`;
      trace.push("03 Propagate - budget constraint exceeded before execution.");
    } else if (!lineage) {
      verdict = "violation";
      reason = "causality: effect declared without lineage.";
      trace.push("03 Propagate - causality constraint Lambda requires declared lineage.");
    } else {
      trace.push("03 Propagate - budget, policy, and causality constraints held.");
    }

    trace.push(
      verdict === "pass"
        ? "04 Settle - stable judgment; no unsafe transition."
        : "04 Settle - unsafe transition blocked before any effect ran.",
    );
    trace.push("05 Stamp - proof stamp not issued; runtime state is AwaitingEvidence.");

    return {
      payload: {
        proof_stamp: "not issued (AwaitingEvidence)",
        reason,
        simulated: true,
        trace_ref: `sim-${String(traceCounter++).padStart(4, "0")}`,
        verdict,
      },
      trace,
    };
  }

  function renderTrace(trace) {
    const traceElement = document.getElementById("trace");
    if (!traceElement) return;
    traceElement.innerHTML = "";
    for (const step of trace) {
      const item = document.createElement("li");
      item.textContent = step;
      traceElement.appendChild(item);
    }
  }

  function renderResult(result) {
    const verdictElement = document.getElementById("verdict");
    const reasonElement = document.getElementById("reason");
    const traceRefElement = document.getElementById("trace-ref");
    const payloadElement = document.getElementById("payload");
    const resultElement = document.getElementById("result");
    if (!verdictElement || !reasonElement || !traceRefElement || !payloadElement || !resultElement) {
      throw new Error("Playground result markup is incomplete.");
    }

    verdictElement.textContent = result.payload.verdict;
    verdictElement.className = result.payload.verdict;
    reasonElement.textContent = result.payload.reason;
    traceRefElement.textContent = result.payload.trace_ref;
    payloadElement.textContent = JSON.stringify(result.payload, null, 2);
    renderTrace(result.trace);
    resultElement.hidden = false;
  }

  function init() {
    const form = document.getElementById("sim-form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const action = document.getElementById("action").value;
      const balance = Number(document.getElementById("balance").value) || 0;
      const amount = Number(document.getElementById("amount").value) || 0;
      const lineage = document.getElementById("lineage").checked;
      renderResult(evaluate(action, balance, amount, lineage));
    });
  }

  window.MullusiPlaygroundSimulator = Object.freeze({
    evaluate,
    init,
  });
})();
