/**
 * ForgeFront — Subcontractor Finder
 * Finds certified small business contractors who have won federal
 * contracts in a given NAICS code and location using USASpending.gov.
 * Cross-references with set-aside codes to identify SDVOSB, 8(a),
 * HUBZone, and WOSB certified firms.
 *
 * Strategy: Pull past award winners from USASpending filtered by
 * NAICS + state + set-aside type. These are verified federal performers
 * — the best possible subcontractor leads.
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

const USA_BASE = 'https://api.usaspending.gov/api/v2';

// Set-aside codes mapped to certification labels
const SET_ASIDE_LABELS = {
  'SBA':    'Small Business',
  'SBP':    'Small Business',
  '8A':     '8(a)',
  '8AN':    '8(a)',
  'HZC':    'HUBZone',
  'HZS':    'HUBZone',
  'SDVOSBC':'SDVOSB',
  'SDVOSBS':'SDVOSB',
  'WOSB':   'WOSB',
  'WOSBSS': 'WOSB',
  'EDWOSB': 'EDWOSB',
  'LAS':    'Native American',
  'BICiv':  'Small Business',
};

async function fetchUSA(endpoint, body) {
  const res = await fetch(USA_BASE + endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error('USASpending API ' + res.status);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const params   = event.queryStringParameters || {};
    const naics    = params.naics    || '332312';
    const state    = params.state    || '';
    const certType = params.cert     || 'all'; // all, sdvosb, 8a, hubzone, wosb
    const limit    = Math.min(parseInt(params.limit || '20'), 50);

    // Build set-aside filter
    var setAsideCodes = [];
    if (certType === 'sdvosb') {
      setAsideCodes = ['SDVOSBC','SDVOSBS'];
    } else if (certType === '8a') {
      setAsideCodes = ['8A','8AN'];
    } else if (certType === 'hubzone') {
      setAsideCodes = ['HZC','HZS'];
    } else if (certType === 'wosb') {
      setAsideCodes = ['WOSB','WOSBSS','EDWOSB'];
    }
    // 'all' = no set-aside filter — returns all small business types

    var filters = {
      naics_codes:      [naics],
      award_type_codes: ['A','B','C','D'],
      time_period: [{
        start_date: '2021-01-01',
        end_date:   new Date().toISOString().slice(0, 10),
      }],
    };

    if (setAsideCodes.length > 0) {
      filters.set_aside_codes = setAsideCodes;
    } else {
      // All small business set-asides
      filters.set_aside_codes = ['SBA','SBP','8A','8AN','HZC','HZS',
                                  'SDVOSBC','SDVOSBS','WOSB','WOSBSS','EDWOSB'];
    }

    if (state) {
      filters.place_of_performance_locations = [{ country: 'USA', state: state }];
    }

    const data = await fetchUSA('/search/spending_by_award/', {
      filters: filters,
      fields: [
        'Recipient Name',
        'Recipient UEI',
        'Award Amount',
        'Awarding Agency',
        'Awarding Sub Agency',
        'Place of Performance State Code',
        'Place of Performance City Name',
        'Type of Set Aside',
        'Start Date',
        'End Date',
        'NAICS Code',
        'NAICS Description',
        'Description',
      ],
      sort:  'Award Amount',
      order: 'desc',
      limit: limit * 2, // pull more to deduplicate by recipient
      page:  1,
    });

    // Deduplicate by recipient name — keep highest award per company
    var seen = {};
    var contractors = [];
    (data.results || []).forEach(function(a) {
      var name = a['Recipient Name'] || '';
      if (!name) return;
      var amount = parseFloat(a['Award Amount'] || 0);
      if (!seen[name]) {
        seen[name] = true;
        var setAside = a['Type of Set Aside'] || '';
        var certLabel = SET_ASIDE_LABELS[setAside] || setAside || 'Small Business';
        contractors.push({
          name:        name,
          uei:         a['Recipient UEI'] || '',
          topAward:    amount,
          agency:      a['Awarding Agency'] || '',
          subAgency:   a['Awarding Sub Agency'] || '',
          state:       a['Place of Performance State Code'] || state,
          city:        a['Place of Performance City Name'] || '',
          setAside:    setAside,
          cert:        certLabel,
          naics:       a['NAICS Code'] || naics,
          naicsDesc:   a['NAICS Description'] || '',
          lastAward:   a['Start Date'] ? a['Start Date'].slice(0, 10) : '',
          description: a['Description'] || '',
          samActive:   true, // if they're in USASpending they were SAM-registered
        });
      }
    });

    // Trim to requested limit after deduplication
    contractors = contractors.slice(0, limit);

    // Compute summary stats
    var certCounts = {};
    contractors.forEach(function(c) {
      certCounts[c.cert] = (certCounts[c.cert] || 0) + 1;
    });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        naics:        naics,
        state:        state,
        certType:     certType,
        totalFound:   data.total_count || contractors.length,
        contractors:  contractors,
        certCounts:   certCounts,
        source:       'USASpending.gov federal award history',
        note:         'These companies have won federal contracts in this NAICS. Verify current SAM.gov registration before teaming.',
        generated:    new Date().toISOString(),
      }),
    };

  } catch (err) {
    console.error('[sub-finder]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
