/**
 * ForgeFront Database Seed
 *
 * Run after migration to create the founder superuser account and sample data:
 *   npm run db:seed
 *
 * THIS IS YOUR PERMANENT LOGIN:
 *   Email:    darrelltwillis@hotmail.com
 *   Password: (set via FOUNDER_PASSWORD env var, or defaults to ForgeFront2026!)
 */
import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from './pool';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const FOUNDER_EMAIL    = 'darrelltwillis@hotmail.com';
const FOUNDER_NAME     = 'LaDarrell Willis';
const FOUNDER_COMPANY  = 'NextGen Welding & Fabrication LLC';
const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD || 'ForgeFront2026!';

async function seed() {
  console.log('🌱 ForgeFront — Seeding database...\n');

  // ── Founder / Superuser ─────────────────────────────────────────────────────
  const existing = await query('SELECT id FROM users WHERE email = $1', [FOUNDER_EMAIL]);
  let founderId: string;

  if (existing.rows.length > 0) {
    founderId = existing.rows[0].id;
    console.log(`  ⚡ Founder account already exists — updating password & role`);
    const hash = await bcrypt.hash(FOUNDER_PASSWORD, 12);
    await query(`
      UPDATE users SET
        password_hash = $1,
        role = 'superuser',
        tier = 'pro',
        tier_expires_at = NOW() + INTERVAL '100 years',
        sdvosb = true,
        naics_codes = ARRAY['332312','238190'],
        set_asides = ARRAY['SDVOSB','VOSB'],
        preferred_states = ARRAY['LA','TX','AR'],
        status = 'active'
      WHERE id = $2
    `, [hash, founderId]);
  } else {
    founderId = uuid();
    const hash = await bcrypt.hash(FOUNDER_PASSWORD, 12);
    await query(`
      INSERT INTO users (
        id, email, password_hash, name, company, role, tier, tier_expires_at,
        sdvosb, naics_codes, set_asides, preferred_states, status
      ) VALUES ($1,$2,$3,$4,$5,'superuser','pro',NOW() + INTERVAL '100 years',
                true, ARRAY['332312','238190'], ARRAY['SDVOSB','VOSB'],
                ARRAY['LA','TX','AR'], 'active')
    `, [founderId, FOUNDER_EMAIL, hash, FOUNDER_NAME, FOUNDER_COMPANY]);
    console.log(`  ✅ Founder account created`);
  }

  console.log(`\n  📧 Email:    ${FOUNDER_EMAIL}`);
  console.log(`  🔑 Password: ${FOUNDER_PASSWORD}`);
  console.log(`  ⚡ Role:     SUPERUSER`);
  console.log(`  💎 Tier:     PRO (lifetime)\n`);

  // ── Sample Jobs ──────────────────────────────────────────────────────────────
  const existingJobs = await query('SELECT id FROM jobs WHERE user_id = $1', [founderId]);
  if (existingJobs.rows.length === 0) {
    const sampleJobs = [
      {name:'Minden Welding Shop Build-out',client:'Private Client',value:48000,invoiced:28000,status:'active',phase:'Phase 2 of 3'},
      {name:'USDA Rural Dev Fence Install',client:'USDA Rural Development',value:22000,invoiced:0,status:'pending',phase:'Awaiting materials'},
      {name:'Fort Johnson Gate Fabrication',client:'Dept of Army',value:31000,invoiced:15000,status:'review',phase:'Change order #2'},
    ];
    for (const j of sampleJobs) {
      await query(`
        INSERT INTO jobs (id,user_id,name,client,value,invoiced,status,phase,start_date,estimated_end)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,CURRENT_DATE + INTERVAL '60 days')
      `, [uuid(), founderId, j.name, j.client, j.value, j.invoiced, j.status, j.phase]);
    }
    console.log('  ✅ Sample jobs created (3)');
  } else {
    console.log('  ⏭  Jobs already seeded');
  }

  // ── Sample Crew ──────────────────────────────────────────────────────────────
  const existingCrew = await query('SELECT id FROM crew_members WHERE user_id = $1', [founderId]);
  if (existingCrew.rows.length === 0) {
    const members = [
      {name:'James Willis Sr.',role:'Master Welder / Lead',phone:'318-555-0141'},
      {name:'Marcus Thompson',role:'Fabricator',phone:'318-555-0192'},
      {name:'Devon Carter',role:'Apprentice Welder',phone:'318-555-0257'},
    ];
    for (const m of members) {
      const crewId = uuid();
      await query(`
        INSERT INTO crew_members (id,user_id,name,role,phone,status,hire_date)
        VALUES ($1,$2,$3,$4,$5,'active',CURRENT_DATE - INTERVAL '90 days')
      `, [crewId, founderId, m.name, m.role, m.phone]);

      // Add certs to James (lead welder)
      if (m.name.includes('Willis')) {
        const certs = [
          {name:'AWS Certified Welder (SMAW)', expires: 180},
          {name:'OSHA 30 Construction', expires: 400},
          {name:'CWI — Certified Welding Inspector', expires: 10},
        ];
        for (const c of certs) {
          await query(`
            INSERT INTO certifications (id,crew_member_id,name,expires_at)
            VALUES ($1,$2,$3,CURRENT_DATE + INTERVAL '${c.expires} days')
          `, [uuid(), crewId, c.name]);
        }
      }
      if (m.name.includes('Thompson')) {
        await query(`
          INSERT INTO certifications (id,crew_member_id,name,expires_at)
          VALUES ($1,$2,'OSHA 10 Construction',CURRENT_DATE + INTERVAL '60 days')
        `, [uuid(), crewId]);
      }
    }
    console.log('  ✅ Sample crew created (3 members, certs added)');
  } else {
    console.log('  ⏭  Crew already seeded');
  }

  // ── Demo subscriber accounts ─────────────────────────────────────────────────
  const demoUsers = [
    {email:'marcus@example.com',name:'Marcus Johnson',company:'Johnson Steel Works',role:'user',tier:'pro'},
    {email:'dana@example.com',name:'Dana Reeves',company:'Gulf Fab LLC',role:'support',tier:'base'},
    {email:'kevin@example.com',name:'Kevin Tran',company:'Tran Metal Services',role:'user',tier:'free'},
  ];
  for (const u of demoUsers) {
    const ex = await query('SELECT id FROM users WHERE email = $1', [u.email]);
    if (ex.rows.length === 0) {
      const hash = await bcrypt.hash('Demo2026!', 10);
      await query(`
        INSERT INTO users (id,email,password_hash,name,company,role,tier,sdvosb,naics_codes,set_asides,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,ARRAY['332312'],ARRAY['SDVOSB'],'active')
      `, [uuid(), u.email, hash, u.name, u.company, u.role, u.tier]);
    }
  }
  console.log('  ✅ Demo users seeded (3 accounts, password: Demo2026!)');

  console.log('\n🎉 Seed complete.\n');
  await pool.end();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
