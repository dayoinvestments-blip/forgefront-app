-- ══════════════════════════════════════════════════════════════════════════════
-- ForgeFront — Supabase SQL Schema
-- Paste this entire file into Supabase → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Profiles (extends Supabase Auth users) ────────────────────────────────────
-- Supabase Auth handles login/password/sessions in auth.users
-- This table stores ForgeFront-specific fields linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  company         TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('superuser','admin','support','user')),
  tier            TEXT NOT NULL DEFAULT 'free'
                  CHECK (tier IN ('free','base','pro')),
  tier_expires_at TIMESTAMPTZ,
  sdvosb          BOOLEAN NOT NULL DEFAULT true,
  naics_codes     TEXT[] NOT NULL DEFAULT ARRAY['332312'],
  set_asides      TEXT[] NOT NULL DEFAULT ARRAY['SDVOSB'],
  preferred_states TEXT[] NOT NULL DEFAULT ARRAY['LA'],
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Jobs ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  client        TEXT NOT NULL,
  value         NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoiced      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('active','pending','review','complete')),
  phase         TEXT NOT NULL DEFAULT '',
  start_date    DATE,
  estimated_end DATE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_cache_source   ON public.contracts_cache(source);
CREATE INDEX IF NOT EXISTS idx_cache_naics    ON public.contracts_cache(naics_code);
CREATE INDEX IF NOT EXISTS idx_cache_expires  ON public.contracts_cache(expires_at);

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
CREATE INDEX IF NOT EXISTS idx_audit_user    ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at);

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  PERFORM 1;
  CREATE TRIGGER trg_profiles_updated  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_jobs_updated      BEFORE UPDATE ON public.jobs       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_invoices_updated  BEFORE UPDATE ON public.invoices   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_crew_updated      BEFORE UPDATE ON public.crew_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_bids_updated      BEFORE UPDATE ON public.bids        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Row Level Security (RLS) ──────────────────────────────────────────────────
-- Users can only see and modify their own data
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log      ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Jobs
CREATE POLICY "Users manage own jobs" ON public.jobs FOR ALL USING (auth.uid() = user_id);

-- Invoices
CREATE POLICY "Users manage own invoices" ON public.invoices FOR ALL USING (auth.uid() = user_id);

-- Invoice line items (inherit from invoice ownership)
CREATE POLICY "Users manage own line items" ON public.invoice_line_items FOR ALL
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid()));

-- Crew
CREATE POLICY "Users manage own crew" ON public.crew_members FOR ALL USING (auth.uid() = user_id);

-- Certifications (inherit from crew ownership)
CREATE POLICY "Users manage own certs" ON public.certifications FOR ALL
  USING (crew_member_id IN (SELECT id FROM public.crew_members WHERE user_id = auth.uid()));

-- Bids
CREATE POLICY "Users manage own bids" ON public.bids FOR ALL USING (auth.uid() = user_id);

-- Contracts cache — readable by all authenticated users
CREATE POLICY "Authenticated users can read contracts" ON public.contracts_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Audit log — users see own entries, service_role sees all
CREATE POLICY "Users view own audit log" ON public.audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── Superuser profile update (run AFTER creating your account) ────────────────
-- After you sign up at the app, run this to grant yourself superuser + pro:
-- UPDATE public.profiles
-- SET role = 'superuser', tier = 'pro', tier_expires_at = NOW() + INTERVAL '100 years',
--     name = 'LaDarrell Willis', company = 'NextGen Welding & Fabrication LLC',
--     naics_codes = ARRAY['332312','238190'], set_asides = ARRAY['SDVOSB','VOSB'],
--     preferred_states = ARRAY['LA','TX','AR']
-- WHERE email = 'darrelltwillis@hotmail.com';

SELECT 'ForgeFront schema created successfully ✅' as status;
