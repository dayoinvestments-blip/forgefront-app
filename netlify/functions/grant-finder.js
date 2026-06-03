/**
 * ForgeFront — Grant Finder
 * Sources:
 *   1. Grants.gov API — all federal grant opportunities (free, no key)
 *   2. SBA curated programs — SBIR, STTR, veteran business grants
 *   3. State-level programs — curated by state
 *   4. USDA rural development — for rural-area businesses
 *
 * Called by the Executive Strategic Report as Section 9.
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

// SBA and federal programs always relevant to SDVOSBs
const SBA_PROGRAMS = [
  {
    title: 'SBIR — Small Business Innovation Research',
    agency: 'Small Business Administration',
    type: 'Federal',
    eligibility: 'Small businesses with fewer than 500 employees',
    description: 'Competitive program that encourages domestic small businesses to engage in federal R&D. Phase I up to $275K, Phase II up to $1.83M.',
    url: 'https://www.sbir.gov',
    relevant: ['541', '518', '336', '332', '334'],  // tech, fabrication, defense
    amount: 'Up to $1.83M',
    deadline: 'Rolling — multiple agencies post annually',
  },
  {
    title: 'STTR — Small Business Technology Transfer',
    agency: 'Small Business Administration',
    type: 'Federal',
    eligibility: 'Small businesses partnering with research institutions',
    description: 'Similar to SBIR but requires formal collaboration with a research institution. Strong for companies near universities.',
    url: 'https://www.sbir.gov/about/about-sttr',
    relevant: ['541', '518', '334'],
    amount: 'Up to $1.83M',
    deadline: 'Rolling',
  },
  {
    title: 'SBA Veterans Advantage Loan Program',
    agency: 'Small Business Administration',
    type: 'Federal — Financing',
    eligibility: 'Veteran-owned and SDVOSB businesses',
    description: 'Reduced fees on SBA 7(a) loans up to $350K for veteran-owned businesses. Not a grant but reduces capital costs significantly.',
    url: 'https://www.sba.gov/funding-programs/loans/sba-loans',
    relevant: ['all'],
    amount: 'Reduced fees on loans up to $350K',
    deadline: 'Ongoing',
  },
  {
    title: 'Boots to Business — Entrepreneurship Training',
    agency: 'SBA / Department of Defense',
    type: 'Federal — Training Grant',
    eligibility: 'Veterans, service members, military spouses',
    description: 'Free entrepreneurship education and mentorship program for the military community. Includes online follow-on course.',
    url: 'https://sbavets.force.com/s/',
    relevant: ['all'],
    amount: 'Free training program',
    deadline: 'Ongoing',
  },
  {
    title: 'EDA — Economic Development Administration Grants',
    agency: 'Department of Commerce',
    type: 'Federal',
    eligibility: 'Businesses in economically distressed areas',
    description: 'Public works and economic adjustment grants for job creation and business development in distressed communities.',
    url: 'https://www.eda.gov/funding',
    relevant: ['236', '237', '238', '332', '333'],
    amount: 'Varies — typically $100K to $3M',
    deadline: 'Rolling applications',
  },
  {
    title: 'USDA Business & Industry Loan Guarantees',
    agency: 'USDA Rural Development',
    type: 'Federal — Rural',
    eligibility: 'Businesses in rural areas (population under 50,000)',
    description: 'Loan guarantees up to 80% for rural businesses. Creates and saves jobs in rural communities.',
    url: 'https://www.rd.usda.gov/programs-services/business-programs/business-industry-loan-guarantees',
    relevant: ['all'],
    amount: 'Up to $25M guaranteed',
    deadline: 'Ongoing',
  },
  {
    title: 'DOD REPI — Readiness and Environmental Protection Integration',
    agency: 'Department of Defense',
    type: 'Federal',
    eligibility: 'Companies near military installations',
    description: 'Funding for compatible land use and conservation near military installations. Construction and environmental services.',
    url: 'https://www.repi.mil',
    relevant: ['236', '237', '238', '562'],
    amount: 'Varies by project',
    deadline: 'Annual — check repi.mil',
  },
  {
    title: 'HUBZone Small Business Program',
    agency: 'Small Business Administration',
    type: 'Federal — Certification',
    eligibility: 'Businesses in Historically Underutilized Business Zones',
    description: 'Not a direct grant but certification gives preference in federal contracting and access to HUBZone set-aside contracts.',
    url: 'https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program',
    relevant: ['all'],
    amount: 'Contract set-asides — no dollar limit',
    deadline: 'Ongoing certification',
  },
];

// State-level programs by state
const STATE_PROGRAMS = {
  'LA': [
    { title: 'LED FastStart Workforce Training', agency: 'Louisiana Economic Development', type: 'State', description: 'Free customized employee training for qualifying businesses creating jobs in Louisiana.', url: 'https://www.opportunitylouisiana.gov/business-incentives/faststart', amount: 'Varies — covers training costs' },
    { title: 'Louisiana Enterprise Zone Program', agency: 'Louisiana Economic Development', type: 'State', description: 'Tax credits for businesses creating jobs in designated enterprise zones. Up to $3,500 per new employee.', url: 'https://www.opportunitylouisiana.gov/business-incentives/enterprise-zone', amount: 'Up to $3,500 per new job' },
    { title: 'Small Business Loan Program — LEDC', agency: 'Louisiana Economic Development', type: 'State — Financing', description: 'Low-interest loans for small businesses in Louisiana creating or retaining jobs.', url: 'https://www.opportunitylouisiana.gov', amount: 'Up to $1.5M' },
  ],
  'MD': [
    { title: 'TEDCO Maryland Innovation Initiative', agency: 'TEDCO', type: 'State', description: 'Grants for commercializing technology developed at Maryland universities. Up to $200K.', url: 'https://www.tedcomd.com', amount: 'Up to $200K' },
    { title: 'Maryland SBDC — Small Business Development Center', agency: 'Maryland Department of Commerce', type: 'State', description: 'Free consulting and low-cost training for Maryland small businesses. Access to state grant programs.', url: 'https://www.marylandsbdc.org', amount: 'Free services + grant referrals' },
    { title: 'VOLT — Veteran Owned Launch and Thrive', agency: 'Maryland Department of Commerce', type: 'State — Veteran', description: 'Grant and loan program specifically for veteran-owned small businesses in Maryland.', url: 'https://commerce.maryland.gov', amount: 'Up to $50K grants' },
  ],
  'TX': [
    { title: 'Texas Enterprise Fund', agency: 'Office of the Governor', type: 'State', description: 'Closing fund for major job creation projects in Texas. Large capital investment required.', url: 'https://gov.texas.gov/business/page/texas-enterprise-fund', amount: 'Varies — major projects' },
    { title: 'Texas Small Business Fund', agency: 'Texas Department of Agriculture', type: 'State', description: 'Loans and loan guarantees for small businesses in rural Texas communities.', url: 'https://www.texasagriculture.gov', amount: 'Up to $500K' },
  ],
  'VA': [
    { title: 'Virginia Jobs Investment Program', agency: 'Virginia Economic Development Partnership', type: 'State', description: 'Funding for employee retraining when Virginia companies create new jobs or undertake major expansions.', url: 'https://www.vedp.org/incentive/virginia-jobs-investment-program-vjip', amount: 'Varies by jobs created' },
    { title: 'VASCAP — Virginia Small Business Financing Authority', agency: 'Virginia SBFA', type: 'State — Financing', description: 'Loan guarantees and direct lending for small businesses in Virginia.', url: 'https://www.sba.virginia.gov', amount: 'Up to $2M' },
  ],
  'DEFAULT': [
    { title: 'State Small Business Credit Initiative (SSBCI)', agency: 'U.S. Treasury / State Programs', type: 'Federal-State', description: 'Treasury-funded program administered by states. Check your state treasury for specific programs.', url: 'https://home.treasury.gov/policy-issues/small-business-programs/state-small-business-credit-initiative-ssbci', amount: 'Varies by state' },
    { title: 'CDFI — Community Development Financial Institutions', agency: 'U.S. Treasury', type: 'Federal', description: 'Low-cost loans and grants through certified CDFIs in your area. Search at cdfilist.cdfifund.gov.', url: 'https://www.cdfifund.gov', amount: 'Varies by CDFI' },
  ],
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const params = event.queryStringParameters || {};
    const naics  = (params.naics  || '').trim();
    const state  = (params.state  || '').toUpperCase().trim();
    const keywords = (params.keywords || '').trim();

    // ── Step 1: Query Grants.gov API ─────────────────────────────
    var federalGrants = [];
    var grantsError   = null;
    try {
      // Grants.gov v2 search API
      var searchBody = {
        rows: 10,
        keyword: keywords || (naics ? 'small business NAICS ' + naics : 'veteran small business construction'),
        oppStatuses: 'posted',
        sortBy: 'openDate|desc',
      };

      var gRes = await fetch('https://apply07.grants.gov/grantsws/rest/opportunities/search/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(searchBody),
      });

      if (gRes.ok) {
        var gData = await gRes.json();
        var opps  = gData.oppHits || [];
        federalGrants = opps.slice(0, 6).map(function(o) {
          return {
            title:     o.title        || o.oppTitle || 'Grant Opportunity',
            agency:    o.agencyName   || o.agencyCode || 'Federal Agency',
            type:      'Federal — Grants.gov',
            number:    o.number       || o.oppNum || '',
            deadline:  o.closeDate    || o.closeDateStr || 'See listing',
            amount:    o.awardCeiling ? '$' + parseInt(o.awardCeiling).toLocaleString() : 'See listing',
            description: (o.synopsis || o.description || '').slice(0, 200),
            url:       o.number ? 'https://www.grants.gov/search-grants?oppNum=' + o.number : 'https://www.grants.gov',
            source:    'Grants.gov',
          };
        });
      }
    } catch(e) {
      grantsError = 'Grants.gov API: ' + e.message;
    }

    // ── Step 2: Filter SBA programs by NAICS ─────────────────────
    var naicsPrefix = naics ? naics.slice(0, 3) : '';
    var relevantSBA = SBA_PROGRAMS.filter(function(p) {
      return p.relevant.includes('all') ||
             (naicsPrefix && p.relevant.some(function(r) { return naicsPrefix.startsWith(r) || r.startsWith(naicsPrefix); }));
    });

    // ── Step 3: Get state programs ────────────────────────────────
    var statePrograms = state && STATE_PROGRAMS[state]
      ? STATE_PROGRAMS[state]
      : STATE_PROGRAMS['DEFAULT'];

    // ── Step 4: USDA rural flag ───────────────────────────────────
    var ruralStates = ['LA','MS','AL','AR','WV','KY','MT','WY','ND','SD','NE','KS','OK'];
    var isRural     = ruralStates.includes(state);

    // Compute total opportunity count
    var totalCount = federalGrants.length + relevantSBA.length + statePrograms.length;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        naics:          naics,
        state:          state,
        federalGrants:  federalGrants,
        sbaPrograms:    relevantSBA,
        statePrograms:  statePrograms,
        isRural:        isRural,
        totalCount:     totalCount,
        grantsError:    grantsError,
        note:           'Grant availability changes frequently. Verify deadlines and eligibility at each source before applying.',
        generated:      new Date().toISOString(),
      }),
    };

  } catch(err) {
    console.error('[grant-finder]', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
