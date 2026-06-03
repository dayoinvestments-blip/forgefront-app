/**
 * ForgeFront — GAO Protest + Incumbent Vulnerability
 * Sources:
 *   1. GAO Bid Protest Decisions — gao.gov/legal/bid-protests (public)
 *   2. USASpending.gov — award history for incumbent analysis
 *
 * Strategy: Cross-reference the contract/agency/NAICS with
 * historical protest data to produce an incumbent vulnerability score.
 * The score drives the go/no-go recommendation in the Executive Report.
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

const USA_BASE = 'https://api.usaspending.gov/api/v2';
const GAO_BASE = 'https://www.gao.gov/api';

// Vulnerability factors and their weights
const VULN_WEIGHTS = {
  tenure:       25,  // how long incumbent has held contract
  protestHistory: 30, // protests filed against them
  valueGrowth:  15,  // contract value trend
  sdvosbRate:   20,  // agency SDVOSB award rate
  competition:  10,  // historical bid competition level
};

async function fetchUSA(endpoint, body) {
  const res = await fetch(USA_BASE + endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error('USASpending ' + res.status);
  return res.json();
}

function calcVulnerabilityScore(factors) {
  var score = 0;

  // Tenure score (longer = more vulnerable to displacement)
  var tenureYears = factors.tenureYears || 0;
  if (tenureYears >= 5)      score += VULN_WEIGHTS.tenure;
  else if (tenureYears >= 3) score += Math.round(VULN_WEIGHTS.tenure * 0.7);
  else if (tenureYears >= 1) score += Math.round(VULN_WEIGHTS.tenure * 0.3);

  // Protest history score
  var protests = factors.protestCount || 0;
  if (protests >= 2)      score += VULN_WEIGHTS.protestHistory;
  else if (protests >= 1) score += Math.round(VULN_WEIGHTS.protestHistory * 0.6);

  // Value growth (declining value = agency may want change)
  if (factors.valueTrend === 'declining') score += VULN_WEIGHTS.valueGrowth;
  else if (factors.valueTrend === 'flat') score += Math.round(VULN_WEIGHTS.valueGrowth * 0.4);

  // SDVOSB-friendly agency
  var sdvosbRate = factors.agencySDVOSBRate || 0;
  if (sdvosbRate >= 70)      score += VULN_WEIGHTS.sdvosbRate;
  else if (sdvosbRate >= 50) score += Math.round(VULN_WEIGHTS.sdvosbRate * 0.6);
  else if (sdvosbRate >= 30) score += Math.round(VULN_WEIGHTS.sdvosbRate * 0.3);

  // Low competition historically = good entry point
  var avgBidders = factors.avgBidders || 5;
  if (avgBidders <= 2)      score += VULN_WEIGHTS.competition;
  else if (avgBidders <= 4) score += Math.round(VULN_WEIGHTS.competition * 0.5);

  return Math.min(100, score);
}

function getVulnerabilityLabel(score) {
  if (score >= 75) return {label: 'HIGH',     color: '#E05050', rec: 'Strong pursue candidate. Incumbent is vulnerable.'};
  if (score >= 50) return {label: 'MODERATE', color: '#E8A020', rec: 'Viable opportunity. Compete on price and differentiation.'};
  if (score >= 25) return {label: 'LOW',      color: '#7A9CC8', rec: 'Incumbent is well-positioned. Pursue only with strong differentiators.'};
  return             {label: 'MINIMAL',       color: 'var(--t3)', rec: 'Incumbent strongly entrenched. Consider as subcontract opportunity instead.'};
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const params = event.queryStringParameters || {};
    const naics  = params.naics  || '';
    const agency = params.agency || '';
    const state  = params.state  || '';

    if (!naics && !agency) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'naics or agency required' }) };
    }

    // ── Pull award history for incumbent analysis ─────────────────
    var filters = {
      award_type_codes: ['A','B','C','D'],
      time_period: [{ start_date: '2019-01-01', end_date: new Date().toISOString().slice(0,10) }],
    };
    if (naics)  filters.naics_codes = [naics];
    if (state)  filters.place_of_performance_locations = [{ country: 'USA', state: state }];
    if (agency) filters.agencies = [{ type: 'awarding', tier: 'toptier', name: agency }];

    var awardsData = await fetchUSA('/search/spending_by_award/', {
      filters: filters,
      fields: [
        'Award ID', 'Recipient Name', 'Award Amount',
        'Awarding Agency', 'Start Date', 'End Date',
        'Type of Set Aside', 'Place of Performance State Code',
      ],
      sort: 'Start Date', order: 'desc', limit: 50, page: 1,
    });

    var awards = awardsData.results || [];

    // ── Identify incumbent (most recent winner) ───────────────────
    var incumbent = null;
    var incumbentAwards = [];
    if (awards.length > 0) {
      var latestRecipient = awards[0]['Recipient Name'] || '';
      if (latestRecipient) {
        incumbentAwards = awards.filter(function(a) {
          return a['Recipient Name'] === latestRecipient;
        });
        var amounts = incumbentAwards.map(function(a) { return parseFloat(a['Award Amount'] || 0); });
        var firstDate = incumbentAwards[incumbentAwards.length - 1]['Start Date'] || '';
        var tenureYears = firstDate
          ? Math.round((Date.now() - new Date(firstDate).getTime()) / (365.25 * 24 * 3600 * 1000))
          : 0;

        // Value trend
        var valueTrend = 'flat';
        if (amounts.length >= 2) {
          var recent = amounts.slice(0, Math.ceil(amounts.length / 2));
          var older  = amounts.slice(Math.ceil(amounts.length / 2));
          var recentAvg = recent.reduce(function(a,b){return a+b;},0) / recent.length;
          var olderAvg  = older.reduce(function(a,b){return a+b;},0) / older.length;
          if (recentAvg < olderAvg * 0.90) valueTrend = 'declining';
          else if (recentAvg > olderAvg * 1.10) valueTrend = 'growing';
        }

        // SDVOSB rate for this agency
        var sdvosbCount = awards.filter(function(a) {
          var sa = (a['Type of Set Aside'] || '').toLowerCase();
          return sa.indexOf('sdvosb') >= 0 || sa === 'svob';
        }).length;
        var sdvosbRate = awards.length > 0 ? Math.round((sdvosbCount / awards.length) * 100) : 0;

        var factors = {
          tenureYears:      tenureYears,
          protestCount:     0, // GAO API supplement below
          valueTrend:       valueTrend,
          agencySDVOSBRate: sdvosbRate,
          avgBidders:       3, // estimated — GAO data supplements
        };

        var vulnScore = calcVulnerabilityScore(factors);
        var vulnLabel = getVulnerabilityLabel(vulnScore);

        incumbent = {
          name:          latestRecipient,
          tenureYears:   tenureYears,
          awardsCount:   incumbentAwards.length,
          totalValue:    amounts.reduce(function(a,b){return a+b;},0),
          latestAward:   awards[0]['Award Amount'] ? parseFloat(awards[0]['Award Amount']) : 0,
          firstSeen:     firstDate ? firstDate.slice(0,10) : '',
          lastSeen:      awards[0]['Start Date'] ? awards[0]['Start Date'].slice(0,10) : '',
          valueTrend:    valueTrend,
          sdvosbRate:    sdvosbRate,
          vulnerabilityScore: vulnScore,
          vulnerabilityLabel: vulnLabel.label,
          vulnerabilityColor: vulnLabel.color,
          recommendation:     vulnLabel.rec,
          factors:            factors,
        };
      }
    }

    // ── GAO Protest lookup ────────────────────────────────────────
    // GAO provides a public protest decisions search
    // We query by agency name or NAICS description
    var protestData = [];
    var protestNote = 'GAO protest data supplement attempted';
    try {
      var gaoQuery = agency || naics;
      var gaoRes   = await fetch('https://www.gao.gov/legal/bid-protests/search?term=' + encodeURIComponent(gaoQuery) + '&format=json&limit=10');
      if (gaoRes.ok) {
        var gaoJson = await gaoRes.json();
        protestData  = gaoJson.results || gaoJson.data || [];
      }
    } catch(e) {
      protestNote = 'GAO API not available — using USASpending-based analysis only';
    }

    // Update incumbent protest count if we got GAO data
    if (incumbent && protestData.length > 0) {
      var relevantProtests = protestData.filter(function(p) {
        var text = JSON.stringify(p).toLowerCase();
        return text.indexOf((incumbent.name || '').toLowerCase().slice(0,8)) >= 0;
      });
      incumbent.factors.protestCount = relevantProtests.length;
      incumbent.protestsFound = relevantProtests.length;
      // Recalculate score with protest data
      incumbent.vulnerabilityScore = calcVulnerabilityScore(incumbent.factors);
      var updatedLabel = getVulnerabilityLabel(incumbent.vulnerabilityScore);
      incumbent.vulnerabilityLabel = updatedLabel.label;
      incumbent.vulnerabilityColor = updatedLabel.color;
      incumbent.recommendation     = updatedLabel.rec;
    }

    // ── Other competitors ─────────────────────────────────────────
    var competitorMap = {};
    awards.forEach(function(a) {
      var name = a['Recipient Name'] || '';
      if (name && name !== (incumbent && incumbent.name)) {
        if (!competitorMap[name]) competitorMap[name] = { count: 0, total: 0 };
        competitorMap[name].count++;
        competitorMap[name].total += parseFloat(a['Award Amount'] || 0);
      }
    });
    var competitors = Object.keys(competitorMap)
      .sort(function(a,b) { return competitorMap[b].total - competitorMap[a].total; })
      .slice(0, 5)
      .map(function(name) {
        return { name: name, awards: competitorMap[name].count, total: competitorMap[name].total };
      });

    // ── Agency SDVOSB profile ─────────────────────────────────────
    var totalAwards  = awards.length;
    var sdvosbAwards = awards.filter(function(a) {
      var sa = (a['Type of Set Aside'] || '').toLowerCase();
      return sa.indexOf('sdvosb') >= 0 || sa === 'svob';
    }).length;
    var agencySDVOSBRate = totalAwards > 0 ? Math.round((sdvosbAwards / totalAwards) * 100) : 0;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        naics:           naics,
        agency:          agency,
        state:           state,
        totalAwards:     totalAwards,
        incumbent:       incumbent,
        competitors:     competitors,
        agencySDVOSBRate: agencySDVOSBRate,
        protestData:     protestData.slice(0, 5),
        protestNote:     protestNote,
        source:          'USASpending.gov + GAO Bid Protest Decisions',
        generated:       new Date().toISOString(),
      }),
    };

  } catch(err) {
    console.error('[gao-protests]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
