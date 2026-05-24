import { Router } from 'express';
import { requireAuth, requireBase } from '../middleware/auth';
import { UnifiedContractService, ContractSource } from '../services/UnifiedContractService';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contracts/unified
// Returns a scored, blended feed of federal, state/local, and subcontract opps.
// Query params:
//   naics      comma-separated NAICS codes (default: 332312)
//   setAside   e.g. SDVOSB,VOSB  (default: SDVOSB)
//   states     comma-separated state abbreviations (default: LA)
//   sources    federal,state_local,subcontract (default: all three)
//   minScore   minimum match score 0-100 (default: 0)
//   limit      max results (default: 100; free users capped at 5)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/unified', requireAuth, requireBase, async (req: AuthRequest, res) => {
  try {
    const {
      naics = '332312',
      setAside = 'SDVOSB',
      states = 'LA',
      sources: sourcesParam = 'federal,state_local,subcontract',
      minScore = '0',
      limit: limitParam = '100',
      keywords = '',
    } = req.query as Record<string, string>;

    const tier = req.user?.tier ?? 'free';
    const maxByTier: Record<string, number> = { free: 5, base: 25, pro: 100 };
    const limit = Math.min(parseInt(limitParam), maxByTier[tier] ?? 5);

    const profile = {
      naicsCodes: naics.split(',').map(s => s.trim()).filter(Boolean),
      setAsideTypes: setAside.split(',').map(s => s.trim()).filter(Boolean),
      states: states.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      minValue: 0,
      maxValue: 0,
      keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
    };

    const sources = sourcesParam
      .split(',')
      .map(s => s.trim() as ContractSource)
      .filter(s => ['federal', 'state_local', 'subcontract'].includes(s));

    const result = await UnifiedContractService.getUnifiedFeed(profile, {
      sources,
      minScore: parseInt(minScore),
      limit,
    });

    res.json({
      ...result,
      tier,
      limit,
      profile,
    });
  } catch (err: any) {
    console.error('[UnifiedContracts] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch contract feed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contracts/unified/sources
// Returns the available sources and their current health/status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/unified/sources', requireAuth, (_req, res) => {
  res.json({
    sources: [
      {
        id: 'federal',
        label: '🏛 Federal',
        description: 'SAM.gov federal prime contract opportunities — all agencies, all 50 states',
        status: process.env.SAM_GOV_API_KEY ? 'live' : 'mock',
        cost: 'Free',
        setupNote: 'Set SAM_GOV_API_KEY in your .env file. Get your key at api.sam.gov.',
        badgeColor: '#4F8EF7',
      },
      {
        id: 'state_local',
        label: '🏗 State/Local',
        description: 'State and municipal contracts via BidNet Direct — 50 states, 1,800+ agencies',
        status: process.env.BIDNET_API_KEY ? 'live' : 'mock',
        cost: '~$500/mo',
        setupNote: 'Sign up at bidnetdirect.com and set BIDNET_API_KEY in your .env file.',
        badgeColor: '#FFB830',
      },
      {
        id: 'subcontract',
        label: '🤝 Subcontract',
        description: 'SBA SubNet — federal prime contractors seeking SDVOSB subcontractors',
        status: process.env.SBA_SUBNET_API_KEY ? 'live' : 'mock',
        cost: 'Free',
        setupNote: 'SBA SubNet does not have a public API. Set up a scraper or use mock data.',
        badgeColor: '#00E5A0',
      },
    ],
  });
});

export { router as unifiedContractsRouter };
