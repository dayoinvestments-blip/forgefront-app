/**
 * ForgeFront — Stripe Customer Portal Session
 * Creates a billing portal session so users can manage
 * their subscription (upgrade, downgrade, cancel, update card)
 * without contacting support.
 */

const APP_URL = 'https://forgefront.app';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SUPABASE_URL        = process.env.SUPABASE_URL || 'https://ycadicxcwcgdiefdqbrn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: '{"error":"Method not allowed"}' };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { statusCode: 500, headers: CORS, body: '{"error":"Not configured"}' };

  try {
    const body   = JSON.parse(event.body || '{}');
    const email  = body.email  || '';
    const userId = body.userId || '';

    if (!email) return { statusCode: 400, headers: CORS, body: '{"error":"Email required"}' };

    // Look up Stripe customer ID from Supabase profile
    var customerId = null;
    try {
      var sbRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?user_id=eq.' + encodeURIComponent(userId) + '&select=stripe_customer_id', {
        headers: {
          'apikey':        SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        }
      });
      var sbData = await sbRes.json();
      if (sbData && sbData[0]) customerId = sbData[0].stripe_customer_id;
    } catch(e) {}

    // If no customer ID, find by email in Stripe
    if (!customerId) {
      var searchRes = await fetch('https://api.stripe.com/v1/customers/search?query=email:' + encodeURIComponent('"' + email + '"'), {
        headers: { 'Authorization': 'Bearer ' + secret }
      });
      var searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        customerId = searchData.data[0].id;
      }
    }

    if (!customerId) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ url: null, message: 'No active subscription found. Please subscribe first.' })
      };
    }

    // Create portal session
    var params = new URLSearchParams({
      customer:   customerId,
      return_url: APP_URL + '/?page=profile',
    });

    var portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    var portalData = await portalRes.json();

    if (!portalRes.ok) {
      // Portal not configured — return null so app shows fallback
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: null, error: portalData.error?.message }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: portalData.url }) };

  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
