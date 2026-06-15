/**
 * Netlify Function: /api/state-contracts
 * DISABLED — this previously served sample data. ForgeFront is federal-only
 * (live SAM.gov). Returns empty so no fabricated contracts can appear.
 * Re-enable only when wired to a REAL state/subcontract data API.
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ contracts: [], source: 'disabled', reason: 'federal_only' }) };
};
