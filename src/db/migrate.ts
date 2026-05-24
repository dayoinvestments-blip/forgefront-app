/**
 * ForgeFront Database Migration
 *
 * Run once to set up the database schema:
 *   npm run db:migrate
 *
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS throughout.
 * Tables: users, sessions, contracts_cache, jobs, invoices, invoice_line_items,
 *         crew_members, certifications, bids, audit_log
 */
import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from './pool';
import bcrypt from 'bcryptjs';

async function migrate() {
  console.log('🔧 ForgeFront — Running database migration...\n');

  // ── Users ───────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      company       TEXT NOT NULL DEFAULT '',
      phone         TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('superuser','admin','support','user')),
      tier          TEXT NOT NULL DEFAULT 'free'
                    CHECK (tier IN ('free','base','pro')),
      tier_expires_at TIMESTAMPTZ,
      sdvosb        BOOLEAN NOT NULL DEFAULT false,
      naics_codes   TEXT[] NOT NULL DEFAULT '{}',
      set_asides    TEXT[] NOT NULL DEFAULT '{}',
      preferred_states TEXT[] NOT NULL DEFAULT '{}',
      status        TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','deleted')),
      stripe_customer_id TEXT,
      revenuecat_id TEXT,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('  ✅ users');

  // ── Sessions ─────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  console.log('  ✅ sessions');

  // ── Password reset tokens ────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      used       BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('  ✅ password_reset_tokens');

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      client       TEXT NOT NULL,
      value        NUMERIC(12,2) NOT NULL DEFAULT 0,
      invoiced     NUMERIC(12,2) NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('active','pending','review','complete')),
      phase        TEXT NOT NULL DEFAULT '',
      start_date   DATE,
      estimated_end DATE,
      notes        TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  `);
  console.log('  ✅ jobs');

  // ── Invoices ─────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,
      invoice_number    TEXT NOT NULL UNIQUE,
      client            TEXT NOT NULL,
      client_email      TEXT NOT NULL DEFAULT '',
      client_address    TEXT NOT NULL DEFAULT '',
      issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date          DATE NOT NULL,
      subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
      tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
      total             NUMERIC(12,2) NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','paid','overdue')),
      notes             TEXT NOT NULL DEFAULT '',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  `);
  console.log('  ✅ invoices');

  // ── Invoice Line Items ───────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL DEFAULT '',
      quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id);
  `);
  console.log('  ✅ invoice_line_items');

  // ── Crew Members ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS crew_members (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_crew_user_id ON crew_members(user_id);
  `);
  console.log('  ✅ crew_members');

  // ── Certifications ───────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS certifications (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      issuer         TEXT NOT NULL DEFAULT '',
      issued_date    DATE,
      expires_at     DATE NOT NULL,
      cert_number    TEXT NOT NULL DEFAULT '',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_certs_crew ON certifications(crew_member_id);
    CREATE INDEX IF NOT EXISTS idx_certs_expires ON certifications(expires_at);
  `);
  console.log('  ✅ certifications');

  // ── Bids / Proposals ─────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS bids (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_bids_user_id ON bids(user_id);
    CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);
  `);
  console.log('  ✅ bids');

  // ── Contracts Cache ──────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS contracts_cache (
      id                  TEXT PRIMARY KEY,
      source              TEXT NOT NULL,
      title               TEXT NOT NULL,
      agency              TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_cache_source ON contracts_cache(source);
    CREATE INDEX IF NOT EXISTS idx_cache_naics ON contracts_cache(naics_code);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON contracts_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_cache_set_aside ON contracts_cache(set_aside);
  `);
  console.log('  ✅ contracts_cache');

  // ── Audit Log ────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
      action     TEXT NOT NULL,
      entity     TEXT NOT NULL DEFAULT '',
      entity_id  TEXT NOT NULL DEFAULT '',
      metadata   JSONB,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);
  console.log('  ✅ audit_log');

  // ── Updated_at trigger ───────────────────────────────────────────────────────
  await query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;
  `);
  for (const table of ['users','jobs','invoices','crew_members','bids']) {
    await query(`
      DROP TRIGGER IF EXISTS trg_${table}_updated ON ${table};
      CREATE TRIGGER trg_${table}_updated
      BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);
  }
  console.log('  ✅ updated_at triggers');

  console.log('\n✅ Migration complete.\n');
  await pool.end();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
