/**
 * ForgeFront — Stripe Webhook
 * Handles checkout.session.completed, customer.subscription.deleted,
 * invoice.payment_failed
 * All credentials from environment variables — nothing hardcoded.
 */

const crypto = require('crypto');

function getSBUrl() { return process.env.SUPABASE_URL || 'https://ycadicxcwcgdiefdqbrn.supabase.co'; }
function getSBKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }

const PRICE_TIERS = {
  'price_1TboKxIPEN0t4jAdZtOqKzzv': 'starter',   // Starter $29/mo
  'price_1TamknEgyptpMgZPgmDCDwNA': 'pro',        // Pro $79/mo
  'price_1TamloEgyptpMgZP4bUZrJkY': 'pro',        // Pro annual
  'price_1TboLiIPEN0t4jAdgqFH51EP': 'command',    // Command $199/mo
  'price_1Te8IlEgyptpMgZPLRAalTx8': 'command',    // Command $199/mo (alt)
};

async function sbPatch(path, body) {
  const res = await fetch(getSBUrl() + path, {
    method: 'PATCH',
    headers: {
      'apikey': getSBKey(), 'Authorization': 'Bearer ' + getSBKey(),
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('[webhook] Supabase PATCH failed:', res.status);
}

async function findUserByCustomer(customerId) {
  const res = await fetch(getSBUrl() + '/rest/v1/profiles?stripe_customer_id=eq.' + customerId + '&select=id', {
    headers: { 'apikey': getSBKey(), 'Authorization': 'Bearer ' + getSBKey() },
  });
  const rows = await res.json();
  return rows && rows.length ? rows[0].id : null;
}

function verifyStripeSignature(payload, sigHeader, secret) {
  if (!secret) return true;
  try {
    const parts     = sigHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
    const v1sig     = parts.find(p => p.startsWith('v1=')).split('=').slice(1).join('=');
    const expected  = crypto.createHmac('sha256', secret).update(timestamp + '.' + payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(v1sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch(e) { return false; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const sigHeader = event.headers['stripe-signature'] || '';
  const secret    = process.env.STRIPE_WEBHOOK_SECRET || '';
  const payload   = event.body || '';

  if (secret && !verifyStripeSignature(payload, sigHeader, secret)) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let ev;
  try { ev = JSON.parse(payload); } catch(e) { return { statusCode: 400, body: 'Bad JSON' }; }

  const type = ev.type;
  const obj  = ev.data && ev.data.object;
  console.log('[webhook] Event:', type);

  try {
    if (type === 'checkout.session.completed') {
      const userId     = obj.client_reference_id || (obj.metadata && obj.metadata.user_id) || '';
      const customerId = obj.customer;
      const subId      = obj.subscription;
      const planMeta   = obj.metadata && obj.metadata.plan;
      const stripeKey  = process.env.STRIPE_SECRET_KEY;
      let tier = 'pro';

      if (subId && stripeKey) {
        try {
          const sr  = await fetch('https://api.stripe.com/v1/subscriptions/' + subId, {
            headers: { 'Authorization': 'Bearer ' + stripeKey },
          });
          const sub = await sr.json();
          const priceId = sub.items && sub.items.data && sub.items.data[0] &&
                          sub.items.data[0].price && sub.items.data[0].price.id;
          if (priceId && PRICE_TIERS[priceId]) tier = PRICE_TIERS[priceId];
          else if (planMeta) {
            if (planMeta.includes('starter')) tier = 'starter';
            else if (planMeta.includes('command')) tier = 'command';
          }
        } catch(e) { console.error('[webhook] Sub lookup failed:', e.message); }
      }

      if (userId) {
        await sbPatch('/rest/v1/profiles?id=eq.' + userId, { tier, stripe_customer_id: customerId });
      }
    }

    else if (type === 'customer.subscription.deleted') {
      const userId = await findUserByCustomer(obj.customer);
      if (userId) await sbPatch('/rest/v1/profiles?id=eq.' + userId, { tier: 'free' });
    }

    else if (type === 'invoice.payment_failed') {
      console.log('[webhook] Payment failed for customer:', obj.customer);
    }

  } catch(e) {
    console.error('[webhook] Error:', e.message);
  }

  return { statusCode: 200, body: '{"received":true}' };
};
