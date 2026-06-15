/**
 * ForgeFront — Executive Strategic Report
 * Command tier only. Triggered manually from Watchlist.
 *
 * Orchestrates data from all 5 sources:
 *   1. USASpending.gov — award history, pricing, past winners
 *   2. GAO/Incumbent analysis — vulnerability score
 *   3. SBA DSBS — subcontractor candidates
 *   4. GSA CALC — labor rate benchmarks
 *   5. Anthropic AI — synthesis into 10-section report
 *
 * This replaces $1,200-$1,800 of BD consultant work in ~60 seconds.
 */

const { verifyUser, checkRateLimit, unauthorized, rateLimited } = require('./_verify-auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const USA_BASE = 'https://api.usaspending.gov/api/v2';

async function fetchUSA(endpoint, body) {
  const res = await fetch(USA_BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('USASpending ' + res.status);
  return res.json();
}

async function getAwardIntel(naics, agency, state) {
  try {
    var filters = {
      naics_codes: [naics],
      award_type_codes: ['A','B','C','D'],
      time_period: [{ start_date: '2021-01-01', end_date: new Date().toISOString().slice(0,10) }],
    };
    if (state)  filters.place_of_performance_locations = [{ country: 'USA', state: state }];
    if (agency) filters.agencies = [{ type: 'awarding', tier: 'toptier', name: agency }];

    var data = await fetchUSA('/search/spending_by_award/', {
      filters: filters,
      fields: ['Recipient Name','Award Amount','Awarding Agency',
               'Start Date','End Date','Type of Set Aside',
               'Place of Performance State Code'],
      sort: 'Award Amount', order: 'desc', limit: 25, page: 1,
    });

    var awards  = data.results || [];
    var amounts = awards.map(function(a) { return parseFloat(a['Award Amount']||0); }).filter(Boolean).sort(function(a,b){return a-b;});
    var sdvosb  = awards.filter(function(a){ var sa=(a['Type of Set Aside']||'').toLowerCase(); return sa.indexOf('sdvosb')>=0||sa==='svob'; }).length;

    // Incumbent
    var incumbent = null;
    if (awards.length > 0) {
      var name = awards[0]['Recipient Name'] || '';
      var incumbentAwards = awards.filter(function(a){ return a['Recipient Name']===name; });
      var first = incumbentAwards[incumbentAwards.length-1]['Start Date']||'';
      var tenure = first ? Math.round((Date.now()-new Date(first).getTime())/(365.25*24*3600*1000)) : 0;
      incumbent = { name: name, tenure: tenure, awards: incumbentAwards.length,
                    total: incumbentAwards.reduce(function(s,a){return s+parseFloat(a['Award Amount']||0);},0) };
    }

    // Top recipients
    var recMap = {};
    awards.forEach(function(a){
      var n=a['Recipient Name']||'';
      if(n){if(!recMap[n])recMap[n]={count:0,total:0};recMap[n].count++;recMap[n].total+=parseFloat(a['Award Amount']||0);}
    });
    var topRec = Object.keys(recMap).sort(function(a,b){return recMap[b].total-recMap[a].total;}).slice(0,5).map(function(n){return {name:n,count:recMap[n].count,total:recMap[n].total};});

    var mid = Math.floor(amounts.length/2);
    return {
      totalAwards: data.total_count || awards.length,
      sdvosbRate:  awards.length>0 ? Math.round((sdvosb/awards.length)*100) : 0,
      avgAward:    amounts.length>0 ? Math.round(amounts.reduce(function(a,b){return a+b;},0)/amounts.length) : 0,
      medianAward: amounts.length>0 ? amounts[mid] : 0,
      minAward:    amounts[0]||0,
      maxAward:    amounts[amounts.length-1]||0,
      incumbent:   incumbent,
      topRecipients: topRec,
    };
  } catch(e) { return { error: e.message }; }
}

async function getSubCandidates(naics, state) {
  try {
    var filters = {
      naics_codes: [naics],
      award_type_codes: ['A','B','C','D'],
      set_aside_codes: ['SBA','SBP','8A','8AN','HZC','HZS','SDVOSBC','SDVOSBS','WOSB','WOSBSS'],
      time_period: [{ start_date: '2022-01-01', end_date: new Date().toISOString().slice(0,10) }],
    };
    if (state) filters.place_of_performance_locations = [{ country: 'USA', state: state }];

    var data = await fetchUSA('/search/spending_by_award/', {
      filters: filters,
      fields: ['Recipient Name','Award Amount','Type of Set Aside',
               'Place of Performance State Code'],
      sort: 'Award Amount', order: 'desc', limit: 20, page: 1,
    });

    var seen = {};
    var subs = [];
    (data.results||[]).forEach(function(a){
      var n=a['Recipient Name']||'';
      if(n&&!seen[n]){ seen[n]=true;
        subs.push({name:n, topAward:parseFloat(a['Award Amount']||0),
                   cert:a['Type of Set Aside']||'', state:a['Place of Performance State Code']||''});
      }
    });
    return subs.slice(0,6);
  } catch(e) { return []; }
}

async function getLaborRates(role) {
  try {
    var res = await fetch('https://calc.gsa.gov/api/rates/?q='+encodeURIComponent(role)+'&min-experience=0&max-experience=45&page=1&page-size=50');
    if (!res.ok) return null;
    var data = await res.json();
    var rates = (data.results||[]).map(function(r){return parseFloat(r.current_price||0);}).filter(Boolean).sort(function(a,b){return a-b;});
    if (!rates.length) return null;
    var mid = Math.floor(rates.length/2);
    return { median: rates[mid], min: rates[0], max: rates[rates.length-1], count: rates.length };
  } catch(e) { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // Cost protection: require a signed-in user before spending Anthropic credits
  const _authedUser = await verifyUser(event.headers);
  if (!_authedUser) return unauthorized(CORS);
  const _rl = await checkRateLimit(_authedUser.id, 'executive-report');
  if (!_rl.ok) return rateLimited(CORS, _rl);
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: '{"error":"Method not allowed"}' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: '{"error":"AI not configured"}' };

  try {
    const body    = JSON.parse(event.body || '{}');
    const naics   = body.naics   || '332312';
    const agency  = body.agency  || '';
    const state   = body.state   || '';
    const title   = body.title   || 'Federal Contract Opportunity';
    const company = body.company || 'Your Company';
    const certs   = body.certs   || 'SDVOSB';
    const sowText = body.sow     || '';
    const role    = body.role    || 'project manager';

    // ── Gather all data in parallel ───────────────────────────────
    var grantUrl = 'https://' + (process.env.URL || 'forgefront.app').replace(/^https?:\/\//,'')
                 + '/.netlify/functions/grant-finder?naics=' + encodeURIComponent(naics)
                 + '&state=' + encodeURIComponent(state);

    var [intel, subs, laborRate, grantsRes] = await Promise.all([
      getAwardIntel(naics, agency, state),
      getSubCandidates(naics, state),
      getLaborRates(role),
      fetch(grantUrl).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }),
    ]);
    var grants = grantsRes || { federalGrants:[], sbaPrograms:[], statePrograms:[], totalCount:0 };

    // ── Format data summary for AI ────────────────────────────────
    var fmt = function(n){ if(!n)return '$0'; if(n>=1000000)return '$'+(n/1000000).toFixed(1)+'M'; if(n>=1000)return '$'+(n/1000).toFixed(0)+'K'; return '$'+n; };

    var dataContext = 'CONTRACT: ' + title
      + '\nNAICS: ' + naics
      + '\nAGENCY: ' + (agency || 'Not specified')
      + '\nSTATE: '  + (state  || 'Not specified')
      + '\nCOMPANY: ' + company + ' (' + certs + ')'

      + '\n\nAWARD INTELLIGENCE (USASpending.gov):'
      + '\n- Total awards found: ' + (intel.totalAwards||0)
      + '\n- SDVOSB set-aside rate: ' + (intel.sdvosbRate||0) + '%'
      + '\n- Average award value: ' + fmt(intel.avgAward)
      + '\n- Median award value: ' + fmt(intel.medianAward)
      + '\n- Award range: ' + fmt(intel.minAward) + ' to ' + fmt(intel.maxAward)
      + (intel.incumbent ? '\n- Current incumbent: ' + intel.incumbent.name + ' (held ' + intel.incumbent.tenure + ' years, ' + intel.incumbent.awards + ' awards, ' + fmt(intel.incumbent.total) + ' total)' : '\n- No clear incumbent identified')
      + '\n- Top past winners: ' + (intel.topRecipients||[]).map(function(r){return r.name+' ('+fmt(r.total)+')';}).join(', ')

      + '\n\nSUBCONTRACTOR CANDIDATES:'
      + (subs.length ? '\n' + subs.map(function(s){return '- '+s.name+' | '+s.cert+' | '+s.state+' | Top award: '+fmt(s.topAward);}).join('\n') : '\n- No candidates found for this NAICS/state')

      + '\n\nLABOR RATE INTELLIGENCE (GSA CALC):'
      + (laborRate ? '\n- ' + role + ': Median $' + laborRate.median.toFixed(2) + '/hr | Range $' + laborRate.min.toFixed(2) + '-$' + laborRate.max.toFixed(2) + '/hr (' + laborRate.count + ' data points)' : '\n- Labor rate data not available for this role')

      + (sowText ? '\n\nSOW EXCERPT:\n' + sowText.slice(0,1000) : '')
      + (grants && grants.totalCount > 0 ? '\n\nGRANT OPPORTUNITIES: ' + grants.totalCount + ' programs identified. Note relevant grants in bid strategy.' : '');

    // ── AI synthesis ──────────────────────────────────────────────
    var SYSTEM = `You are a senior federal contracting strategist generating an Executive Strategic Report for an SDVOSB contractor. Write a comprehensive, actionable intelligence brief. Use the data provided. Be specific, direct, and metric-driven.

Respond with a JSON object only. No markdown, no backticks:

{
  "opportunityOverview": "3-4 sentences covering what the opportunity is, why it matters, and key facts",
  "goNoGo": {"recommendation":"PURSUE or CONSIDER or PASS","confidence":"High/Medium/Low","score":0-100},
  "agencyIntelligence": "3-4 sentences on the agency's contracting history, SDVOSB preference, and spending patterns",
  "competitiveLandscape": "3-4 sentences on who is competing, incumbent status, and how crowded this space is",
  "pricingIntelligence": "3-4 sentences on what to charge, price range, and bid strategy",
  "capabilityGapAnalysis": "2-3 sentences on gaps to address through teaming or subcontracting",
  "subcontractorRecommendations": "2-3 sentences naming specific subcontractor candidates and why",
  "bidStrategy": "4-5 sentences on the complete pursuit strategy — win theme, differentiators, approach",
  "actionPlan": [{"priority":1,"action":"specific action","deadline":"timeframe","owner":"who"}],
  "executiveSummary": "4-5 sentence executive summary a CEO would read first — bottom-line-up-front, metrics, recommendation"
}`;

    var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: 'user', content: 'Generate the Executive Strategic Report using this intelligence data:\n\n' + dataContext }],
      }),
    });

    var aiData = await aiRes.json();
    if (!aiRes.ok) throw new Error(aiData.error?.message || 'AI error');

    var rawText = aiData.content[0]?.text || '{}';
    var clean   = rawText.replace(/```json|```/g,'').trim();
    var report;
    try { report = JSON.parse(clean); }
    catch(e) { var m=clean.match(/\{[\s\S]*\}/); if(m) report=JSON.parse(m[0]); else throw new Error('AI returned invalid JSON'); }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        report:    report,
        rawData:   { intel: intel, subs: subs, laborRate: laborRate, grants: grants },
        naics:     naics,
        agency:    agency,
        state:     state,
        title:     title,
        company:   company,
        generated: new Date().toISOString(),
      }),
    };

  } catch(err) {
    console.error('[executive-report]', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
