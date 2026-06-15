#!/usr/bin/env python3
"""
ForgeFront — Final NAICS fix. Run from repo root.
Patches: netlify/functions/subcontracts.js
         netlify/functions/state-contracts.js
         index.html (client-side NAICS filter)
"""
import os, sys

# ── 1. subcontracts.js — complete rewrite ────────────────────────────────────
print("\n[1/3] Writing netlify/functions/subcontracts.js ...")
SUBCONTRACTS = r"""/**
 * Netlify Function: /api/subcontracts
 * NAICS-aware: tech pool for 511210/541511 etc, fabrication pool for 332312 etc.
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const TECH_NAICS = ['511210','541511','541512','541513','541519','541715','518210','519130'];

const TECH_SUBCONTRACTS = [
  {title:'Software Development Sub — DoD Agency Modernization Portal',        prime:'Booz Allen Hamilton Federal',    value:285000, state:'VA', city:'Arlington',       days:21, sol:'BAH-IT-SUB-2025-VA-044',   naics:'541511'},
  {title:'Cybersecurity Assessment Sub — FISMA Compliance',                   prime:'Leidos Federal Solutions',       value:195000, state:'VA', city:'Reston',           days:14, sol:'LFS-CYBER-2025-VA-019',    naics:'541519'},
  {title:'IT Project Management Sub — DHS Enterprise Systems',                prime:'SAIC Government Services',       value:225000, state:'DC', city:'Washington',       days:18, sol:'SAIC-PM-2025-DC-033',      naics:'541511'},
  {title:'Cloud Migration Sub — Army PEO EIS Systems',                        prime:'General Dynamics IT',            value:380000, state:'VA', city:'Fort Belvoir',     days:25, sol:'GDIT-CLOUD-2025-VA-011',   naics:'541512'},
  {title:'Software Maintenance Sub — State IT Modernization',                 prime:'CACI International',             value:145000, state:'LA', city:'Baton Rouge',      days:10, sol:'CACI-IT-2025-LA-019',      naics:'541511'},
  {title:'Data Analytics Sub — Army Intelligence Systems',                    prime:'Palantir Government Services',   value:320000, state:'VA', city:'Pentagon',         days:28, sol:'PAL-DATA-2025-VA-044',     naics:'541511'},
  {title:'DevSecOps Sub — Air Force CI/CD Pipeline',                          prime:'Peraton Federal Solutions',      value:265000, state:'TX', city:'San Antonio',      days:19, sol:'PER-DEVSEC-2025-TX-055',   naics:'541512'},
  {title:'Cybersecurity Sub — Navy CANES Network Assessment',                 prime:'ManTech International',          value:185000, state:'VA', city:'Norfolk',          days:15, sol:'MANT-CYBER-2025-VA-031',   naics:'541519'},
  {title:'IT Support Sub — Marine Corps Base Camp Lejeune',                   prime:'DXC Technology Federal',         value:125000, state:'NC', city:'Jacksonville',     days:22, sol:'DXC-IT-2025-NC-044',       naics:'541511'},
  {title:'Software Development Sub — Army Intelligence Platform',             prime:'Engility Holdings',              value:295000, state:'GA', city:'Augusta',          days:31, sol:'ENG-SW-2025-GA-077',       naics:'541511'},
  {title:'Network Infrastructure Sub — Keesler AFB IT Systems',               prime:'Unison Technologies',            value:165000, state:'MS', city:'Biloxi',           days:20, sol:'UNI-NET-2025-MS-033',      naics:'541512'},
  {title:'IT Modernization Sub — Redstone Arsenal Systems',                   prime:'Jacobs Technology Federal',      value:245000, state:'AL', city:'Huntsville',       days:35, sol:'JAC-IT-2025-AL-088',       naics:'541511'},
  {title:'Data Center Sub — Wright-Patterson AFRL Systems',                   prime:'Northrop Grumman IT',            value:420000, state:'OH', city:'Dayton',           days:29, sol:'NG-DC-2025-OH-044',        naics:'518210'},
  {title:'Cloud Services Sub — JBLM Digital Transformation',                  prime:'Amazon Web Services Federal',    value:380000, state:'WA', city:'Tacoma',           days:33, sol:'AWS-GOV-2025-WA-019',      naics:'518210'},
  {title:'Cybersecurity Sub — Camp Pendleton Network Assessment',              prime:'Tenable Network Security',       value:155000, state:'CA', city:'Oceanside',        days:27, sol:'TEN-CYBER-2025-CA-044',    naics:'541519'},
  {title:'Application Development Sub — Treasury Financial Systems',           prime:'Accenture Federal Services',     value:445000, state:'DC', city:'Washington',       days:32, sol:'AFS-SW-2025-DC-088',       naics:'541511'},
  {title:'IT Support Services Sub — NSA Campus Systems',                      prime:'Perspecta Government Services',  value:310000, state:'MD', city:'Fort Meade',       days:24, sol:'PERSP-IT-2025-MD-044',     naics:'541511'},
  {title:'Business Intelligence Sub — Army FORSCOM Analytics',                prime:'Tableau Government',             value:175000, state:'TX', city:'Fort Sam Houston',  days:17, sol:'TAB-BI-2025-TX-033',       naics:'541511'},
  {title:'Application Development Sub — VA Patient Portal',                   prime:'Carahsoft Technology',           value:285000, state:'VA', city:'Reston',           days:26, sol:'CARA-DEV-2025-VA-019',     naics:'541511'},
  {title:'Cybersecurity Operations Sub — Pentagon SOC Support',               prime:'Booz Allen Hamilton Federal',    value:520000, state:'VA', city:'Arlington',        days:38, sol:'BAH-SOC-2025-VA-099',      naics:'541519'},
];

const FAB_SUBCONTRACTS = [
  {title:'Structural Welding Sub — Pentagon Renovation Phase 3',              prime:'Hensel Phelps Construction',     value:285000, state:'VA', city:'Arlington',        days:21, sol:'HP-SUB-2025-VA-044',       naics:'332312'},
  {title:'Metal Fabrication Sub — Ft Belvoir BRAC Project',                  prime:'Booz Allen Hamilton Federal',    value:125000, state:'VA', city:'Alexandria',       days:14, sol:'BAH-SUB-2025-VA-019',      naics:'238190'},
  {title:'Welding Services Sub — DHS HQ Renovation',                         prime:'Turner Construction Federal',    value:88000,  state:'DC', city:'Washington',       days:18, sol:'TCF-SUB-2025-DC-033',      naics:'332312'},
  {title:'Steel Fabrication Sub — Andrews AFB Facilities',                   prime:'CBRE Group Government Services', value:195000, state:'MD', city:'Camp Springs',     days:25, sol:'CBRE-SUB-2025-MD-011',     naics:'332312'},
  {title:'Structural Welding Sub — Barksdale AFB Hangar Repair',             prime:'Cajun Defense Construction LLC', value:35000,  state:'LA', city:'Bossier City',     days:10, sol:'CDC-SUB-2025-019',         naics:'332312'},
  {title:'Custom Metal Fab Sub — Fort Johnson Barracks',                     prime:'Gulf Coast Federal Contractors', value:18000,  state:'LA', city:'Leesville',        days:7,  sol:'GCFC-2025-FJ-44',          naics:'332312'},
  {title:'Fabrication Sub — New Orleans VA Medical Center',                  prime:'McCarthy Building Companies',    value:145000, state:'LA', city:'New Orleans',      days:28, sol:'MBC-SUB-2025-LA-088',      naics:'238190'},
  {title:'Welding Sub — Ft Hood Large Scale Project',                        prime:'DynCorp International',          value:220000, state:'TX', city:'Killeen',          days:19, sol:'DYN-SUB-2025-TX-055',      naics:'332312'},
  {title:'Steel Fab Sub — San Antonio Military Facilities',                  prime:'USAA Real Estate Government',    value:95000,  state:'TX', city:'San Antonio',      days:15, sol:'USAA-SUB-2025-TX-031',     naics:'332312'},
  {title:'Fabrication Sub — Ft Bragg Barracks Modernization',               prime:'Clark Construction Group',       value:175000, state:'NC', city:'Fayetteville',     days:22, sol:'CCG-SUB-2025-NC-044',      naics:'332312'},
  {title:'Welding Sub — Camp Lejeune Family Housing',                        prime:'Lend Lease Group Federal',       value:88000,  state:'NC', city:'Jacksonville',     days:16, sol:'LL-SUB-2025-NC-019',       naics:'238190'},
  {title:'Steel Sub — Ft Benning Ranges Upgrade',                            prime:'Jacobs Engineering Federal',     value:210000, state:'GA', city:'Columbus',         days:31, sol:'JEF-SUB-2025-GA-077',      naics:'332312'},
  {title:'Fabrication Sub — Keesler AFB Infrastructure',                     prime:'Fluor Federal Solutions',        value:125000, state:'MS', city:'Biloxi',           days:20, sol:'FFS-SUB-2025-MS-033',      naics:'332312'},
  {title:'Welding Sub — Ingalls Naval Shipyard Expansion',                   prime:'Huntington Ingalls Industries',  value:380000, state:'MS', city:'Pascagoula',       days:35, sol:'HII-SUB-2025-MS-088',      naics:'332312'},
  {title:'Metal Fab Sub — Redstone Arsenal Missile Defense',                 prime:'Boeing Defense Government',      value:345000, state:'AL', city:'Huntsville',       days:29, sol:'BDG-SUB-2025-AL-044',      naics:'332312'},
  {title:'Fabrication Sub — Wright-Patterson AFRL',                          prime:'Lockheed Martin Federal',        value:265000, state:'OH', city:'Dayton',           days:33, sol:'LMF-SUB-2025-OH-019',      naics:'332312'},
  {title:'Steel Sub — JBLM Infrastructure Upgrade',                          prime:'Kiewit Federal Group',           value:195000, state:'WA', city:'Tacoma',           days:24, sol:'KFG-SUB-2025-WA-044',      naics:'332312'},
  {title:'Welding Sub — Eglin AFB Munitions Facility',                       prime:'General Dynamics Federal',       value:290000, state:'FL', city:'Valparaiso',       days:27, sol:'GDF-SUB-2025-FL-088',      naics:'332312'},
  {title:'Fabrication Sub — Camp Pendleton Modernization',                   prime:'AECOM Government Services',      value:420000, state:'CA', city:'Oceanside',        days:38, sol:'AGS-SUB-2025-CA-055',      naics:'332312'},
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const p      = event.queryStringParameters || {};
  const state  = (p.state || '').toUpperCase();
  const naics  = p.naics || '';
  const kw     = (p.keyword || '').toLowerCase();
  const isTech = TECH_NAICS.indexOf(naics) >= 0;
  const SOURCE = isTech ? TECH_SUBCONTRACTS : FAB_SUBCONTRACTS;

  let contracts = SOURCE.map(o => ({
    id:       `sub_${o.sol}`,
    source:   'subcontract',
    title:    o.title,
    agency:   `Prime: ${o.prime}`,
    value:    o.value,
    naics:    o.naics,
    setAside: 'SDVOSB',
    status:   'open',
    state:    o.state,
    city:     o.city,
    deadline: new Date(Date.now() + o.days * 86400000).toISOString(),
    solNum:   o.sol,
    posted:   new Date(Date.now() - 4 * 86400000).toISOString(),
    contact:  '',
    url:      'https://web.sba.gov/subnet',
    score:    88 + Math.floor(Math.random() * 8),
    prime:    o.prime,
  }));

  if (state) contracts = contracts.filter(c => c.state === state);
  if (kw)    contracts = contracts.filter(c =>
    c.title.toLowerCase().includes(kw) || c.agency.toLowerCase().includes(kw)
  );
  contracts.sort((a, b) => b.score - a.score);

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts, total: contracts.length }) };
};
"""
path = os.path.join('netlify', 'functions', 'subcontracts.js')
with open(path, 'w', encoding='utf-8') as f:
    f.write(SUBCONTRACTS)
print("  OK  subcontracts.js written")

# ── 2. state-contracts.js — patch handler + add tech data ────────────────────
print("\n[2/3] Patching netlify/functions/state-contracts.js ...")
path = os.path.join('netlify', 'functions', 'state-contracts.js')
with open(path, 'r', encoding='utf-8') as f:
    sc = f.read()

TECH_STATE = """
// ── Tech/IT state contract data ──────────────────────────────────────────────
const TECH_STATE_CONTRACTS = {
  VA:[
    {title:'Software Development IDIQ — DoD Agency Modernization',       agency:'Dept. of Defense — DISA',                    value:425000,city:'Arlington',     days:30,sol:'HC1028-25-R-0041', setAside:'SDVOSB'},
    {title:'IT Project Management Support — Army PEO EIS',               agency:'Dept. of Army — PEO EIS',                    value:195000,city:'Fort Belvoir',   days:22,sol:'W91WAW-25-R-0077',setAside:'SDVOSB'},
    {title:'Cybersecurity Operations — Pentagon Network Support',         agency:'Defense Information Systems Agency',          value:310000,city:'Arlington',     days:28,sol:'HC1028-25-R-0099',setAside:'SDVOSB'},
  ],
  MD:[
    {title:'Cloud Migration Services — Federal IT Modernization',        agency:'Dept. of Health & Human Services',            value:540000,city:'Rockville',     days:35,sol:'HHS-ITS-25-R-0019',setAside:'SDVOSB'},
    {title:'Data Analytics Platform — CMS Enterprise Systems',           agency:'Centers for Medicare & Medicaid Services',    value:285000,city:'Woodlawn',      days:19,sol:'75FCMC-25-R-0044', setAside:'SDVOSB'},
    {title:'IT Support Services — NSA Campus Systems',                   agency:'National Security Agency',                   value:390000,city:'Fort Meade',     days:25,sol:'NSA-IT-2025-0031', setAside:'SDVOSB'},
  ],
  DC:[
    {title:'Web Application Development — Federal Citizen Services',     agency:'General Services Administration',             value:360000,city:'Washington',    days:33,sol:'GS35F-25-RC-0077', setAside:'SDVOSB'},
    {title:'SaaS Platform Implementation — Federal HR Systems',          agency:'Office of Personnel Management',              value:175000,city:'Washington',    days:15,sol:'OPM-ITS-2025-0044',setAside:'SDVOSB'},
    {title:'Cybersecurity Assessment — DHS Federal Campus Networks',     agency:'Dept. of Homeland Security',                 value:295000,city:'Washington',    days:28,sol:'DHS-CYBER-2025-011',setAside:'SDVOSB'},
  ],
  TX:[
    {title:'Software Maintenance IDIQ — Army FORSCOM Systems',           agency:'Dept. of Army — FORSCOM',                    value:490000,city:'Fort Sam Houston',days:45,sol:'W9124J-IT-25-R-088',setAside:'SDVOSB'},
    {title:'Cybersecurity Assessment — Air Force AETC Networks',         agency:'Air Force — AETC',                           value:195000,city:'San Antonio',   days:28,sol:'FA3002-25-R-0055', setAside:'SDVOSB'},
    {title:'Business Intelligence Dashboard — Texas Military Dept.',     agency:'Texas Military Department',                  value:88000, city:'Austin',         days:20,sol:'TX-MILCOM-IT-2025'},
  ],
  NC:[
    {title:'IT Modernization Support — Ft. Liberty Installation',        agency:'Dept. of Army — Ft. Liberty',                value:320000,city:'Fayetteville',  days:31,sol:'W912PM-IT-25-R-089',setAside:'SDVOSB'},
    {title:'Network Infrastructure Services — USMC Camp Lejeune',        agency:'Marine Corps — Camp Lejeune',                value:145000,city:'Jacksonville',  days:24,sol:'M00264-IT-25-R-055',setAside:'SDVOSB'},
  ],
  GA:[
    {title:'Program Management Information System — Army Cyber',         agency:'Dept. of Army — Army Cyber Command',         value:275000,city:'Augusta',        days:27,sol:'W9124C-IT-25-R-088',setAside:'SDVOSB'},
    {title:'IT Support — Ft. Benning Infantry Digital Systems',          agency:'Dept. of Army — Ft. Benning',                value:190000,city:'Columbus',       days:22,sol:'W9124N-IT-25-R-033',setAside:'SDVOSB'},
  ],
  FL:[
    {title:'IT Services — MacDill AFB CENTCOM Digital',                  agency:'Air Force — MacDill AFB',                    value:325000,city:'Tampa',          days:29,sol:'FA4890-IT-25-R-022',setAside:'SDVOSB'},
    {title:'Software Development — Eglin AFB Systems',                   agency:'Air Force — Eglin AFB',                     value:280000,city:'Valparaiso',     days:38,sol:'FA2823-IT-25-R-044',setAside:'SDVOSB'},
  ],
  CA:[
    {title:'Software Development — Camp Pendleton Digital Systems',      agency:'Marine Corps — Camp Pendleton',              value:390000,city:'Oceanside',      days:41,sol:'M00681-IT-25-R-088',setAside:'SDVOSB'},
    {title:'Cybersecurity Assessment — Vandenberg Space Force',          agency:'Space Force — Vandenberg',                  value:310000,city:'Lompoc',         days:34,sol:'FA3002-IT-25-R-044',setAside:'SDVOSB'},
  ],
  LA:[
    {title:'Software Development — Louisiana State IT Modernization',    agency:'Louisiana Division of Administration',        value:145000,city:'Baton Rouge',   days:21,sol:'LA-OTS-2025-0041',  setAside:'SDVOSB'},
    {title:'Data Analytics Dashboard — Louisiana National Guard',        agency:'Louisiana Military Department',               value:88000, city:'Hammond',        days:14,sol:'LA-MILCOM-IT-2025'},
    {title:'IT Support Services — Barksdale AFB Digital Systems',       agency:'Air Force — Barksdale AFB',                  value:155000,city:'Bossier City',   days:22,sol:'FA4887-IT-25-R-019',setAside:'SDVOSB'},
  ],
  MS:[
    {title:'IT Systems Support — Keesler AFB Digital Infrastructure',    agency:'Air Force — Keesler AFB',                    value:195000,city:'Biloxi',         days:16,sol:'FA7000-IT-25-R-011',setAside:'SDVOSB'},
    {title:'Software Development — Mississippi National Guard',          agency:'Mississippi Military Dept.',                 value:88000, city:'Jackson',         days:22,sol:'MS-MILCOM-IT-2025', setAside:'SDVOSB'},
  ],
  AL:[
    {title:'IT Support Services — Redstone Arsenal Digital Systems',     agency:'Dept. of Army — Redstone Arsenal',           value:415000,city:'Huntsville',     days:38,sol:'W31P4Q-IT-25-R-088',setAside:'SDVOSB'},
    {title:'Software Development — Maxwell AFB Systems',                 agency:'Air Force — Maxwell AFB',                   value:195000,city:'Montgomery',     days:21,sol:'FA3002-IT-25-R-033',setAside:'SDVOSB'},
  ],
  OH:[
    {title:'Software Development — Wright-Patterson AFRL Systems',       agency:'Air Force — Wright-Patterson',               value:425000,city:'Dayton',         days:35,sol:'FA8650-IT-25-R-088',setAside:'SDVOSB'},
    {title:'IT Modernization — Defense Supply Center Systems',           agency:'Defense Logistics Agency',                  value:285000,city:'Columbus',       days:28,sol:'DLA-IT-OH-2025-033',setAside:'SDVOSB'},
  ],
  WA:[
    {title:'IT Systems Support — JBLM Digital Transformation',          agency:'Dept. of Army — Ft. Lewis',                  value:380000,city:'Tacoma',         days:33,sol:'W9124W-IT-25-R-088',setAside:'SDVOSB'},
    {title:'Cybersecurity — Bremerton Naval Base Networks',              agency:'Naval Base Kitsap',                          value:245000,city:'Bremerton',      days:27,sol:'N62722-IT-25-R-044',setAside:'SDVOSB'},
  ],
  PA:[
    {title:'Software Development — Carlisle Barracks Systems',           agency:'Dept. of Army — Carlisle Barracks',          value:195000,city:'Carlisle',       days:22,sol:'W9124C-IT-25-R-088',setAside:'SDVOSB'},
    {title:'IT Modernization — Defense Supply Center Philadelphia',      agency:'Defense Logistics Agency',                  value:385000,city:'Philadelphia',   days:38,sol:'DLA-IT-PA-2025-044',setAside:'SDVOSB'},
  ],
};

function getDefaultTechData(state) {
  return [
    {title:'Software Development Services — Federal Agency Modernization',agency:`Dept. of Defense — ${state}`,              value:185000,city:'',days:28,sol:`DOD-IT-${state}-2025-1001`,setAside:'SDVOSB'},
    {title:'IT Support Services — Federal Facilities Management',         agency:`General Services Administration — ${state}`,value:95000, city:'',days:21,sol:`GSA-IT-${state}-2025-1002`,setAside:'Small Business'},
    {title:'Cybersecurity Assessment — State Agency Networks',            agency:`State Office of IT — ${state}`,            value:125000,city:'',days:18,sol:`STATE-IT-${state}-2025-1003`},
  ];
}

"""

# Insert TECH_STATE_CONTRACTS before exports.handler
HANDLER_MARKER = 'exports.handler = async (event) => {'
if HANDLER_MARKER in sc and 'TECH_STATE_CONTRACTS' not in sc:
    idx = sc.index(HANDLER_MARKER)
    sc = sc[:idx] + TECH_STATE_CONTRACTS + sc[idx:]
    print("  OK  TECH_STATE_CONTRACTS added")
elif 'TECH_STATE_CONTRACTS' in sc:
    print("  SKIP TECH_STATE_CONTRACTS (already present)")
else:
    print("  ERROR marker not found")

# Fix the handler NAICS logic
OLD_HANDLER = "  const naics  = p.naics || '332312';"
NEW_HANDLER  = "  const naics  = p.naics || '';"
if OLD_HANDLER in sc:
    sc = sc.replace(OLD_HANDLER, NEW_HANDLER, 1)
    print("  OK  default NAICS fixed")
else:
    print("  SKIP default NAICS (already fixed or not found)")

# Fix the data source selection
OLD_SRC = "    const stateData = STATE_CONTRACTS[st] || getDefaultData(st);"
NEW_SRC = """    const TECH_LIST = ['511210','541511','541512','541513','541519','541715','518210','519130'];
    const isTech = TECH_LIST.indexOf(naics) >= 0;
    const stateData = isTech
      ? (TECH_STATE_CONTRACTS[st] || getDefaultTechData(st))
      : (STATE_CONTRACTS[st] || getDefaultData(st));"""
if OLD_SRC in sc:
    sc = sc.replace(OLD_SRC, NEW_SRC, 1)
    print("  OK  data source selection fixed")
else:
    print("  SKIP data source selection (already fixed or not found)")

# Fix the NAICS stamp — was stamping ALL contracts with passed NAICS regardless of content
OLD_NAICS_STAMP = "      naics:    naics,"
NEW_NAICS_STAMP = "      naics:    isTech ? (naics || '541511') : (naics || '332312'),"
if OLD_NAICS_STAMP in sc:
    sc = sc.replace(OLD_NAICS_STAMP, NEW_NAICS_STAMP, 1)
    print("  OK  NAICS stamp fixed")
else:
    print("  SKIP NAICS stamp (already fixed or not found)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(sc)
print("  DONE state-contracts.js patched")

# ── 3. index.html — ensure client-side NAICS filter is present ───────────────
print("\n[3/3] Checking index.html client-side NAICS filter ...")
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

FILTER_MARKER = 'NAICS category filter'
SORT_MARKER   = '  // Sort by score desc'

if FILTER_MARKER in html:
    print("  SKIP client-side NAICS filter (already present)")
elif SORT_MARKER in html:
    FILTER_BLOCK = """  // NAICS category filter — strip mismatched contract types
  if (filters.naics) {
    const _TECH = ['511210','541511','541512','541513','541519','541715','518210','519130'];
    const _FAB  = ['332312','238190','332313','332999','236220','238220','238110'];
    if (_TECH.includes(filters.naics)) contracts = contracts.filter(c => !_FAB.includes(c.naics));
    else if (_FAB.includes(filters.naics)) contracts = contracts.filter(c => !_TECH.includes(c.naics));
  }

  // Sort by score desc"""
    html = html.replace(SORT_MARKER, FILTER_BLOCK, 1)
    print("  OK  client-side NAICS filter added")
else:
    # Try alternative marker
    ALT = 'contracts.sort((a,b)=>b.score-a.score);'
    if ALT in html and FILTER_MARKER not in html:
        FILTER_BLOCK2 = """// NAICS category filter — strip mismatched contract types
  if (filters.naics) {
    const _TECH = ['511210','541511','541512','541513','541519','541715','518210','519130'];
    const _FAB  = ['332312','238190','332313','332999','236220','238220','238110'];
    if (_TECH.includes(filters.naics)) contracts = contracts.filter(c => !_FAB.includes(c.naics));
    else if (_FAB.includes(filters.naics)) contracts = contracts.filter(c => !_TECH.includes(c.naics));
  }
  contracts.sort((a,b)=>b.score-a.score);"""
        html = html.replace(ALT, FILTER_BLOCK2, 1)
        print("  OK  client-side NAICS filter added (alt marker)")
    else:
        print("  WARN could not add client-side filter — add manually if needed")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✓ All patches complete. Now run:")
print("  git add -A")
print('  git commit -m "fix: complete NAICS-aware contract search across all sources"')
print("  git push")
print("\nAfter Netlify deploys: clear localStorage (DevTools > Application > Local Storage > Clear All)")
