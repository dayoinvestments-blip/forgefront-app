/**
 * ForgeFront — SAM.gov Contract Discovery
 * Fetches real federal opportunities from SAM.gov API v2
 * Falls back to curated mock data if API is unavailable
 *
 * Required env var: SAM_GOV_API_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Mock data fallback — shown when SAM.gov is unreachable ──────────────────
// Realistic SDVOSB opportunities across priority states
function getMockContracts(filters) {
  var state   = filters.state   || '';
  var naics   = filters.naics   || '332312';
  var keyword = (filters.keyword || '').toLowerCase();

  var ALL = [
    { id:'mock_f1', source:'federal', title:'Structural Steel Fabrication & Installation — VAMC Campus Renovation',       agency:'Dept. of Veterans Affairs',          value:185000, naics:'332312', setAside:'SDVOSB', state:'VA', city:'Richmond',     daysOut:30, sol:'36C24825R0112' },
    { id:'mock_f2', source:'federal', title:'Welding & Metal Fabrication IDIQ — Military Installation Maintenance',       agency:'Dept. of Army',                      value:320000, naics:'332312', setAside:'SDVOSB', state:'TX', city:'Fort Hood',    daysOut:45, sol:'W912DR25R0041' },
    { id:'mock_f3', source:'federal', title:'Mobile Welding Services BPA — Air Force Base Facilities',                    agency:'Dept. of Air Force',                 value:95000,  naics:'238190', setAside:'SDVOSB', state:'NC', city:'Goldsboro',   daysOut:22, sol:'FA485225R0019' },
    { id:'mock_f4', source:'federal', title:'Structural Steel Repair & Fabrication — Federal Courthouse Renovation',      agency:'General Services Administration',     value:240000, naics:'332312', setAside:'SBA',    state:'MD', city:'Baltimore',   daysOut:35, sol:'GS11P25RC0044' },
    { id:'mock_f5', source:'federal', title:'Custom Metal Fabrication — Pentagon Maintenance Facility',                   agency:'Defense Facilities Activity',         value:285000, naics:'332312', setAside:'SDVOSB', state:'VA', city:'Arlington',   daysOut:28, sol:'DFA-VA25-1102' },
    { id:'mock_f6', source:'federal', title:'Welding Services — Fort Bragg Barracks Renovation',                          agency:'Dept. of Army — Fort Bragg',          value:380000, naics:'332312', setAside:'SDVOSB', state:'NC', city:'Fayetteville', daysOut:31, sol:'W912PM25R0061' },
    { id:'mock_f7', source:'federal', title:'Metal Door & Frame Systems — Camp Lejeune Marine Corps Base',                agency:'Marine Corps Installations East',     value:145000, naics:'332312', setAside:'SDVOSB', state:'NC', city:'Jacksonville', daysOut:24, sol:'M0026425R0022' },
    { id:'mock_f8', source:'federal', title:'Structural Welding — Redstone Arsenal Facilities Upgrade',                   agency:'Dept. of Army — Redstone Arsenal',    value:415000, naics:'332312', setAside:'SDVOSB', state:'AL', city:'Huntsville',  daysOut:38, sol:'W31P4Q25R0088' },
    { id:'mock_f9', source:'federal', title:'Fabrication Services — Keesler AFB Facilities Renovation',                   agency:'Air Force — Keesler AFB',             value:88000,  naics:'332312', setAside:'SDVOSB', state:'MS', city:'Biloxi',      daysOut:16, sol:'FA700025R0011' },
    { id:'mock_f10',source:'federal', title:'Parish Road Sign Fabrication & Installation',                                 agency:'Webster Parish Police Jury',          value:28000,  naics:'332312', setAside:'SDVOSB', state:'LA', city:'Minden',      daysOut:14, sol:'WPPJ2025-0017'},
    { id:'mock_f11',source:'federal', title:'HVAC Metal Ductwork Fabrication — Andrews AFB Renovation',                   agency:'Air Force — Joint Base Andrews',      value:195000, naics:'238220', setAside:'SDVOSB', state:'MD', city:'Suitland',    daysOut:19, sol:'FA701425R0033' },
    { id:'mock_f12',source:'federal', title:'Structural Steel — Aberdeen Proving Ground Building 400',                    agency:'Dept. of Army — Aberdeen PG',         value:340000, naics:'332312', setAside:'SDVOSB', state:'MD', city:'Aberdeen',    daysOut:41, sol:'W91CRB25R0019' },
    { id:'mock_f13',source:'federal', title:'Security Barrier Fabrication & Installation — DHS Federal Campus',           agency:'Dept. of Homeland Security',          value:180000, naics:'332312', setAside:'SDVOSB', state:'DC', city:'Washington',  daysOut:15, sol:'70RSAT25R00112'},
    { id:'mock_f14',source:'federal', title:'Metal Fabrication IDIQ — Lackland AFB Facilities Support',                   agency:'Air Force — JBSA Lackland',           value:220000, naics:'332312', setAside:'SDVOSB', state:'TX', city:'San Antonio', daysOut:28, sol:'FA300225R0019' },
    { id:'mock_f15',source:'federal', title:'Structural Welding — Fort Gordon Signal Corps Facilities',                   agency:'Dept. of Army — Fort Gordon',         value:275000, naics:'332312', setAside:'SDVOSB', state:'GA', city:'Augusta',     daysOut:27, sol:'W9124C25R0044' },
  ];

  var results = ALL;

  // State filter
  if (state) {
    results = results.filter(function(c) { return c.state === state; });
    // If nothing in that state, return nearest neighboring states
    if (!results.length) results = ALL.slice(0, 5);
  }

  // Keyword filter
  if (keyword) {
    results = results.filter(function(c) {
      return c.title.toLowerCase().indexOf(keyword) >= 0 ||
             c.agency.toLowerCase().indexOf(keyword) >= 0;
    });
    if (!results.length) results = ALL.slice(0, 4);
  }

  var now = Date.now();
  return results.map(function(c) {
    return {
      id:          c.id,
      source:      c.source,
      title:       c.title,
      agency:      c.agency,
      value:       c.value,
      naics:       c.naics,
      setAside:    c.setAside,
      status:      'open',
      state:       c.state,
      city:        c.city,
      deadline:    new Date(now + c.daysOut * 86400000).toISOString(),
      solNum:      c.sol,
      posted:      new Date(now - 7 * 86400000).toISOString(),
      url:         'https://sam.gov/opp/' + c.sol,
      score:       75 + Math.floor(Math.random() * 20),
      _source_tag: 'mock_fallback',
    };
  });
}

// ── Transform SAM.gov API response to ForgeFront contract shape ──────────────
function transformSAMOpportunity(opp) {
  var addr   = opp.placeOfPerformance || {};
  var city   = (addr.city   && addr.city.name)  || '';
  var state  = (addr.state  && addr.state.code) || '';
  var value  = 0;
  if (opp.award && opp.award.amount)               value = parseFloat(opp.award.amount) || 0;
  if (opp.estimatedTotalValue)                     value = parseFloat(opp.estimatedTotalValue) || value;

  var score = 50;
  var sa = (opp.typeOfSetAsideDescription || '').toLowerCase();
  if (sa.includes('sdvosb') || sa.includes('service-disabled')) score += 30;
  else if (sa.includes('veteran') || sa.includes('vosb'))       score += 20;
  else if (sa.includes('small business'))                       score += 10;
  if (['332312','238190','332313','332999'].includes(opp.naicsCode)) score += 15;
  if (value > 10000 && value < 2000000)                         score += 5;
  score = Math.min(score, 99);

  return {
    id:       opp.noticeId || opp.solicitationNumber || ('sam_' + Math.random().toString(36).slice(2)),
    source:   'federal',
    title:    opp.title || 'Federal Opportunity',
    agency:   (opp.fullParentPathName || opp.departmentName || opp.subtierName || ''),
    value:    value,
    naics:    opp.naicsCode || '',
    setAside: opp.typeOfSetAsideDescription || opp.typeOfSetAside || '',
    status:   'open',
    state:    state,
    city:     city,
    deadline: opp.responseDeadLine || opp.archiveDate || '',
    solNum:   opp.solicitationNumber || '',
    posted:   opp.postedDate || '',
    url:      opp.uiLink || ('https://sam.gov/opp/' + (opp.noticeId || '')),
    score:    score,
  };
}

// ── Build SAM.gov query date range ───────────────────────────────────────────
function postedFrom(days) {
  var d = new Date(Date.now() - (parseInt(days) || 90) * 86400000);
  return [
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  var params  = event.queryStringParameters || {};
  var naics   = params.naics    || '332312';
  var state   = params.state    || '';
  var setaside= params.setaside || 'SDVOSB';
  var days    = params.days     || '90';
  var keyword = params.keyword  || '';
  var samKey  = process.env.SAM_GOV_API_KEY || '';

  // No API key — return mock data immediately
  if (!samKey) {
    console.warn('[FF-contracts] SAM_GOV_API_KEY not set — returning mock data');
    var mock = getMockContracts({ state, naics, keyword });
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: mock, source: 'mock', reason: 'no_api_key' }),
    };
  }

  // Build SAM.gov API request
  var query = new URLSearchParams({
    api_key:        samKey,
    limit:          '100',
    offset:         '0',
    postedFrom:     postedFrom(days),
    postedTo:       [
      String(new Date().getMonth() + 1).padStart(2, '0'),
      String(new Date().getDate()).padStart(2, '0'),
      new Date().getFullYear(),
    ].join('/'),
    active:         'true',
  });

  if (naics)    query.set('naics',         naics);
  if (state)    query.set('place_of_performance_state', state);
  if (setaside) query.set('typeOfSetAside', setaside);
  if (keyword)  query.set('q', keyword);

  var samURL = 'https://api.sam.gov/opportunities/v2/search?' + query.toString();

  try {
    var controller = new AbortController();
    var timeout    = setTimeout(function() { controller.abort(); }, 10000);

    var res = await fetch(samURL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error('SAM.gov API returned ' + res.status);
    }

    var data = await res.json();
    var opps = (data.opportunitiesData || data._embedded && data._embedded.results || []);
    var contracts = opps.map(transformSAMOpportunity);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: contracts, source: 'sam_gov', total: data.totalRecords || contracts.length }),
    };

  } catch(err) {
    // SAM.gov is down or timed out — fall back to mock data gracefully
    console.error('[FF-contracts] SAM.gov API error:', err.message, '— falling back to mock data');
    var fallback = getMockContracts({ state, naics, keyword });
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        contracts: fallback,
        source:    'mock',
        reason:    'sam_api_error',
        error:     err.message,
      }),
    };
  }
};
