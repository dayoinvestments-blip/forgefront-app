-- ══════════════════════════════════════════════════════════════════════════════
-- ForgeFront — Complete Setup SQL
-- Paste this entire file into Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Profiles (extends Supabase Auth users) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  company          TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('superuser','admin','support','user')),
  tier             TEXT NOT NULL DEFAULT 'free'
                   CHECK (tier IN ('free','base','pro')),
  tier_expires_at  TIMESTAMPTZ,
  sdvosb           BOOLEAN NOT NULL DEFAULT true,
  naics_codes      TEXT[] NOT NULL DEFAULT ARRAY['332312'],
  set_asides       TEXT[] NOT NULL DEFAULT ARRAY['SDVOSB'],
  preferred_states TEXT[] NOT NULL DEFAULT ARRAY['LA'],
  stripe_customer_id TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','deleted')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, company)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Jobs ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  client         TEXT NOT NULL,
  value          NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoiced       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('active','pending','review','complete')),
  phase          TEXT NOT NULL DEFAULT '',
  start_date     DATE,
  estimated_end  DATE,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON public.jobs(status);

-- ── Invoices ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  invoice_number  TEXT NOT NULL UNIQUE,
  client          TEXT NOT NULL,
  client_email    TEXT NOT NULL DEFAULT '',
  client_address  TEXT NOT NULL DEFAULT '',
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','paid','overdue')),
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON public.invoices(status);

-- ── Invoice Line Items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON public.invoice_line_items(invoice_id);

-- ── Crew Members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crew_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'Crew Member',
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','inactive')),
  hire_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crew_user_id ON public.crew_members(user_id);

-- ── Certifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  issuer         TEXT NOT NULL DEFAULT '',
  issued_date    DATE,
  expires_at     DATE NOT NULL,
  cert_number    TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_certs_crew    ON public.certifications(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_certs_expires ON public.certifications(expires_at);

-- ── Bids / Proposals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bids (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id         TEXT NOT NULL,
  contract_title      TEXT NOT NULL,
  agency              TEXT NOT NULL DEFAULT '',
  solicitation_number TEXT NOT NULL DEFAULT '',
  naics_code          TEXT NOT NULL DEFAULT '',
  set_aside           TEXT NOT NULL DEFAULT '',
  contract_value      NUMERIC(12,2),
  proposal_text       TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','won','lost')),
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bids_user_id ON public.bids(user_id);

-- ── Contracts Cache ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contracts_cache (
  id                  TEXT PRIMARY KEY,
  source              TEXT NOT NULL,
  title               TEXT NOT NULL,
  agency              TEXT NOT NULL DEFAULT '',
  naics_code          TEXT NOT NULL DEFAULT '',
  set_aside           TEXT NOT NULL DEFAULT '',
  value               NUMERIC(12,2),
  response_deadline   TIMESTAMPTZ,
  posted_date         TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'open',
  location_state      TEXT NOT NULL DEFAULT '',
  location_city       TEXT NOT NULL DEFAULT '',
  solicitation_number TEXT NOT NULL DEFAULT '',
  contact_email       TEXT NOT NULL DEFAULT '',
  external_url        TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  raw_data            JSONB,
  cached_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '6 hours'
);

-- ── Audit Log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  metadata   JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_crew_updated BEFORE UPDATE ON public.crew_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_bids_updated BEFORE UPDATE ON public.bids
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;

-- Profiles: users see and edit their own
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Jobs
CREATE POLICY "jobs_all" ON public.jobs FOR ALL USING (auth.uid() = user_id);

-- Invoices
CREATE POLICY "invoices_all" ON public.invoices FOR ALL USING (auth.uid() = user_id);

-- Line items (inherit from invoice)
CREATE POLICY "line_items_all" ON public.invoice_line_items FOR ALL
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid()));

-- Crew
CREATE POLICY "crew_all" ON public.crew_members FOR ALL USING (auth.uid() = user_id);

-- Certifications (inherit from crew)
CREATE POLICY "certs_all" ON public.certifications FOR ALL
  USING (crew_member_id IN (SELECT id FROM public.crew_members WHERE user_id = auth.uid()));

-- Bids
CREATE POLICY "bids_all" ON public.bids FOR ALL USING (auth.uid() = user_id);

-- Contracts cache: all authenticated users can read
CREATE POLICY "cache_select" ON public.contracts_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Audit log: users see own entries
CREATE POLICY "audit_select" ON public.audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED: Create your profile and grant SUPERUSER + PRO
-- Uses your exact UID: 6ec73761-8179-4780-bf58-712bc7140901
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.profiles (
  id, email, name, company, role, tier, tier_expires_at,
  sdvosb, naics_codes, set_asides, preferred_states, status
) VALUES (
  '6ec73761-8179-4780-bf58-712bc7140901',
  'darrelltwillis@hotmail.com',
  'LaDarrell Willis',
  'NextGen Welding & Fabrication LLC',
  'superuser',
  'pro',
  NOW() + INTERVAL '100 years',
  true,
  ARRAY['332312','238190'],
  ARRAY['SDVOSB','VOSB'],
  ARRAY['LA','TX','AR'],
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  role             = 'superuser',
  tier             = 'pro',
  tier_expires_at  = NOW() + INTERVAL '100 years',
  name             = 'LaDarrell Willis',
  company          = 'NextGen Welding & Fabrication LLC',
  sdvosb           = true,
  naics_codes      = ARRAY['332312','238190'],
  set_asides       = ARRAY['SDVOSB','VOSB'],
  preferred_states = ARRAY['LA','TX','AR'],
  status           = 'active';

-- ── Sample Jobs (pre-loaded for your account) ─────────────────────────────────
INSERT INTO public.jobs (user_id, name, client, value, invoiced, status, phase) VALUES
  ('6ec73761-8179-4780-bf58-712bc7140901', 'Minden Welding Shop Build-out',  'Private Client',      48000, 28000, 'active',  'Phase 2 of 3'),
  ('6ec73761-8179-4780-bf58-712bc7140901', 'USDA Rural Dev Fence Install',   'USDA Rural Development', 22000, 0,     'pending', 'Awaiting materials'),
  ('6ec73761-8179-4780-bf58-712bc7140901', 'Fort Johnson Gate Fabrication',  'Dept of Army',        31000, 15000, 'review',  'Change order #2')
ON CONFLICT DO NOTHING;

-- ── Sample Crew ───────────────────────────────────────────────────────────────
WITH crew_insert AS (
  INSERT INTO public.crew_members (user_id, name, role, phone, status) VALUES
    ('6ec73761-8179-4780-bf58-712bc7140901', 'James Willis Sr.',  'Master Welder / Lead', '318-555-0141', 'active'),
    ('6ec73761-8179-4780-bf58-712bc7140901', 'Marcus Thompson',   'Fabricator',           '318-555-0192', 'active'),
    ('6ec73761-8179-4780-bf58-712bc7140901', 'Devon Carter',      'Apprentice Welder',    '318-555-0257', 'active')
  ON CONFLICT DO NOTHING
  RETURNING id, name
)
INSERT INTO public.certifications (crew_member_id, name, expires_at)
SELECT id, cert_name, cert_expires
FROM crew_insert
CROSS JOIN (VALUES
  ('AWS Certified Welder (SMAW)',        CURRENT_DATE + 180),
  ('OSHA 30 Construction',               CURRENT_DATE + 400),
  ('CWI — Certified Welding Inspector',  CURRENT_DATE + 10)
) AS certs(cert_name, cert_expires)
WHERE crew_insert.name = 'James Willis Sr.'
ON CONFLICT DO NOTHING;

-- Verify everything worked
SELECT 'Schema + seed complete ✅' AS status;
SELECT 'Your account: ' || email || ' | Role: ' || role || ' | Tier: ' || tier AS your_account
FROM public.profiles
WHERE id = '6ec73761-8179-4780-bf58-712bc7140901';
