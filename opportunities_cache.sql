-- ============================================================================
-- ForgeFront — opportunities_cache table
-- Stores SAM.gov opportunities synced daily so users search this instead of
-- hitting the live API per-search. Run this in Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.opportunities_cache (
  notice_id          TEXT PRIMARY KEY,          -- SAM.gov noticeId (unique, used for upsert)
  title              TEXT,
  solicitation_number TEXT,
  agency             TEXT,                       -- fullParentPathName
  naics_code         TEXT,
  set_aside_code     TEXT,                       -- e.g. SDVOSBC, SBA, 8A
  set_aside_desc     TEXT,
  ptype              TEXT,                        -- procurement type (o, p, k, etc.)
  posted_date        DATE,
  response_deadline  TIMESTAMPTZ,
  state              TEXT,                        -- place of performance state
  city               TEXT,
  description_url     TEXT,                        -- the /noticedesc link for SOW
  ui_link            TEXT,                        -- sam.gov/opp/{id}/view
  poc_name           TEXT,
  poc_email          TEXT,
  poc_phone          TEXT,
  active             BOOLEAN DEFAULT TRUE,
  sub_tier           TEXT,
  office             TEXT,
  inline_description TEXT,                        -- the short SOW text from the CSV Description column
  raw                JSONB,                       -- full record, for anything not columned
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering (the searches users will run)
CREATE INDEX IF NOT EXISTS idx_oppcache_naics      ON public.opportunities_cache(naics_code);
CREATE INDEX IF NOT EXISTS idx_oppcache_setaside   ON public.opportunities_cache(set_aside_code);
CREATE INDEX IF NOT EXISTS idx_oppcache_state      ON public.opportunities_cache(state);
CREATE INDEX IF NOT EXISTS idx_oppcache_posted     ON public.opportunities_cache(posted_date);
CREATE INDEX IF NOT EXISTS idx_oppcache_deadline   ON public.opportunities_cache(response_deadline);
CREATE INDEX IF NOT EXISTS idx_oppcache_active     ON public.opportunities_cache(active);

-- Full-text search on title (for keyword search)
CREATE INDEX IF NOT EXISTS idx_oppcache_title_fts
  ON public.opportunities_cache USING gin(to_tsvector('english', coalesce(title,'')));

-- A small table to track sync runs (so you can see when it last ran + results)
CREATE TABLE IF NOT EXISTS public.sync_log (
  id          BIGSERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  records     INTEGER DEFAULT 0,
  pages       INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'running',           -- running | success | error
  message     TEXT
);

-- Allow public read of the cache (it's public government data), service role writes.
ALTER TABLE public.opportunities_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'opportunities_cache' AND policyname = 'oppcache_public_read'
  ) THEN
    CREATE POLICY oppcache_public_read ON public.opportunities_cache
      FOR SELECT USING (true);
  END IF;
END $$;
