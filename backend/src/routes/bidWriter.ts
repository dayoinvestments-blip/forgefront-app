import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requireAuth, requirePro } from '../middleware/auth';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BidRequestSchema = z.object({
  contract: z.object({
    id: z.string(),
    title: z.string(),
    agency: z.string(),
    value: z.number(),
    naicsCode: z.string(),
    setAside: z.string(),
    dueDate: z.string(),
    description: z.string(),
    location: z.string(),
    solicitionNumber: z.string(),
  }),
  company: z.object({
    name: z.string(),
    uei: z.string(),
    cage: z.string(),
    sdvosb: z.boolean(),
    naicsCodes: z.array(z.string()),
    pastPerformance: z.array(z.string()),
    capabilities: z.string(),
    yearsInBusiness: z.number(),
    state: z.string(),
  }),
  tone: z.enum(['formal', 'confident', 'technical']).optional(),
});

function buildPrompt(input: z.infer<typeof BidRequestSchema>): string {
  const { contract, company, tone = 'confident' } = input;
  const valueStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(contract.value);
  const dueDate = new Date(contract.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `You are an expert federal contracting proposal writer specializing in SDVOSB (Service-Disabled Veteran-Owned Small Business) set-aside contracts. Write a complete, compliant federal bid proposal.

CONTRACT DETAILS:
- Solicitation: ${contract.solicitionNumber}
- Title: ${contract.title}
- Agency: ${contract.agency}
- Estimated Value: ${valueStr}
- Set-Aside: ${contract.setAside}
- NAICS Code: ${contract.naicsCode}
- Due Date: ${dueDate}
- Location: ${contract.location}
- Description: ${contract.description}

OFFEROR DETAILS:
- Company: ${company.name}
- UEI: ${company.uei}
- CAGE: ${company.cage}
- SDVOSB Certified: ${company.sdvosb ? 'Yes — verified in VetCert' : 'No'}
- NAICS Codes: ${company.naicsCodes.join(', ')}
- Years in Business: ${company.yearsInBusiness}
- State: ${company.state}
- Core Capabilities: ${company.capabilities}
- Relevant Past Performance:
${company.pastPerformance.map(p => `  • ${p}`).join('\n')}

TONE: ${tone}

Write a complete proposal with each section wrapped in XML tags exactly as shown. Be specific, use technical language appropriate to fabrication/construction contracts, and make the SDVOSB status a competitive differentiator throughout.

<executive_summary>
[2-3 paragraphs: company introduction, understanding of requirement, why we are best positioned to perform this work]
</executive_summary>

<technical_approach>
[3-4 paragraphs: specific methodology, equipment, certifications, quality control, schedule approach, safety plan reference]
</technical_approach>

<past_performance>
[2-3 paragraphs: relevant contracts, contract numbers if available, scope similarities, client POC reference statements]
</past_performance>

<sdvosb_statement>
[1-2 paragraphs: SDVOSB certification status, VetCert verification, set-aside compliance, veteran ownership narrative]
</sdvosb_statement>

<pricing_narrative>
[1-2 paragraphs: pricing basis, cost controls, value proposition, basis of estimate reference]
</pricing_narrative>`;
}

// Standard (non-streaming) endpoint
router.post('/', requireAuth, requirePro, async (req: Request, res: Response) => {
  const parsed = BidRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(parsed.data) }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const extract = (tag: string) => {
      const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return match ? match[1].trim() : '';
    };

    res.json({
      executiveSummary: extract('executive_summary'),
      technicalApproach: extract('technical_approach'),
      pastPerformance: extract('past_performance'),
      sdvosbStatement: extract('sdvosb_statement'),
      pricingNarrative: extract('pricing_narrative'),
      fullProposal: text,
    });
  } catch (e: any) {
    console.error('Anthropic error:', e);
    res.status(500).json({ error: 'Proposal generation failed' });
  }
});

// Streaming endpoint — sends SSE chunks to client
router.post('/stream', requireAuth, requirePro, async (req: Request, res: Response) => {
  const parsed = BidRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(parsed.data) }],
    });

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e: any) {
    console.error('Stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    res.end();
  }
});

export { router as bidWriterRouter };
