CREATE TABLE IF NOT EXISTS daily_operations_summaries (
  summary_date date NOT NULL,
  timezone text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  generated_at timestamptz NOT NULL,
  source_state_updated_at timestamptz,
  schema_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  PRIMARY KEY (summary_date, timezone),
  CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS daily_operations_summaries_date_idx
  ON daily_operations_summaries (summary_date DESC);
