#!/usr/bin/env python3
"""
ForgeFront — NAICS-aware contract search patch
Run from repo root: python patch_forgefront.py
"""
import sys, os

def patch(filepath, changes):
    if not os.path.exists(filepath):
        print(f"ERROR: {filepath} not found — are you in the repo root?")
        sys.exit(1)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new, label in changes:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"  OK  {label}")
        else:
            print(f"  SKIP (not found — may already be patched): {label}")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# ── contracts.js ──────────────────────────────────────────────────────────────
print("\nPatching netlify/functions/contracts.js ...")

NEW_MOCK_JS = """// ── Mock data fallback — NAICS-aware: tech pool vs fabrication pool ──────────
var TECH_NAICS = ['511210','541511','541512','541513','541519','541715','518210','519130'];
var FAB_NAICS  = ['332312','238190','332313','332999','236220','238220','238110'];

function getMockContracts(filters) {
  var state   = filters.state   || '';
  var naics   = filters.naics   || '';
  var keyword = (filters.keyword || '').toLowerCase();
  var isTech  = TECH_NAICS.indexOf(naics) >= 0;

  var TECH_ALL = [
    { id:'mock_t1',  source:'federal', title:'Custom Software Development — DoD Agency Portal Modernization',   agency:'Dept. of Defense — DISA',         value:385000, naics:'541511', setAside:'SDVOSB', state:'VA', city:'Arlington',    daysOut:30, sol:'HC102825R0041'  },
    { id:'mock_t2',  source:'federal', title:'Cloud Migration & IT Modernization — Federal ERP Systems',        agency:'General Services Administration',  value:520000, naics:'541512', setAside:'SDVOSB', state:'MD', city:'Rockville',    daysOut:45, sol:'GS35F25RC0081'  },
    { id:'mock_t3',  source:'federal', title:'Cybersecurity Assessment & FISMA Compliance Services',            agency:'Dept. of Veterans Affairs — OIT',  value:195000, naics:'541519', setAside:'SDVOSB', state:'DC', city:'Washington',   daysOut:22, sol:'36C10B25R0047'  },
    { id:'mock_t4',  source:'federal', title:'AI/ML Data Analytics Platform — Program Management Support',     agency:'Dept. of Army — PEO EIS',          value:460000, naics:'541511', setAside:'SDVOSB', state:'VA', city:'Fort Belvoir',  daysOut:35, sol:'W91WAW25R0033'  },
    { id:'mock_t5',  source:'federal', title:'Software Maintenance & Help Desk Support — Legacy Systems IDIQ', agency:'Dept. of Air Force — AFLCMC',      value:290000, naics:'541511', setAside:'SDVOSB', state:'OH', city:'Dayton',       daysOut:28, sol:'FA875025R0044'  },
    { id:'mock_t6',  source:'federal', title:'Web Application Development — Veteran Services Portal',          agency:'Dept. of Veterans Affairs',        value:340000, naics:'541511', setAside:'SDVOSB', state:'TX', city:'Houston',      daysOut:31, sol:'36C10B25R0088'  },
    { id:'mock_t7',  source:'federal', title:'SaaS Platform Implementation — Federal HR Modernization',        agency:'Office of Personnel Management',    value:175000, naics:'541512', setAside:'SDVOSB', state:'DC', city:'Washington',   daysOut:24, sol:'OPMITS20250044' },
    { id:'mock_t8',  source:'federal', title:'Mobile Application Development — DoD Logistics Platform',        agency:'Defense Logistics Agency',          value:285000, naics:'511210', setAside:'SDVOSB', state:'PA', city:'Philadelphia', daysOut:38, sol:'SPRMM225R0019'  },
    { id:'mock_t9',  source:'federal', title:'Network Security Operations — SOC-as-a-Service',                 agency:'Dept. of Homeland Security',        value:620000, naics:'541519', setAside:'SDVOSB', state:'MD', city:'Suitland',     daysOut:16, sol:'70RSAT25R00044' },
    { id:'mock_t10', source:'federal', title:'Business Intelligence & Reporting — Federal Financial Systems',  agency:'Dept. of Treasury',                value:245000, naics:'541511', setAside:'SDVOSB', state:'DC', city:'Washington',   daysOut:14, sol:'TREAS2025ITS017' },
    { id:'mock_t11', source:'federal', title:'IT Project Management Support — PMSS Task Order',               agency:'Dept. of Army — FORSCOM',          value:195000, naics:'541511', setAside:'SDVOSB', state:'GA', city:'Fort Gillem',  daysOut:19, sol:'W9124C25R0077'  },
    { id:'mock_t12', source:'federal', title:'Enterprise Software Licensing & Deployment — DoD Enterprise',   agency:'Dept. of Defense — DISA',          value:480000, naics:'511210', setAside:'SDVOSB', state:'VA', city:'Fort Meade',   daysOut:41, sol:'HC102825R0088'  },
    { id:'mock_t13', source:'federal', title:'DevSecOps Pipeline Implementation — Federal CI/CD Environment', agency:'Dept. of Air Force',               value:310000, naics:'541512', setAside:'SDVOSB', state:'VA', city:'Pentagon',     daysOut:15, sol:'FA875025R0099'  },
    { id:'mock_t14', source:'federal', title:'Data Center Optimization & Cloud Services — FedRAMP Authorized',agency:'Dept. of Veterans Affairs',        value:390000, naics:'518210', setAside:'SDVOSB', state:'TX', city:'Austin',       daysOut:28, sol:'36C10B25R0123'  },
    { id:'mock_t15', source:'federal', title:'Program Management Information System — Army G4 Logistics',     agency:'Dept. of Army — G4',               value:225000, naics:'541511', setAside:'SDVOSB', state:'VA', city:'Pentagon',     daysOut:27, sol:'W91WAW25R0061'  },
  ];

  var FAB_ALL = [
    { id:'mock_f1',  source:'federal', title:'Structural Steel Fabrication & Installation — VAMC Campus Renovation',  agency:'Dept. of Veterans Affairs',       value:185000, naics:'332312', setAside:'SDVOSB', state:'VA', city:'Richmond',     daysOut:30, sol:'36C24825R0112' },
    { id:'mock_f2',  source:'federal', title:'Welding & Metal Fabrication IDIQ — Military Installation Maintenance',  agency:'Dept. of Army',                   value:320000, naics:'332312', setAside:'SDVOSB', state:'TX', city:'Fort Hood',    daysOut:45, sol:'W912DR25R0041' },
    { id:'mock_f3',  source:'federal', title:'Mobile Welding Services BPA — Air Force Base Facilities',               agency:'Dept. of Air Force',              value:95000,  naics:'238190', setAside:'SDVOSB', state:'NC', city:'Goldsboro',   daysOut:22, sol:'FA485225R0019' },
    { id:'mock_f4',  source:'federal', title:'Structural Steel Repair & Fabrication — Federal Courthouse Renovation', agency:'General Services Administration',  value:240000, naics:'332312', setAside:'SBA',    state:'MD', city:'Baltimore',   daysOut:35, sol:'GS11P25RC0044' },
    { id:'mock_f5',  source:'federal', title:'Custom Metal Fabrication — Pentagon Maintenance Facility',              agency:'Defense Facilities Activity',      value:285000, naics:'332312', setAside:'SDVOSB', state:'VA', city:'Arlington',   daysOut:28, sol:'DFAVA251102'   },
    { id:'mock_f6',  source:'federal', title:'Welding Services — Fort Bragg Barracks Renovation',                     agency:'Dept. of Army — Fort Bragg',      value:380000, naics:'332312', setAside:'SDVOSB', state:'NC', city:'Fayetteville',daysOut:31, sol:'W912PM25R0061' },
    { id:'mock_f7',  source:'federal', title:'Metal Door & Frame Systems — Camp Lejeune Marine Corps Base',           agency:'Marine Corps Installations East', value:145000, naics:'332312', setAside:'SDVOSB', state:'NC', city:'Jacksonville',daysOut:24, sol:'M0026425R0022' },
    { id:'mock_f8',  source:'federal', title:'Structural Welding — Redstone Arsenal Facilities Upgrade',              agency:'Dept. of Army — Redstone Arsenal',value:415000, naics:'332312', setAside:'SDVOSB', state:'AL', city:'Huntsville',  daysOut:38, sol:'W31P4Q25R0088' },
    { id:'mock_f9',  source:'federal', title:'Fabrication Services — Keesler AFB Facilities Renovation',             agency:'Air Force — Keesler AFB',         value:88000,  naics:'332312', setAside:'SDVOSB', state:'MS', city:'Biloxi',      daysOut:16, sol:'FA700025R0011' },
    { id:'mock_f10', source:'federal', title:'Parish Road Sign Fabrication & Installation',                           agency:'Webster Parish Police Jury',      value:28000,  naics:'332312', setAside:'SDVOSB', state:'LA', city:'Minden',      daysOut:14, sol:'WPPJ20250017'  },
    { id:'mock_f11', source:'federal', title:'HVAC Metal Ductwork Fabrication — Andrews AFB Renovation',             agency:'Air Force — Joint Base Andrews',  value:195000, naics:'238220', setAside:'SDVOSB', state:'MD', city:'Suitland',    daysOut:19, sol:'FA701425R0033' },
    { id:'mock_f12', source:'federal', title:'Structural Steel — Aberdeen Proving Ground Building 400',               agency:'Dept. of Army — Aberdeen PG',     value:340000, naics:'332312', setAside:'SDVOSB', state:'MD', city:'Aberdeen',    daysOut:41, sol:'W91CRB25R0019' },
    { id:'mock_f13', source:'federal', title:'Security Barrier Fabrication — DHS Federal Campus',                    agency:'Dept. of Homeland Security',      value:180000, naics:'332312', setAside:'SDVOSB', state:'DC', city:'Washington',  daysOut:15, sol:'70RSAT25R00112'},
    { id:'mock_f14', source:'federal', title:'Metal Fabrication IDIQ — Lackland AFB Facilities Support',             agency:'Air Force — JBSA Lackland',       value:220000, naics:'332312', setAside:'SDVOSB', state:'TX', city:'San Antonio', daysOut:28, sol:'FA300225R0019' },
    { id:'mock_f15', source:'federal', title:'Structural Welding — Fort Gordon Signal Corps Facilities',              agency:'Dept. of Army — Fort Gordon',     value:275000, naics:'332312', setAside:'SDVOSB', state:'GA', city:'Augusta',     daysOut:27, sol:'W9124C25R0044' },
  ];

  var ALL = isTech ? TECH_ALL : FAB_ALL;
  var results = ALL;
  if (state) {
    results = results.filter(function(c) { return c.state === state; });
    if (!results.length) results = ALL.slice(0, 5);
  }
  if (keyword) {
    results = results.filter(function(c) {
      return c.title.toLowerCase().indexOf(keyword) >= 0 ||
             c.agency.toLowerCase().indexOf(keyword) >= 0;
    });
    if (!results.length) results = ALL.slice(0, 4);
  }
  var now = Date.now();
  return results.map(function(c) {
    return { id:c.id, source:c.source, title:c.title, agency:c.agency, value:c.value,
             naics:c.naics, setAside:c.setAside, status:'open', state:c.state, city:c.city,
             deadline:new Date(now + c.daysOut * 86400000).toISOString(), solNum:c.sol,
             posted:new Date(now - 7 * 86400000).toISOString(),
             url:'https://sam.gov/opp/' + c.sol,
             score:75 + Math.floor(Math.random() * 20), _source_tag:'mock_fallback' };
  });
}

"""

# Find old mock block and replace
OLD_MOCK_START = '// \u2500\u2500 Mock data fallback \u2014 shown when SAM.gov is unreachable'
OLD_MOCK_END   = '// \u2500\u2500 Transform SAM.gov API response'

cjs_path = os.path.join('netlify', 'functions', 'contracts.js')
with open(cjs_path, 'r', encoding='utf-8') as f:
    cjs = f.read()

if OLD_MOCK_START in cjs and OLD_MOCK_END in cjs:
    si = cjs.index(OLD_MOCK_START)
    ei = cjs.index(OLD_MOCK_END)
    cjs = cjs[:si] + NEW_MOCK_JS + cjs[ei:]
    print("  OK  getMockContracts replaced with NAICS-aware version")
else:
    print("  SKIP getMockContracts (markers not found — may already be patched)")

patch(cjs_path, [
    (
        "var naics   = params.naics    || '332312';",
        "var naics   = params.naics    || '';",
        "default NAICS changed from 332312 to empty"
    ),
    (
        "  if (['332312','238190','332313','332999'].includes(opp.naicsCode)) score += 15;\n",
        "",
        "removed hardcoded fabrication NAICS score bonus"
    ),
])

with open(cjs_path, 'w', encoding='utf-8') as f:
    f.write(cjs)

# ── index.html ────────────────────────────────────────────────────────────────
print("\nPatching index.html ...")

NEW_FEDERAL_MOCK = """function getFederalMockData(filters) {
  var state = filters.state || 'VA';
  var naics = filters.naics || '';
  var TECH_NAICS = ['511210','541511','541512','541513','541519','541715','518210','519130'];
  var isTech = TECH_NAICS.indexOf(naics) >= 0;
  if (isTech) {
    return [
      {id:'f1',source:'federal',title:'Custom Software Development — DoD Agency Portal Modernization',agency:'Dept. of Defense — DISA',value:385000,naics:naics,setAside:'SDVOSB',status:'open',state:state,city:'Arlington',deadline:new Date(Date.now()+30*86400000).toISOString(),solNum:'HC102825R0041',posted:new Date().toISOString(),url:'https://sam.gov',score:95},
      {id:'f2',source:'federal',title:'Cloud Migration & IT Modernization — Federal ERP Systems',agency:'General Services Administration',value:520000,naics:naics,setAside:'SDVOSB',status:'open',state:state,city:'',deadline:new Date(Date.now()+45*86400000).toISOString(),solNum:'GS35F25RC0081',posted:new Date().toISOString(),url:'https://sam.gov',score:88},
      {id:'f3',source:'federal',title:'Cybersecurity Assessment & FISMA Compliance Services',agency:'Dept. of Veterans Affairs — OIT',value:195000,naics:naics,setAside:'SDVOSB',status:'open',state:state,city:'',deadline:new Date(Date.now()+25*86400000).toISOString(),solNum:'36C10B25R0047',posted:new Date().toISOString(),url:'https://sam.gov',score:86},
      {id:'f4',source:'federal',title:'AI/ML Data Analytics Platform — Program Management Support',agency:'Dept. of Army — PEO EIS',value:460000,naics:naics,setAside:'Small Business',status:'open',state:state,city:'',deadline:new Date(Date.now()+35*86400000).toISOString(),solNum:'W91WAW25R0033',posted:new Date().toISOString(),url:'https://sam.gov',score:76},
    ];
  }
  return [
    {id:'f1',source:'federal',title:'Structural Steel Fabrication — VAMC Campus Renovation',agency:'Dept. of Veterans Affairs',value:185000,naics:'332312',setAside:'SDVOSB',status:'open',state:state,city:'',deadline:new Date(Date.now()+30*86400000).toISOString(),solNum:'36C24825R0112',posted:new Date().toISOString(),url:'https://sam.gov',score:95},
    {id:'f2',source:'federal',title:'Welding & Metal Fabrication BPA — Military Installation',agency:'Dept. of Army',value:320000,naics:'332312',setAside:'SDVOSB',status:'open',state:state,city:'',deadline:new Date(Date.now()+45*86400000).toISOString(),solNum:'W912DR25R0041',posted:new Date().toISOString(),url:'https://sam.gov',score:88},
    {id:'f3',source:'federal',title:'Mobile Welding Services — Air Force Base',agency:'Dept. of Air Force',value:95000,naics:'238190',setAside:'SDVOSB',status:'open',state:state,city:'',deadline:new Date(Date.now()+25*86400000).toISOString(),solNum:'FA485225R0019',posted:new Date().toISOString(),url:'https://sam.gov',score:86},
    {id:'f4',source:'federal',title:'Structural Steel Repair — Federal Facilities',agency:'General Services Administration',value:240000,naics:'332312',setAside:'Small Business',status:'open',state:state,city:'',deadline:new Date(Date.now()+35*86400000).toISOString(),solNum:'GS11P25RC0044',posted:new Date().toISOString(),url:'https://sam.gov',score:76},
  ];
}
"""

NEW_STATE_MOCK = """function getStateMockData(state, naics) {
  var TECH_NAICS = ['511210','541511','541512','541513','541519','541715','518210','519130'];
  var isTech = TECH_NAICS.indexOf(naics) >= 0;
  if (isTech) {
    var techData = {
      VA:[{title:'Software Development IDIQ — DoD Agency Modernization',agency:'Dept. of Defense — DISA',value:425000,city:'Arlington',deadline:30,sol:'HC1028-25-R-0041'},{title:'IT Project Management Support — Army PEO EIS',agency:'Dept. of Army — PEO EIS',value:195000,city:'Fort Belvoir',deadline:22,sol:'W91WAW-25-R-0077'},{title:'Cybersecurity Operations — Pentagon IT Support',agency:'Defense Information Systems Agency',value:310000,city:'Arlington',deadline:28,sol:'HC1028-25-R-0099'}],
      MD:[{title:'Cloud Migration Services — Federal IT Modernization',agency:'Dept. of Health & Human Services',value:540000,city:'Rockville',deadline:35,sol:'HHS-ITS-25-R-0019'},{title:'Data Analytics Platform — CMS Enterprise Systems',agency:'Centers for Medicare & Medicaid Services',value:285000,city:'Woodlawn',deadline:19,sol:'75FCMC-25-R-0044'}],
      DC:[{title:'Web Application Development — Federal Citizen Services',agency:'General Services Administration',value:360000,city:'Washington',deadline:33,sol:'GS35F-25-RC-0077'},{title:'SaaS Platform Implementation — Federal HR Systems',agency:'Office of Personnel Management',value:175000,city:'Washington',deadline:15,sol:'OPM-ITS-2025-0044'}],
      TX:[{title:'Software Maintenance IDIQ — Army FORSCOM Systems',agency:'Dept. of Army — FORSCOM',value:490000,city:'Fort Sam Houston',deadline:45,sol:'W9124J-25-R-0088'},{title:'Cybersecurity Assessment — Air Force AETC Networks',agency:'Air Force — AETC',value:195000,city:'San Antonio',deadline:28,sol:'FA3002-25-R-0055'},{title:'Business Intelligence Dashboard — Texas Military Dept.',agency:'Texas Military Department',value:88000,city:'Austin',deadline:20,sol:'TX-MILCOM-IT-2025-044'}],
      NC:[{title:'IT Modernization Support — Ft. Liberty Installation',agency:'Dept. of Army — Ft. Liberty',value:320000,city:'Fayetteville',deadline:31,sol:'W912PM-25-R-0089'},{title:'Network Infrastructure Services — USMC Camp Lejeune',agency:'Marine Corps — Camp Lejeune',value:145000,city:'Jacksonville',deadline:24,sol:'M00264-25-R-0055'}],
      GA:[{title:'Program Management Information System — Army Cyber',agency:'Dept. of Army — Army Cyber Command',value:275000,city:'Augusta',deadline:27,sol:'W9124C-25-R-0088'}],
      MS:[{title:'Software Development — Air Force Logistics Systems',agency:'Air Force — Keesler AFB',value:195000,city:'Biloxi',deadline:16,sol:'FA7000-25-R-0044'}],
      AL:[{title:'IT Support Services — Redstone Arsenal Systems',agency:'Dept. of Army — Redstone Arsenal',value:415000,city:'Huntsville',deadline:38,sol:'W31P4Q-25-R-0099'}],
      LA:[{title:'Software Development — Louisiana State IT Modernization',agency:'Louisiana Division of Administration',value:145000,city:'Baton Rouge',deadline:21,sol:'LA-OTS-2025-0041'},{title:'Data Analytics Dashboard — Louisiana National Guard',agency:'Louisiana Military Department',value:88000,city:'Hammond',deadline:14,sol:'LA-MILCOM-IT-2025-017'}],
    };
    var base = techData[state] || techData['VA'];
    return base.map(function(o) {
      return { id:'sl_'+o.sol, source:'state_local', title:o.title, agency:o.agency, value:o.value,
               naics:naics||'541511', setAside:'SDVOSB', status:'open', state:state, city:o.city,
               deadline:new Date(Date.now()+o.deadline*86400000).toISOString(), solNum:o.sol,
               posted:new Date(Date.now()-7*86400000).toISOString(), contact:'',
               url:STATE_SOURCES[state]||'https://sam.gov', score:78+Math.floor(Math.random()*15) };
    });
  }
  var stateData = {
    LA:[{title:'Metal Fabrication & Welding — DOTD Maintenance Facility',agency:'LA Dept. of Transportation & Development',value:45000,city:'Baton Rouge',deadline:21,sol:'LA-DOTD-2025-0041'},{title:'Parish Road Sign Fabrication & Installation',agency:'Webster Parish Police Jury',value:28000,city:'Minden',deadline:14,sol:'WPPJ-2025-0017'},{title:'Steel Dock Grating Repair & Fabrication',agency:'Port of Shreveport-Bossier',value:62000,city:'Shreveport',deadline:30,sol:'PSB-2025-STRUCT-004'},{title:'Correctional Facility Metal Door Frames',agency:'Louisiana Dept. of Public Safety',value:38000,city:'Angola',deadline:18,sol:'LDPS-2025-0093'}],
    VA:[{title:'Structural Steel Repair — Pentagon Maintenance',agency:'Defense Facilities Activity',value:285000,city:'Arlington',deadline:28,sol:'DFA-VA-2025-1102'},{title:'Welding Services BPA — Ft Belvoir Installation',agency:'Dept. of Army — Ft Belvoir',value:450000,city:'Alexandria',deadline:35,sol:'W91QVN-25-R-0044'},{title:'Metal Fabrication — Quantico Marine Base',agency:'Marine Corps Installations',value:125000,city:'Quantico',deadline:22,sol:'M67399-25-R-0081'}],
    MD:[{title:'HVAC Metal Ductwork — Andrews AFB Renovation',agency:'Air Force — Joint Base Andrews',value:195000,city:'Suitland',deadline:19,sol:'FA7014-25-R-0033'},{title:'Structural Steel — Aberdeen Proving Ground',agency:'Dept. of Army — Aberdeen PG',value:340000,city:'Aberdeen',deadline:41,sol:'W91CRB-25-R-0019'}],
    DC:[{title:'Custom Metal Fabrication — Federal Building Renovation',agency:'General Services Administration',value:520000,city:'Washington',deadline:33,sol:'GS-11P-25-RC-0077'},{title:'Security Barrier Installation — Federal Grounds',agency:'Dept. of Homeland Security',value:180000,city:'Washington',deadline:15,sol:'70RSAT25R00000112'}],
    TX:[{title:'Welding Services IDIQ — Ft Hood Installation',agency:'Dept. of Army — Ft Hood',value:850000,city:'Killeen',deadline:45,sol:'W9124J-25-R-0088'},{title:'Metal Fabrication — Lackland AFB',agency:'Air Force — JBSA Lackland',value:220000,city:'San Antonio',deadline:28,sol:'FA3002-25-R-0019'},{title:'Structural Steel — Camp Mabry Renovation',agency:'Texas Military Dept.',value:95000,city:'Austin',deadline:20,sol:'TX-MILCOM-2025-0044'}],
    NC:[{title:'Welding & Fabrication — Ft Bragg Barracks',agency:'Dept. of Army — Ft Bragg',value:380000,city:'Fayetteville',deadline:31,sol:'W912PM-25-R-0061'},{title:'Metal Door Systems — Camp Lejeune',agency:'Marine Corps — Camp Lejeune',value:145000,city:'Jacksonville',deadline:24,sol:'M00264-25-R-0022'}],
    GA:[{title:'Structural Welding — Ft Gordon Signal Corps',agency:'Dept. of Army — Ft Gordon',value:275000,city:'Augusta',deadline:27,sol:'W9124C-25-R-0044'}],
    MS:[{title:'Metal Fabrication — Keesler AFB Facilities',agency:'Air Force — Keesler AFB',value:88000,city:'Biloxi',deadline:16,sol:'FA7000-25-R-0011'},{title:'Welding Services — Camp Shelby',agency:'Mississippi Military Dept.',value:52000,city:'Hattiesburg',deadline:22,sol:'MS-MILCOM-2025-0028'}],
    AL:[{title:'Fabrication Services — Redstone Arsenal',agency:'Dept. of Army — Redstone Arsenal',value:415000,city:'Huntsville',deadline:38,sol:'W31P4Q-25-R-0088'},{title:'Metal Structures — Maxwell AFB',agency:'Air Force — Maxwell AFB',value:165000,city:'Montgomery',deadline:21,sol:'FA3002-25-R-0033'}],
  };
  var base = stateData[state] || stateData['LA'];
  return base.map(function(o) {
    return { id:'sl_'+o.sol, source:'state_local', title:o.title, agency:o.agency, value:o.value,
             naics:naics||'332312', setAside:'SDVOSB', status:'open', state:state, city:o.city,
             deadline:new Date(Date.now()+o.deadline*86400000).toISOString(), solNum:o.sol,
             posted:new Date(Date.now()-7*86400000).toISOString(), contact:'',
             url:STATE_SOURCES[state]||'https://sam.gov', score:78+Math.floor(Math.random()*15) };
  });
}
"""

NEW_SUB_MOCK = """function getSubcontractData(state, naics) {
  var TECH_NAICS = ['511210','541511','541512','541513','541519','541715','518210','519130'];
  var isTech = TECH_NAICS.indexOf(naics||'') >= 0;
  if (isTech) {
    var subs = [
      {title:'IT Subcontract — Federal Agency Web Portal ('+state+')',prime:'Booz Allen Hamilton Federal',value:125000,days:14,sol:'BAH-IT-SUB-2025-'+state+'-019'},
      {title:'Software Development Sub — DoD Systems Integration',prime:'Leidos Federal Solutions',value:285000,days:21,sol:'LFS-2025-IT-044'},
      {title:'Cybersecurity Support Sub — FISMA Compliance',prime:'SAIC Government Services',value:195000,days:28,sol:'SAIC-CYBER-'+state+'-2025-033'},
    ];
    return subs.map(function(s) {
      return { id:'sub_'+s.sol, source:'subcontract', title:s.title, agency:'Prime: '+s.prime,
               value:s.value, naics:naics||'541511', setAside:'SDVOSB', status:'open',
               state:state, city:'',
               deadline:new Date(Date.now()+s.days*86400000).toISOString(), solNum:s.sol,
               posted:new Date(Date.now()-3*86400000).toISOString(), contact:'',
               url:'https://web.sba.gov/subnet', score:82+Math.floor(Math.random()*12) };
    });
  }
  var subs = [
    {title:'Structural Welding Sub — Military Installation ('+state+')',prime:'Cajun Defense Construction LLC',value:35000,days:10,sol:'CDC-SUB-2025-'+state+'-019'},
    {title:'Custom Metal Fabrication Sub — Federal Renovation',prime:'Gulf Coast Federal Contractors Inc.',value:18000,days:7,sol:'GCFC-2025-FED-044'},
    {title:'SDVOSB Welding Sub — DoD Facility Upgrade',prime:'Veteran Construction Partners LLC',value:52000,days:14,sol:'VCP-2025-DOD-'+state+'-033'},
  ];
  return subs.map(function(s) {
    return { id:'sub_'+s.sol, source:'subcontract', title:s.title, agency:'Prime: '+s.prime,
             value:s.value, naics:naics||'332312', setAside:'SDVOSB', status:'open',
             state:state, city:'',
             deadline:new Date(Date.now()+s.days*86400000).toISOString(), solNum:s.sol,
             posted:new Date(Date.now()-3*86400000).toISOString(), contact:'',
             url:'https://web.sba.gov/subnet', score:82+Math.floor(Math.random()*12) };
  });
}
"""

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Keyword placeholder
if 'placeholder="welding, fabrication, steel..."' in html:
    html = html.replace('placeholder="welding, fabrication, steel..."', 'placeholder="Keywords (optional)"', 1)
    print("  OK  keyword placeholder updated")
else:
    print("  SKIP keyword placeholder (already updated)")

# 2. scoreContract — remove hardcoded fab NAICS lines
score_old = "  const naics = o.naicsCode||'';\n  if(['332312','238190','332313','332999'].includes(naics)) s+=15;\n"
if score_old in html:
    html = html.replace(score_old, "", 1)
    print("  OK  scoreContract hardcoded NAICS removed")
else:
    print("  SKIP scoreContract (already updated or not found)")

# 3. getSubcontractData call — add naics param
sub_old = 'contracts.push(...getSubcontractData(states3[i3]));'
sub_new = 'contracts.push(...getSubcontractData(states3[i3], filters.naics));'
if sub_old in html:
    html = html.replace(sub_old, sub_new, 1)
    print("  OK  getSubcontractData call updated to pass naics")
else:
    print("  SKIP getSubcontractData call (already updated)")

# 4. getFederalMockData — replace full function
if 'function getFederalMockData(filters)' in html:
    s = html.index('function getFederalMockData(filters)')
    e = html.index('\nasync function fetchContracts', s)
    html = html[:s] + NEW_FEDERAL_MOCK + html[e:]
    print("  OK  getFederalMockData replaced with NAICS-aware version")
else:
    print("  SKIP getFederalMockData (not found)")

# 5. getStateMockData — replace full function
if 'function getStateMockData(state, naics)' in html:
    s = html.index('function getStateMockData(state, naics)')
    e = html.index('\nfunction getSubcontractData(', s)
    html = html[:s] + NEW_STATE_MOCK + html[e:]
    print("  OK  getStateMockData replaced with NAICS-aware version")
else:
    print("  SKIP getStateMockData (not found)")

# 6. getSubcontractData — replace full function
if 'function getSubcontractData(state)' in html:
    s = html.index('function getSubcontractData(state)')
    e = html.index('\nfunction getStateMockData(', s)
    html = html[:s] + NEW_SUB_MOCK + html[e:]
    print("  OK  getSubcontractData replaced with NAICS-aware version")
else:
    print("  SKIP getSubcontractData (not found — may already be updated)")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nAll patches applied. Now run:")
print("  git add -A")
print('  git commit -m "fix: NAICS-aware contract search"')
print("  git push")
