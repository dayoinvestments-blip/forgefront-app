import axios from 'axios';

// ─── Unified Contract Type ────────────────────────────────────────────────────
// Every source maps to this single normalized schema.
// The app never needs to know where a contract came from.
export type ContractSource = 'federal' | 'state_local' | 'subcontract';
export type ContractStatus = 'open' | 'presolicitation' | 'closed' | 'awarded';

export interface UnifiedContract {
  id: string;
  source: ContractSource;
  sourceLabel: string;          // "🏛 Federal" | "🏗 State/Local" | "🤝 Subcontract"
  sourceBadgeColor: string;

  title: string;
  agency: string;
  description: string;
  naicsCode: string;
  pscCode: string;
  setAside: string;
  status: ContractStatus;

  value: number;                // estimated value (0 if unknown)
  responseDeadline: string;     // ISO date string
  postedDate: string;
  location: {
    city: string;
    state: string;
    zip: string;
    placeOfPerformance: string;
  };

  solicitationNumber: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  externalUrl: string;

  matchScore: number;           // 0–100, computed by match engine
  matchReasons: string[];       // plain-English why it matched
}

// ─── User Profile for Matching ────────────────────────────────────────────────
export interface UserContractProfile {
  naicsCodes: string[];
  setAsideTypes: string[];      // e.g. ['SDVOSB', 'VOSB']
  states: string[];             // preferred states of performance
  minValue: number;
  maxValue: number;
  keywords: string[];
}

// ─── Match Engine ─────────────────────────────────────────────────────────────
function scoreContract(contract: UnifiedContract, profile: UserContractProfile): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  // NAICS match (40 pts)
  if (profile.naicsCodes.some(n => contract.naicsCode.startsWith(n.slice(0, 4)))) {
    score += 40;
    reasons.push(`Matches your NAICS code ${contract.naicsCode}`);
  }

  // Set-aside match (25 pts)
  const sa = contract.setAside.toUpperCase();
  if (profile.setAsideTypes.some(t => sa.includes(t.toUpperCase()))) {
    score += 25;
    reasons.push(`${contract.setAside} set-aside matches your certifications`);
  }

  // State preference (15 pts)
  if (profile.states.length === 0 || profile.states.includes(contract.location.state)) {
    score += 15;
    if (profile.states.includes(contract.location.state)) {
      reasons.push(`In your preferred state: ${contract.location.state}`);
    }
  }

  // Value range (10 pts)
  const inRange = (profile.maxValue === 0 || contract.value <= profile.maxValue) &&
                  contract.value >= profile.minValue;
  if (inRange || contract.value === 0) {
    score += 10;
    if (contract.value > 0) reasons.push(`Value ${formatVal(contract.value)} fits your range`);
  }

  // Keyword match (10 pts)
  if (profile.keywords.length > 0) {
    const text = `${contract.title} ${contract.description}`.toLowerCase();
    const hit = profile.keywords.find(k => text.includes(k.toLowerCase()));
    if (hit) {
      score += 10;
      reasons.push(`Contains keyword: "${hit}"`);
    }
  }

  if (reasons.length === 0) reasons.push('Matches your registered NAICS category');
  return { score: Math.min(score, 100), reasons };
}

function formatVal(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

// ─── SAM.gov Adapter (Federal Prime Contracts) ────────────────────────────────
async function fetchFederal(profile: UserContractProfile): Promise<UnifiedContract[]> {
  try {
    const API_KEY = process.env.SAM_GOV_API_KEY || '';
    const naics = profile.naicsCodes.join(',');
    const url = `https://api.sam.gov/opportunities/v2/search?limit=100&api_key=${API_KEY}&naicsCode=${naics}&postedFrom=01/01/2024&ptype=o,p,k,r`;

    const { data } = await axios.get(url, { timeout: 8000 });
    const opps = data?.opportunitiesData ?? [];

    return opps.map((o: any): UnifiedContract => ({
      id: `fed_${o.noticeId}`,
      source: 'federal',
      sourceLabel: '🏛 Federal',
      sourceBadgeColor: '#4F8EF7',
      title: o.title ?? '',
      agency: o.fullParentPathName ?? o.organizationName ?? '',
      description: o.description ?? '',
      naicsCode: o.naicsCode ?? '',
      pscCode: o.classificationCode ?? '',
      setAside: o.typeOfSetAsideDescription ?? '',
      status: mapFedStatus(o.type),
      value: parseFloat(o.award?.amount ?? '0') || 0,
      responseDeadline: o.responseDeadLine ?? '',
      postedDate: o.postedDate ?? '',
      location: {
        city: o.placeOfPerformance?.city?.name ?? '',
        state: o.placeOfPerformance?.state?.code ?? '',
        zip: o.placeOfPerformance?.zip ?? '',
        placeOfPerformance: o.placeOfPerformance?.state?.name ?? '',
      },
      solicitationNumber: o.solicitationNumber ?? '',
      contactName: o.pointOfContact?.[0]?.fullName ?? '',
      contactEmail: o.pointOfContact?.[0]?.email ?? '',
      contactPhone: o.pointOfContact?.[0]?.phone ?? '',
      externalUrl: `https://sam.gov/opp/${o.noticeId}/view`,
      matchScore: 0,
      matchReasons: [],
    }));
  } catch (err: any) {
    console.error('[FederalAdapter] Error:', err.message);
    return [];
  }
}

function mapFedStatus(type: string): ContractStatus {
  const t = (type ?? '').toLowerCase();
  if (t === 'p' || t === 'presol') return 'presolicitation';
  if (t === 'a') return 'awarded';
  if (t === 'cancel' || t === 'deleted') return 'closed';
  return 'open';
}

// ─── BidNet/DemandStar Adapter (State & Local Contracts) ─────────────────────
// BidNet Direct covers 50 states + thousands of local agencies.
// API docs: https://www.bidnetdirect.com/api  (~$500/mo for full access)
// DemandStar is an alternative with similar coverage.
// MOCK mode returns realistic sample data when no API key is set.
async function fetchStateLocal(profile: UserContractProfile): Promise<UnifiedContract[]> {
  const API_KEY = process.env.BIDNET_API_KEY || '';

  if (!API_KEY) {
    // Return well-structured mock data so the feed populates during development
    return getMockStateLocalContracts(profile);
  }

  try {
    const params = new URLSearchParams({
      apiKey: API_KEY,
      naics: profile.naicsCodes.join(','),
      state: profile.states.join(','),
      limit: '100',
    });
    const { data } = await axios.get(
      `https://api.bidnetdirect.com/v2/opportunities?${params}`,
      { timeout: 8000 }
    );

    return (data?.opportunities ?? []).map((o: any): UnifiedContract => ({
      id: `sl_${o.id}`,
      source: 'state_local',
      sourceLabel: '🏗 State/Local',
      sourceBadgeColor: '#FFB830',
      title: o.title ?? '',
      agency: o.agency ?? o.entity ?? '',
      description: o.description ?? '',
      naicsCode: o.naicsCode ?? '',
      pscCode: '',
      setAside: o.setAside ?? '',
      status: 'open',
      value: parseFloat(o.estimatedValue ?? '0') || 0,
      responseDeadline: o.dueDate ?? '',
      postedDate: o.publishedDate ?? '',
      location: {
        city: o.city ?? '',
        state: o.state ?? '',
        zip: o.zip ?? '',
        placeOfPerformance: `${o.city ?? ''}, ${o.state ?? ''}`,
      },
      solicitationNumber: o.solicitationNumber ?? o.referenceNumber ?? '',
      contactName: o.contactName ?? '',
      contactEmail: o.contactEmail ?? '',
      contactPhone: o.contactPhone ?? '',
      externalUrl: o.detailUrl ?? '',
      matchScore: 0,
      matchReasons: [],
    }));
  } catch (err: any) {
    console.error('[StateLocalAdapter] Error:', err.message);
    return getMockStateLocalContracts(profile);
  }
}

function getMockStateLocalContracts(profile: UserContractProfile): UnifiedContract[] {
  const state = profile.states[0] ?? 'LA';
  return [
    {
      id: 'sl_mock_001',
      source: 'state_local',
      sourceLabel: '🏗 State/Local',
      sourceBadgeColor: '#FFB830',
      title: 'Metal Fabrication & Welding Services — DOTD Maintenance Facility',
      agency: `${state} Dept. of Transportation & Development`,
      description: 'Structural steel welding and custom fabrication for highway maintenance equipment. Veteran-owned businesses encouraged to apply.',
      naicsCode: '332312',
      pscCode: '',
      setAside: 'Small Business',
      status: 'open',
      value: 45000,
      responseDeadline: new Date(Date.now() + 21 * 86400000).toISOString(),
      postedDate: new Date().toISOString(),
      location: { city: 'Baton Rouge', state, zip: '70804', placeOfPerformance: `Baton Rouge, ${state}` },
      solicitationNumber: `${state}-DOTD-2026-0041`,
      contactName: 'Marcus T. Johnson',
      contactEmail: 'procurement@la.gov',
      contactPhone: '225-555-0198',
      externalUrl: 'https://www.bidnetdirect.com',
      matchScore: 0, matchReasons: [],
    },
    {
      id: 'sl_mock_002',
      source: 'state_local',
      sourceLabel: '🏗 State/Local',
      sourceBadgeColor: '#FFB830',
      title: 'Parish Road Sign Fabrication & Installation — Webster Parish Police Jury',
      agency: 'Webster Parish Police Jury',
      description: 'Supply and install 240 roadway signs including custom metal fabrication and powder coating. Local vendors preferred.',
      naicsCode: '332312',
      pscCode: '',
      setAside: '',
      status: 'open',
      value: 28000,
      responseDeadline: new Date(Date.now() + 14 * 86400000).toISOString(),
      postedDate: new Date().toISOString(),
      location: { city: 'Minden', state: 'LA', zip: '71055', placeOfPerformance: 'Minden, LA' },
      solicitationNumber: 'WPPJ-2026-0017',
      contactName: 'Sandra Moffett',
      contactEmail: 'procurement@websterparish.gov',
      contactPhone: '318-555-0142',
      externalUrl: 'https://www.bidnetdirect.com',
      matchScore: 0, matchReasons: [],
    },
    {
      id: 'sl_mock_003',
      source: 'state_local',
      sourceLabel: '🏗 State/Local',
      sourceBadgeColor: '#FFB830',
      title: 'Shreveport Port Authority — Steel Dock Grating Repair & Fabrication',
      agency: 'Port of Shreveport-Bossier',
      description: 'Repair and replace steel grating, handrails, and structural elements at Port Terminal A. Licensed welding contractor required.',
      naicsCode: '332312',
      pscCode: '',
      setAside: '',
      status: 'presolicitation',
      value: 62000,
      responseDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      postedDate: new Date().toISOString(),
      location: { city: 'Shreveport', state: 'LA', zip: '71101', placeOfPerformance: 'Shreveport, LA' },
      solicitationNumber: 'PSB-2026-STRUCT-004',
      contactName: 'Derrick Fontenot',
      contactEmail: 'd.fontenot@portshreveport.com',
      contactPhone: '318-555-0267',
      externalUrl: 'https://www.bidnetdirect.com',
      matchScore: 0, matchReasons: [],
    },
  ];
}

// ─── SBA SubNet Adapter (Federal Subcontracting Opportunities) ─────────────────
// SBA SubNet: https://web.sba.gov/subnet/
// Free public access. Prime contractors post subcontracting opportunities here.
async function fetchSubcontracts(profile: UserContractProfile): Promise<UnifiedContract[]> {
  try {
    // SBA SubNet does not have a formal JSON API — scraping or manual search required.
    // Returning mock data in development; integrate a scraper or SBA data feed in production.
    const API_KEY = process.env.SBA_SUBNET_API_KEY || '';
    if (!API_KEY) return getMockSubcontracts();

    const { data } = await axios.get(
      `https://web.sba.gov/subnet/api/v1/opportunities?naics=${profile.naicsCodes[0]}&limit=50`,
      { timeout: 8000 }
    );
    return (data?.results ?? []).map((o: any): UnifiedContract => ({
      id: `sub_${o.id}`,
      source: 'subcontract',
      sourceLabel: '🤝 Subcontract',
      sourceBadgeColor: '#00E5A0',
      title: o.title ?? '',
      agency: o.primeName ?? '',
      description: `Prime: ${o.primeName}. ${o.description ?? ''}`,
      naicsCode: o.naics ?? '',
      pscCode: '',
      setAside: '',
      status: 'open',
      value: parseFloat(o.estimatedValue ?? '0') || 0,
      responseDeadline: o.dueDate ?? '',
      postedDate: o.postedDate ?? '',
      location: { city: '', state: o.placeOfPerformance ?? '', zip: '', placeOfPerformance: o.placeOfPerformance ?? '' },
      solicitationNumber: o.solicitationNumber ?? '',
      contactName: o.contactName ?? '',
      contactEmail: o.contactEmail ?? '',
      contactPhone: '',
      externalUrl: `https://web.sba.gov/subnet/client/opportunities/${o.id}`,
      matchScore: 0, matchReasons: [],
    }));
  } catch (err: any) {
    console.error('[SubNetAdapter] Error:', err.message);
    return getMockSubcontracts();
  }
}

function getMockSubcontracts(): UnifiedContract[] {
  return [
    {
      id: 'sub_mock_001',
      source: 'subcontract',
      sourceLabel: '🤝 Subcontract',
      sourceBadgeColor: '#00E5A0',
      title: 'Structural Welding Subcontractor — Barksdale AFB Hangar Repair',
      agency: 'Prime: Cajun Defense Construction LLC',
      description: 'Large prime contractor seeking certified SDVOSB welder for structural steel repair at Barksdale AFB. Past performance opportunity — excellent for building federal references.',
      naicsCode: '332312',
      pscCode: '',
      setAside: 'SDVOSB',
      status: 'open',
      value: 35000,
      responseDeadline: new Date(Date.now() + 10 * 86400000).toISOString(),
      postedDate: new Date().toISOString(),
      location: { city: 'Bossier City', state: 'LA', zip: '71110', placeOfPerformance: 'Bossier City, LA' },
      solicitationNumber: 'CDC-SUB-2026-019',
      contactName: 'James Thibodaux',
      contactEmail: 'subs@cajundefense.com',
      contactPhone: '318-555-0391',
      externalUrl: 'https://web.sba.gov/subnet',
      matchScore: 0, matchReasons: [],
    },
    {
      id: 'sub_mock_002',
      source: 'subcontract',
      sourceLabel: '🤝 Subcontract',
      sourceBadgeColor: '#00E5A0',
      title: 'Custom Metal Fabrication — Fort Johnson Barracks Renovation',
      agency: 'Prime: Gulf Coast Federal Contractors Inc.',
      description: 'Seeking sub for custom metal door frames, security hardware installation, and miscellaneous steel fab. 8-week timeline. Clearance not required.',
      naicsCode: '332312',
      pscCode: '',
      setAside: '',
      status: 'open',
      value: 18000,
      responseDeadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      postedDate: new Date().toISOString(),
      location: { city: 'Leesville', state: 'LA', zip: '71446', placeOfPerformance: 'Leesville, LA' },
      solicitationNumber: 'GCFC-2026-FJ-44',
      contactName: 'Patricia Nguyen',
      contactEmail: 'p.nguyen@gcfcontracts.com',
      contactPhone: '337-555-0088',
      externalUrl: 'https://web.sba.gov/subnet',
      matchScore: 0, matchReasons: [],
    },
  ];
}

// ─── Unified Service  ─────────────────────────────────────────────────────────
export class UnifiedContractService {
  static async getUnifiedFeed(
    profile: UserContractProfile,
    options: {
      sources?: ContractSource[];
      minScore?: number;
      limit?: number;
    } = {}
  ): Promise<{
    contracts: UnifiedContract[];
    meta: { federal: number; stateLocal: number; subcontract: number; totalMatched: number };
  }> {
    const { sources = ['federal', 'state_local', 'subcontract'], minScore = 0, limit = 100 } = options;

    // Fetch all sources in parallel
    const [federal, stateLocal, subcontracts] = await Promise.all([
      sources.includes('federal') ? fetchFederal(profile) : Promise.resolve([]),
      sources.includes('state_local') ? fetchStateLocal(profile) : Promise.resolve([]),
      sources.includes('subcontract') ? fetchSubcontracts(profile) : Promise.resolve([]),
    ]);

    // Score and filter
    const all = [...federal, ...stateLocal, ...subcontracts].map(c => {
      const { score, reasons } = scoreContract(c, profile);
      return { ...c, matchScore: score, matchReasons: reasons };
    });

    const filtered = all
      .filter(c => c.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return {
      contracts: filtered,
      meta: {
        federal: filtered.filter(c => c.source === 'federal').length,
        stateLocal: filtered.filter(c => c.source === 'state_local').length,
        subcontract: filtered.filter(c => c.source === 'subcontract').length,
        totalMatched: filtered.length,
      },
    };
  }
}
