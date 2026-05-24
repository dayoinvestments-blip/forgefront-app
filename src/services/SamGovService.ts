import axios from 'axios';
import { Contract } from '@/store';

// SAM.gov Opportunities API v2
// Register for a free API key at https://sam.gov/profile/details
const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';
const SAM_API_KEY = process.env.EXPO_PUBLIC_SAM_API_KEY || 'REPLACE_WITH_SAM_GOV_KEY';

// Set-aside type codes from SAM.gov
export const SET_ASIDE_CODES: Record<string, string> = {
  'SDVOSB': 'SDVOSBC',
  'VOSB': 'VOSBC',
  '8(a)': 'SBA',
  'HUBZone': 'HZC',
  'WOSB': 'WOSBC',
  'Small Business': 'SBP',
  'Unrestricted': '',
};

export interface SamSearchParams {
  naicsCodes: string[];
  setAsideType?: string;
  postedFrom?: string;
  postedTo?: string;
  limit?: number;
  offset?: number;
  state?: string;
}

export class SamGovService {
  // Fetch live contract opportunities matching NAICS codes + set-aside filters
  static async searchOpportunities(params: SamSearchParams): Promise<Contract[]> {
    const postedFrom = params.postedFrom ?? this.daysAgo(90);
    const postedTo = params.postedTo ?? this.today();

    try {
      const response = await axios.get(SAM_API_BASE, {
        params: {
          api_key: SAM_API_KEY,
          naicsCode: params.naicsCodes.join(','),
          typeOfSetAsideDescription: params.setAsideType || '',
          postedFrom,
          postedTo,
          limit: params.limit ?? 25,
          offset: params.offset ?? 0,
          active: 'Yes',
          ...(params.state ? { placeOfPerformanceState: params.state } : {}),
        },
      });

      const opportunities = response.data?.opportunitiesData ?? [];
      return opportunities.map(SamGovService.mapToContract);
    } catch (error: any) {
      console.error('SAM.gov API error:', error.response?.data || error.message);
      // Return mock data in dev when API key not set
      if (__DEV__) return SamGovService.getMockContracts();
      throw new Error('Failed to fetch contract opportunities');
    }
  }

  // Search by keyword within results (client-side filter)
  static filterByKeyword(contracts: Contract[], keyword: string): Contract[] {
    const q = keyword.toLowerCase();
    return contracts.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.agency.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }

  // Get contracts by value range
  static filterByValue(contracts: Contract[], min: number, max: number): Contract[] {
    return contracts.filter(c => c.value >= min && c.value <= max);
  }

  private static mapToContract(raw: any): Contract {
    return {
      id: raw.noticeId || raw.solicitationNumber,
      title: raw.title || 'Untitled Opportunity',
      agency: raw.fullParentPathName || raw.organizationName || 'Federal Agency',
      value: SamGovService.parseValue(raw.award?.amount || raw.estimatedTotalValue),
      naicsCode: raw.naicsCode || '',
      setAside: raw.typeOfSetAsideDescription || 'Unrestricted',
      dueDate: raw.responseDeadLine || raw.archiveDate || '',
      status: raw.active === 'Yes' ? 'open' : 'closed',
      location: `${raw.placeOfPerformance?.city?.name || ''}, ${raw.placeOfPerformance?.state?.code || ''}`.trim(),
      solicitionNumber: raw.solicitationNumber || '',
      description: raw.description || '',
    };
  }

  private static parseValue(val: any): number {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
  }

  private static today(): string {
    return new Date().toISOString().split('T')[0].replace(/-/g, '/');
  }

  private static daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0].replace(/-/g, '/');
  }

  // Development mock data — realistic SDVOSB contracts
  static getMockContracts(): Contract[] {
    return [
      {
        id: 'W91151-24-R-0042',
        title: 'Metal Building Structural Fabrication — Fort Johnson',
        agency: 'Dept of Army · MICC Fort Johnson',
        value: 420000,
        naicsCode: '332312',
        setAside: 'SDVOSB Set-Aside',
        dueDate: new Date(Date.now() + 6 * 86400000).toISOString(),
        status: 'open',
        location: 'Leesville, LA',
        solicitionNumber: 'W91151-24-R-0042',
        description: 'Fabrication and installation of pre-engineered metal building system, 40x80 ft, includes foundation anchor bolts, erection, and final inspection.',
      },
      {
        id: '36C25624R0089',
        title: 'VA Medical Center Maintenance & Fabrication Services',
        agency: 'Dept of Veterans Affairs · NCO 16',
        value: 820000,
        naicsCode: '332312',
        setAside: 'SDVOSB Set-Aside',
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        status: 'open',
        location: 'Pineville, LA',
        solicitionNumber: '36C25624R0089',
        description: 'Indefinite Delivery Indefinite Quantity (IDIQ) contract for structural steel fabrication, welding, and metal building maintenance at VA facilities in NCO 16 area.',
      },
      {
        id: 'FA301424R0015',
        title: 'Steel Canopy & Shade Structure — Barksdale AFB',
        agency: 'Dept of Air Force · 2 CONS',
        value: 290000,
        naicsCode: '332312',
        setAside: 'SDVOSB Set-Aside',
        dueDate: new Date(Date.now() + 21 * 86400000).toISOString(),
        status: 'open',
        location: 'Bossier City, LA',
        solicitionNumber: 'FA301424R0015',
        description: 'Design-build of three steel shade canopy structures for vehicle parking areas. Must meet UFC standards and Air Force facility design criteria.',
      },
      {
        id: 'USDA-RD-24-0031',
        title: 'Agricultural Facility Fencing & Metal Works',
        agency: 'USDA Rural Development',
        value: 145000,
        naicsCode: '332312',
        setAside: 'Small Business Set-Aside',
        dueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        status: 'open',
        location: 'Minden, LA',
        solicitionNumber: 'USDA-RD-24-0031',
        description: 'Installation of 4,200 LF high-tensile fencing, three gate assemblies, and miscellaneous metal fabrication for USDA community facilities project.',
      },
    ];
  }
}
