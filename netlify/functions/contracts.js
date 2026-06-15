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

// ── In-memory cache (persists across warm Lambda invocations) ────────────────
// Keyed by query params; TTL 30 min. Cuts repeat SAM.gov calls and survives 429s.
var _samCache = {};
var _SAM_TTL = 30 * 60 * 1000;

// (Mock data removed — live SAM.gov data only)

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
    noticeId: opp.noticeId || '',
    description:     (typeof opp.description === 'string' && opp.description.indexOf('http') !== 0) ? opp.description : '',
    descriptionLink:(typeof opp.description === 'string' && opp.description.indexOf('http') === 0) ? opp.description : '',
    naicsDesc:      opp.naicsDescription || '',
    office:         opp.officeAddress ? [opp.officeAddress.city, opp.officeAddress.state].filter(Boolean).join(', ') : '',
    pocName:        (opp.pointOfContact && opp.pointOfContact[0] && opp.pointOfContact[0].fullName) || '',
    pocEmail:       (opp.pointOfContact && opp.pointOfContact[0] && opp.pointOfContact[0].email) || '',
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
  var naics   = params.naics    || '';
  var state   = params.state    || '';
  var setaside= params.setaside || 'SDVOSB';
  var days    = params.days     || '90';
  var keyword = params.keyword  || '';
  var samKey  = process.env.SAM_GOV_API_KEY || '';

  // No API key — honest empty response, never fabricated data
  if (!samKey) {
    console.warn('[FF-contracts] SAM_GOV_API_KEY not set');
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: [], source: 'none', reason: 'no_api_key',
        message: 'SAM.gov API key not configured.' }),
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

  // Serve fresh server-side cache without hitting SAM.gov
  var ckey = naics + '|' + state + '|' + setaside + '|' + days + '|' + keyword;
  var hit  = _samCache[ckey];
  if (hit && (Date.now() - hit.ts) < _SAM_TTL) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: hit.data, source: 'cache', total: hit.data.length }),
    };
  }

  try {
    var controller = new AbortController();
    var timeout    = setTimeout(function() { controller.abort(); }, 10000);

    var res = await fetch(samURL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (res.status === 429) {
      // Rate limited — serve cached REAL data if we have it, else honest empty
      if (hit && hit.data && hit.data.length) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: hit.data, source: 'cache', reason: 'rate_limited', total: hit.data.length }) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: [], source: 'none', reason: 'rate_limited',
        message: 'SAM.gov is rate-limited. Please retry in about a minute.' }) };
    }

    if (!res.ok) {
      throw new Error('SAM.gov API returned ' + res.status);
    }

    var data = await res.json();
    var opps = (data.opportunitiesData || data._embedded && data._embedded.results || []);
    var contracts = opps.map(transformSAMOpportunity);

    // Cache successful real results
    _samCache[ckey] = { ts: Date.now(), data: contracts };

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: contracts, source: 'sam_gov', total: data.totalRecords || contracts.length }),
    };

  } catch(err) {
    // SAM.gov down/timed out — serve cached REAL data if present, else honest empty
    console.error('[FF-contracts] SAM.gov API error:', err.message);
    if (hit && hit.data && hit.data.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: hit.data, source: 'cache', reason: 'sam_api_error', total: hit.data.length }) };
    }
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ contracts: [], source: 'none', reason: 'sam_api_error',
        message: 'SAM.gov is temporarily unavailable. Please retry shortly.', error: err.message }),
    };
  }
};
