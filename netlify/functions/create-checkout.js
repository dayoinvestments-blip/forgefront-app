/**
 * ForgeFront — Stripe Checkout
 * Starter $29 / Pro $79 / Command $199 + pay-per-use items
 */

const APP_URL = 'https://forgefront.app';

const PRICES = {
  starter_monthly:  'price_1TboKxIPEN0t4jAdZtOqKzzv', // Starter $29/mo
  pro_monthly:      'price_1TamknEgyptpMgZPgmDCDwNA',  // Pro $79/mo
  pro_annual:       'price_1TamloEgyptpMgZP4bUZrJkY',  // Pro Annual $711/yr
  command_monthly:  'price_1TboLiIPEN0t4jAdgqFH51EP',  // Command $199/mo
  proposal_single:  'REPLACE_WITH_PROPOSAL_PRICE_ID',  // $9.99 single proposal
};

const SUBSCRIPTION_PLANS = ['starter_monthly','pro_monthly','pro_annual','command_monthly'];

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: '{"error":"Method not allowed"}' };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { statusCode: 500, headers: CORS, body: '{"error":"Stripe not configured"}' };

  try {
    const body   = JSON.parse(event.body || '{}');
    const plan   = body.plan   || 'pro_monthly';
    const userId = body.userId || '';
    const email  = body.email  || '';
    const price  = PRICES[plan];

    if (!price || price.startsWith('REPLACE_')) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Plan not yet configured: ' + plan }) };
    }

    const isSubscription = SUBSCRIPTION_PLANS.includes(plan);
    const params = new URLSearchParams({
      mode: isSubscription ? 'subscription' : 'payment',
      'line_items[0][price]':    price,
      'line_items[0][quantity]': '1',
      success_url: APP_URL + '/success.html?plan=' + encodeURIComponent(plan),
      cancel_url:  APP_URL + '/?cancelled=1',
      client_reference_id:  userId,
      'metadata[user_id]':  userId,
      'metadata[plan]':     plan,
    });
    if (isSubscription) params.set('subscription_data[trial_period_days]', '14');
    if (email) params.set('customer_email', email);

    const res  = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: data.error?.message || 'Stripe error' }) };
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ url: data.url }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
