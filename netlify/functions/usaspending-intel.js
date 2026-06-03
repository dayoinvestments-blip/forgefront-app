/**
 * ForgeFront — USASpending Intelligence
 * Pulls award history, pricing benchmarks, and past winners
 * from the free USASpending.gov API (no key required).
 *
 * Endpoints used:
 *   POST https://api.usaspending.gov/api/v2/search/spending_by_award/
 *   POST https://api.usaspending.gov/api/v2/search/spending_by_transaction/
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

const BASE = 'https://api.usaspending.gov/api/v2';

async function fetchUSA(endpoint, body) {
  const res = await fetch(BASE + endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error('USASpending ' + res.status);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const params = event.queryStringParameters || {};
    const naics  = params.naics  || '332312';
    const state  = params.state  || '';
    const agency = params.agency || '';
    const limit  = parseInt(params.limit || '10');

    // ── Query 1: Recent contract awards by NAICS ─────────────────
    const awardFilters = {
      filters: {
        naics_codes:   [naics],
        award_type_codes: ['A','B','C','D'], // contracts only
        time_period: [{ start_date: '2022-01-01', end_date: new Date().toISOString().slice(0,10) }],
      },
      fields: [
        'Award ID','Recipient Name','Award Amount',
        'Awarding Agency','Awarding Sub Agency',
        'Start Date','End Date','Place of Performance State Code',
        'Contract Award Type','Type of Set Aside',
        'NAICS Code','NAICS Description',
        'Description',
      ],
      sort:  'Award Amount',
      order: 'desc',
      limit: limit,
      page:  1,
    };

    if (state) {
      awardFilters.filters.place_of_performance_locations = [{ country: 'USA', state: state }];
    }
    if (agency) {
      awardFilters.filters.agencies = [{ type: 'awarding', tier: 'toptier', name: agency }];
    }

    const awardsData = await fetchUSA('/search/spending_by_award/', awardFilters);
    const awards = (awardsData.results || []).map(function(a) {
      return {
        id:           a['Award ID']          || '',
        recipient:    a['Recipient Name']    || '',
        amount:       parseFloat(a['Award Amount'] || 0),
        agency:       a['Awarding Agency']   || '',
        subAgency:    a['Awarding Sub Agency'] || '',
        startDate:    a['Start Date']        || '',
        endDate:      a['End Date']          || '',
        state:        a['Place of Performance State Code'] || '',
        setAside:     a['Type of Set Aside'] || '',
        naics:        a['NAICS Code']        || naics,
        description:  a['Description']      || '',
      };
    });

    // ── Compute pricing intelligence ──────────────────────────────
    const amounts = awards.map(function(a) { return a.amount; }).filter(function(x) { return x > 0; }).sort(function(a,b) { return a-b; });
    var pricingIntel = null;
    if (amounts.length > 0) {
      var sum = amounts.reduce(function(a,b) { return a+b; }, 0);
      var mid = Math.floor(amounts.length / 2);
      pricingIntel = {
        count:    amounts.length,
        min:      amounts[0],
        max:      amounts[amounts.length - 1],
        avg:      Math.round(sum / amounts.length),
        median:   amounts.length % 2 === 0 ? Math.round((amounts[mid-1] + amounts[mid]) / 2) : amounts[mid],
        p25:      amounts[Math.floor(amounts.length * 0.25)] || amounts[0],
        p75:      amounts[Math.floor(amounts.length * 0.75)] || amounts[amounts.length-1],
      };
    }

    // ── SDVOSB set-aside rate ─────────────────────────────────────
    var sdvosbCount = awards.filter(function(a) {
      var sa = (a.setAside || '').toLowerCase();
      return sa.indexOf('sdvosb') >= 0 || sa.indexOf('service-disabled') >= 0 || sa === 'svob';
    }).length;
    var sdvosbRate = awards.length > 0 ? Math.round((sdvosbCount / awards.length) * 100) : 0;

    // ── Top agencies ─────────────────────────────────────────────
    var agencyCounts = {};
    awards.forEach(function(a) {
      if (a.agency) agencyCounts[a.agency] = (agencyCounts[a.agency] || 0) + 1;
    });
    var topAgencies = Object.keys(agencyCounts)
      .sort(function(a,b) { return agencyCounts[b] - agencyCounts[a]; })
      .slice(0, 5)
      .map(function(name) { return { name: name, count: agencyCounts[name] }; });

    // ── Top recipients (past winners = potential competitors/subs) ─
    var recipientAmounts = {};
    awards.forEach(function(a) {
      if (a.recipient) {
        if (!recipientAmounts[a.recipient]) recipientAmounts[a.recipient] = { count: 0, total: 0 };
        recipientAmounts[a.recipient].count++;
        recipientAmounts[a.recipient].total += a.amount;
      }
    });
    var topRecipients = Object.keys(recipientAmounts)
      .sort(function(a,b) { return recipientAmounts[b].total - recipientAmounts[a].total; })
      .slice(0, 8)
      .map(function(name) {
        return {
          name:    name,
          count:   recipientAmounts[name].count,
          total:   recipientAmounts[name].total,
          avg:     Math.round(recipientAmounts[name].total / recipientAmounts[name].count),
        };
      });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        naics:         naics,
        state:         state,
        agency:        agency,
        totalAwards:   awardsData.total_count || awards.length,
        awards:        awards,
        pricingIntel:  pricingIntel,
        sdvosbRate:    sdvosbRate,
        sdvosbCount:   sdvosbCount,
        topAgencies:   topAgencies,
        topRecipients: topRecipients,
        source:        'USASpending.gov',
        generated:     new Date().toISOString(),
      }),
    };

  } catch (err) {
    console.error('[usaspending-intel]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
