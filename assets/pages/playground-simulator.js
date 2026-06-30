/*
Purpose: run the Mullusi simulated govern evaluation in the browser.
Governance scope: deterministic demo-only verdict generation with no server proof stamp.
Dependencies: sim-form markup and browser form events.
Invariants: no network access, no live runtime claim, invalid actions are blocked with explicit reason text.
*/

(() => {
  const allowedActions = new Set([
    "approve_release_note",
    "review_vendor_invoice",
    "gate_github_change",
    "review_support_action",
  ]);
  let traceCounter = 1;

  const scenarioLabels = Object.freeze({
    approve_release_note: "Approve a release note",
    review_vendor_invoice: "Review a vendor invoice",
    gate_github_change: "Gate a repository change",
    review_support_action: "Review a customer support action",
    bypass_review: "Bypass review and execute",
  });

  function evaluate(action, riskScore, evidenceAttached, reviewerSelected) {
    const boundedRiskScore = Math.min(Math.max(Number(riskScore) || 1, 1), 10);
    const scenarioLabel = scenarioLabels[action] || action;
    const trace = [
      `01 Request - ${scenarioLabel} with risk score ${boundedRiskScore}.`,
      "02 Plan - proposed action, constraints, evidence, and reviewer state are made visible.",
    ];
    let verdict = "pass";
    let reason = "Review constraints satisfied; action may move to the next approved step.";

    if (!allowedActions.has(action)) {
      verdict = "violation";
      reason = `policy: scenario "${scenarioLabel}" is not permitted.`;
      trace.push("03 Review - policy blocks attempts to bypass review.");
    } else if (!evidenceAttached) {
      verdict = "violation";
      reason = "evidence: action cannot proceed without attached evidence.";
      trace.push("03 Review - evidence constraint blocked the action before execution.");
    } else if (!reviewerSelected) {
      verdict = "hold";
      reason = "approval: choose a human reviewer before the action can move forward.";
      trace.push("03 Review - approval constraint requires a named reviewer.");
    } else if (action === "review_vendor_invoice" && boundedRiskScore >= 8) {
      verdict = "hold";
      reason = "risk: high-value invoice review needs a second approval path.";
      trace.push("03 Review - high money-risk score escalated the action for another approval.");
    } else if (action === "review_support_action" && boundedRiskScore >= 8) {
      verdict = "hold";
      reason = "risk: customer-impacting support action needs a second approval path.";
      trace.push("03 Review - customer-impact risk escalated the action for another approval.");
    } else {
      trace.push("03 Review - evidence, reviewer, policy, and risk constraints held.");
    }

    trace.push(
      verdict === "pass"
        ? "04 Record - simulated approval record is ready for inspection."
        : "04 Record - proposed action stays blocked or held before any effect ran.",
    );
    trace.push("05 Stamp - proof stamp not issued; runtime service is not open.");

    return {
      payload: {
        proof_stamp: "not issued",
        reason,
        risk_score: boundedRiskScore,
        scenario: scenarioLabel,
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
      const riskScore = Number(document.getElementById("risk").value) || 1;
      const evidenceAttached = document.getElementById("lineage").checked;
      const reviewerSelected = document.getElementById("reviewer").checked;
      renderResult(evaluate(action, riskScore, evidenceAttached, reviewerSelected));
    });
  }

  window.MullusiPlaygroundSimulator = Object.freeze({
    evaluate,
    init,
  });
})();
