-- arthur_system_manifest: single-row live capability snapshot pushed by manifest-writer.js
-- id is always 1 — writer upserts, api reads.

CREATE TABLE IF NOT EXISTS arthur_system_manifest (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  pushed_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Row-level security: public read (anon key), write restricted to service role
ALTER TABLE arthur_system_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manifest_read_public"  ON arthur_system_manifest;
DROP POLICY IF EXISTS "manifest_write_service" ON arthur_system_manifest;

CREATE POLICY "manifest_read_public"
  ON arthur_system_manifest FOR SELECT
  USING (true);

CREATE POLICY "manifest_write_service"
  ON arthur_system_manifest FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed an empty row so the api never returns 404 on first deploy
INSERT INTO arthur_system_manifest (id, payload, pushed_at)
VALUES (1, '{"generated_at":null,"modules":[],"knowledge_files":{"count":0,"by_domain":{}},"graders":{"count":0,"domains":[]},"trajectories_today":0,"eval_score_last":null,"active_engines":[]}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

-- Realtime: enable so browser can subscribe to row updates
ALTER PUBLICATION supabase_realtime ADD TABLE arthur_system_manifest;
