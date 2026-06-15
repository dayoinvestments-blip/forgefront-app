/**
 * Netlify Function: /.netlify/functions/bid-proposal
 * Generates a DRAFT federal proposal from the real SOW, the user's company
 * profile, collected vendor quotes, and the FAR clauses cited in the solicitation
 * (plus a standard SDVOSB baseline). Returns the proposal text + a compliance
 * checklist for the user to verify. NOT a guaranteed-compliant final submission.
 */
const { verifyUser, checkRateLimit, unauthorized, rateLimited } = require('./_verify-auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Standard SDVOSB-relevant FAR clauses commonly required (baseline)
const STANDARD_FAR = [
  '52.204-7 System for Award Management',
  '52.204-13 SAM Maintenance',
  '52.212-1 Instructions to Offerors—Commercial Products and Services',
  '52.212-4 Contract Terms and Conditions—Commercial Products and Services',
  '52.219-27 Notice of Service-Disabled Veteran-Owned Small Business Set-Aside',
  '52.219-14 Limitations on Subcontracting',
  '52.225-13 Restrictions on Certain Foreign Purchases',
  '52.232-33 Payment by Electronic Funds Transfer—SAM',
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // Cost protection: require a signed-in user before spending Anthropic credits
  const _authedUser = await verifyUser(event.headers);
  if (!_authedUser) return unauthorized(CORS);
  const _rl = await checkRateLimit(_authedUser.id, 'bid-proposal');
  if (!_rl.ok) return rateLimited(CORS, _rl);
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const b = JSON.parse(event.body || '{}');
    const sow      = (b.sow || '').trim();
    const company  = b.company  || '';
    const profile  = b.profile  || {};   // {uei, cage, naics, principal, bio, capability, pastPerformance, certs, address, phone, email}
    const quotes   = b.quotes   || [];    // [{name, spec, unit, qty, vendor, price}]
    const contract = b.contract || {};    // {title, solNum, agency, value, deadline}

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ proposal: null, error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    const sowTrunc = sow.length > 9000 ? sow.slice(0, 9000) + '\n\n[... truncated]' : sow;

    const quotesBlock = quotes.length
      ? quotes.map(function(q,i){ return (i+1)+'. '+(q.name||'')+' — '+(q.spec||'')+' | '+(q.qty||'')+' '+(q.unit||'')+(q.vendor?(' | Vendor: '+q.vendor):'')+(q.price?(' | Quoted: '+q.price):''); }).join('\n')
      : '(No vendor quotes collected yet — note pricing as TBD where needed.)';

    const SYSTEM_PROMPT = `You are a senior federal proposal writer specializing in SDVOSB proposals with 20 years of experience. You write strong, specific, compliant-style draft proposals grounded ONLY in the facts provided. Never invent past performance, certifications, personnel, or quotes that were not provided. If a fact is missing, insert a clearly marked placeholder like [PROVIDE: ...] rather than fabricating.

Write a complete proposal in plain text with clear section headers. Include these sections, adapted to the actual SOW:
1. Cover / Offeror Information
2. Executive Summary
3. Technical Approach (directly responsive to the SOW requirements)
4. Management & Staffing Plan
5. Past Performance (ONLY what was provided; otherwise placeholder)
6. Pricing Summary (from the provided quotes; mark TBD where missing)
7. SDVOSB / Limitations on Subcontracting compliance (reference 13 CFR 125 and FAR 52.219-14)
8. FAR Clause Acknowledgement (list the cited + standard clauses)

After the proposal, output a line "===CHECKLIST===" then a JSON array of compliance-check items the user must verify before submitting, each: {"item": "...", "why": "...", "status": "verify"}. Base the checklist on the solicitation's actual instructions where visible (page limits, format, required forms, reps & certs, submission method, deadline) plus standard SDVOSB items.

Respond with the proposal text, then ===CHECKLIST===, then the JSON array. Nothing else.`;

    const USER_PROMPT =
      'Draft a proposal for this opportunity.\n\n' +
      'CONTRACT: ' + (contract.title||'') + (contract.solNum?(' — Solicitation '+contract.solNum):'') + '\n' +
      'AGENCY: ' + (contract.agency||'') + '\n' +
      (contract.value?('ESTIMATED VALUE: '+contract.value+'\n'):'') +
      (contract.deadline?('PROPOSAL DUE: '+contract.deadline+'\n'):'') + '\n' +
      'OUR COMPANY: ' + company + '\n' +
      'UEI: ' + (profile.uei||'[PROVIDE: UEI]') + ' | CAGE: ' + (profile.cage||'[PROVIDE: CAGE]') + ' | NAICS: ' + (profile.naics||'') + '\n' +
      'PRINCIPAL: ' + (profile.principal||'') + '\n' +
      'CERTIFICATIONS: ' + (profile.certs||'SDVOSB') + '\n' +
      'CAPABILITY STATEMENT: ' + (profile.capability||'[PROVIDE: capability statement]') + '\n' +
      'PRINCIPAL BIO: ' + (profile.bio||'') + '\n' +
      'PAST PERFORMANCE PROVIDED: ' + (profile.pastPerformance||'(none provided — use placeholders, do not invent)') + '\n' +
      'ADDRESS: ' + (profile.address||'') + ' | PHONE: ' + (profile.phone||'') + ' | EMAIL: ' + (profile.email||'') + '\n\n' +
      'COLLECTED VENDOR QUOTES:\n' + quotesBlock + '\n\n' +
      'STANDARD SDVOSB FAR BASELINE (include + any clauses you find cited in the SOW):\n' + STANDARD_FAR.join('\n') + '\n\n' +
      'SOW / SOLICITATION TEXT:\n' + sowTrunc;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4000,
        system:     SYSTEM_PROMPT,
        messages:   [{ role:'user', content: USER_PROMPT }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Anthropic error:', err.slice(0,200));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ proposal: null, error: 'AI service error' }) };
    }

    const data = await aiRes.json();
    const full = (data.content && data.content[0] && data.content[0].text) || '';

    // Split proposal from checklist
    let proposal = full, checklist = [];
    const idx = full.indexOf('===CHECKLIST===');
    if (idx >= 0) {
      proposal = full.slice(0, idx).trim();
      const cl = full.slice(idx + '===CHECKLIST==='.length).trim();
      try {
        const m = cl.match(/\[[\s\S]*\]/);
        if (m) checklist = JSON.parse(m[0]);
      } catch(e) { checklist = []; }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({
      proposal: proposal,
      checklist: checklist,
      farBaseline: STANDARD_FAR,
      disclaimer: 'This is an AI-generated DRAFT. Review against the full solicitation and verify all compliance items before submitting. Not legal advice.',
    }) };
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ proposal: null, error: err.message }) };
  }
};
