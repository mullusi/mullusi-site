/*
Purpose: run the Mullusi simulated govern evaluation in the browser.
Governance scope: deterministic demo-only verdict generation with no server proof stamp.
Dependencies: sim-form markup and browser form events.
Invariants: no network access, no live runtime claim, invalid actions are blocked with explicit reason text.
*/

(() => {
      const form = document.getElementById("sim-form");
      const allowed = new Set(["transfer_funds", "read_balance", "deploy_gateway"]);
      let counter = 1;

      const evaluate = (action, balance, amount, lineage) => {
        const trace = [
          "01 Observe — action \"" + action + "\" with balance " + balance + ", amount " + amount + ".",
          "02 Activate symbols — Σ(action), Λ(policy, budget, causality) bound.",
        ];
        let verdict = "pass";
        let reason = "All constraints satisfied.";

        if (!allowed.has(action)) {
          verdict = "violation";
          reason = "policy: action \"" + action + "\" is not permitted.";
          trace.push("03 Propagate — policy constraint Λ rejected the action.");
        } else if (action === "transfer_funds" && amount > balance) {
          verdict = "violation";
          reason = "budget: amount " + amount + " exceeds balance " + balance + ".";
          trace.push("03 Propagate — budget constraint exceeded before execution.");
        } else if (!lineage) {
          verdict = "violation";
          reason = "causality: effect declared without lineage.";
          trace.push("03 Propagate — causality constraint Λ requires declared lineage.");
        } else {
          trace.push("03 Propagate — budget, policy, and causality constraints held.");
        }

        trace.push(
          verdict === "pass"
            ? "04 Settle — stable judgment; no unsafe transition."
            : "04 Settle — unsafe transition blocked before any effect ran."
        );
        trace.push("05 Stamp — proof stamp NOT issued (runtime AwaitingEvidence).");

        return {
          payload: {
            verdict: verdict,
            reason: reason,
            trace_ref: "sim-" + String(counter++).padStart(4, "0"),
            proof_stamp: "not issued (AwaitingEvidence)",
            simulated: true,
          },
          trace: trace,
        };
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const action = document.getElementById("action").value;
        const balance = Number(document.getElementById("balance").value) || 0;
        const amount = Number(document.getElementById("amount").value) || 0;
        const lineage = document.getElementById("lineage").checked;
        const out = evaluate(action, balance, amount, lineage);

        const verdictEl = document.getElementById("verdict");
        verdictEl.textContent = out.payload.verdict;
        verdictEl.className = "verdict " + out.payload.verdict;

        document.getElementById("payload").textContent = JSON.stringify(out.payload, null, 2);

        const traceEl = document.getElementById("trace");
        traceEl.innerHTML = "";
        for (const step of out.trace) {
          const li = document.createElement("li");
          li.textContent = step;
          traceEl.appendChild(li);
        }

        document.getElementById("result").hidden = false;
      });
    })();
