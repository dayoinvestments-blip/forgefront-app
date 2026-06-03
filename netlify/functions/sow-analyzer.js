/**
 * ForgeFront — SOW Analyzer
 * Takes a Statement of Work (SOW) or solicitation text and uses
 * Anthropic AI to extract structured intelligence a contractor
 * needs before deciding to bid.
 *
 * Output sections:
 *   1. Plain English summary
 *   2. Required deliverables list
 *   3. Evaluation criteria (weighted if available)
 *   4. Required certifications & registrations
 *   5. Key personnel requirements
 *   6. Performance period & place of performance
 *   7. Bonding & insurance requirements
 *   8. Capability gaps to address
 *   9. Go/No-Go recommendation with reasoning
 *  10. Key dates & deadlines
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: '{"error":"Method not allowed"}' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: '{"error":"AI not configured"}' };

  try {
    const body       = JSON.parse(event.body || '{}');
    const sowText    = (body.sow    || '').trim();
    const naics      = (body.naics  || '').trim();
    const company    = (body.company|| 'your company').trim();
    const certs      = (body.certs  || '').trim();

    if (!sowText || sowText.length < 50) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'SOW text too short. Paste the full solicitation text.' }) };
    }

    // Truncate SOW to ~8000 chars to stay within token limits
    const truncated = sowText.length > 8000
      ? sowText.slice(0, 8000) + '\n\n[... SOW truncated for analysis — full document reviewed up to this point]'
      : sowText;

    const SYSTEM_PROMPT = `You are a federal contracting expert and proposal strategist with 20 years of experience helping SDVOSB (Service-Disabled Veteran-Owned Small Business) contractors win federal contracts. You analyze Statements of Work and solicitations and extract actionable intelligence.

Always respond with a valid JSON object only. No markdown, no backticks, no preamble. The JSON must match this exact structure:

{
  "summary": "2-3 sentence plain English summary of what the government wants done",
  "contractType": "e.g. Firm Fixed Price, Cost Plus, IDIQ, BPA",
  "setAside": "e.g. SDVOSB Set-Aside, Full and Open, 8(a)",
  "estimatedValue": "dollar amount or range if mentioned, else Unknown",
  "naicsCode": "primary NAICS code if mentioned",
  "deliverables": ["array of specific deliverables required"],
  "evaluationCriteria": [{"criterion": "name", "weight": "% or High/Medium/Low if stated", "notes": "what to address"}],
  "certifications": ["required certifications, registrations, clearances"],
  "keyPersonnel": ["required personnel with qualifications"],
  "performancePeriod": "base period + options if stated",
  "placeOfPerformance": "location(s) where work is performed",
  "bondingInsurance": ["bonding and insurance requirements"],
  "keyDates": [{"event": "name", "date": "date or timeframe"}],
  "capabilityGaps": ["things a typical small contractor may lack for this work"],
  "goNoGo": {
    "recommendation": "PURSUE or CONSIDER or PASS",
    "confidence": "High or Medium or Low",
    "reasons": ["array of specific reasons supporting the recommendation"],
    "risks": ["array of risks or concerns to address"]
  },
  "winTheme": "1-2 sentence recommended win theme for the proposal",
  "proposalPriorities": ["ordered list of what to emphasize in the proposal"]
}`;

    const USER_PROMPT = 'Analyze this federal solicitation for ' + company
      + (certs ? ' (certifications: ' + certs + ')' : ' (SDVOSB)')
      + (naics ? ', primary NAICS ' + naics : '')
      + '.\n\nSOW TEXT:\n' + truncated;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: USER_PROMPT }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) throw new Error(aiData.error?.message || 'AI error');

    const rawText = aiData.content[0]?.text || '{}';

    // Parse JSON — strip any accidental backticks
    var clean = rawText.replace(/```json|```/g, '').trim();
    var parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      // Try to extract JSON from text
      var match = clean.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('AI returned invalid JSON');
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        analysis:  parsed,
        charCount: sowText.length,
        truncated: sowText.length > 8000,
        generated: new Date().toISOString(),
      }),
    };

  } catch(err) {
    console.error('[sow-analyzer]', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
