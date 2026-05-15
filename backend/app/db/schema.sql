/*
Purpose: create the PostgreSQL persistence surface for Mullusi Govern Cloud.
Governance scope: evaluations, violations, trace deltas, and proof-stamp eligibility records.
Dependencies: PostgreSQL 14+ with JSONB support.
Invariants: records are append-only by application contract; repeated deterministic evaluations are idempotent.
*/

CREATE TABLE IF NOT EXISTS govern_evaluations (
  evaluation_id UUID PRIMARY KEY,
  trace_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  proof_state TEXT NOT NULL,
  blocked_phase TEXT,
  proof_stamp_eligible BOOLEAN NOT NULL,
  repair_actions JSONB NOT NULL,
  request_hash TEXT NOT NULL,
  request_body JSONB NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS govern_evaluations_project_created_idx
  ON govern_evaluations (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS govern_evaluations_trace_idx
  ON govern_evaluations (trace_id);

CREATE TABLE IF NOT EXISTS govern_violations (
  violation_id UUID PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES govern_evaluations(evaluation_id),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  constraint_id TEXT NOT NULL,
  level TEXT NOT NULL,
  cause TEXT NOT NULL,
  blocked_phase TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, ordinal)
);

CREATE TABLE IF NOT EXISTS govern_trace_deltas (
  trace_delta_id UUID PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES govern_evaluations(evaluation_id),
  trace_id UUID NOT NULL,
  phase_index INTEGER NOT NULL CHECK (phase_index >= 1),
  phase TEXT NOT NULL,
  delta JSONB NOT NULL,
  judgment JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trace_id, phase_index)
);

CREATE INDEX IF NOT EXISTS govern_trace_deltas_eval_idx
  ON govern_trace_deltas (evaluation_id, phase_index);

CREATE TABLE IF NOT EXISTS proof_stamps (
  proof_stamp_id UUID PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES govern_evaluations(evaluation_id),
  stamp_state TEXT NOT NULL CHECK (stamp_state IN ('eligible', 'issued')),
  stamp_hash TEXT NOT NULL,
  algorithm TEXT,
  signature TEXT,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id)
);
