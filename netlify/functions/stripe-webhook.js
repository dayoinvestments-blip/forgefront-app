/**
 * ForgeFront — Stripe Webhook
 * Updates Supabase user tier after successful payment.
 * Supabase credentials hardcoded — removes need for env vars.
 * Only needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as env vars.
 */

const SB_URL = 'https://ycadicxcwcgdiefdqbrn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljYWRpY3hjd2NnZGllZmRxYnJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ5ODI0NCwiZXhwIjoyMDk1MDc0MjQ0fQ.6M_jrAF9WH-HRbHaxvWgDa-dCiY043VbDI12fCB5OaU';

const PRICE_TIERS = {
  'price_1TamjsEgyptpMgZPnKAK3TeH': 'base',
  'price_1TamknEgyptpMgZPgmDCDwNA': 'pro',
  'price_1TamloEgyptpMgZP4bUZrJkY': 'pro',
};

async function setTier(userId, tier) {
  if (!userId) return;
  await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + userId, {
    method:  'PATCH',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body:    JSON.stringify({ tier }),
  });
}

async function findUserByCustomer(customerId) {
  const res = await fetch(SB_URL + '/rest/v1/profiles?stripe_customer_id=eq.' + customerId + '&select=id', {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY },
  });
  const rows = await res.json();
  return rows && rows.length ? rows[0].id : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let ev;
  try { ev = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: 'Bad JSON' }; }

  const type = ev.type;
  const obj  = ev.data && ev.data.object;

  try {
    if (type === 'checkout.session.completed') {
      const userId     = (obj.client_reference_id || (obj.metadata && obj.metadata.user_id) || '');
      const customerId = obj.customer;
      const subId      = obj.subscription;
      const stripeKey  = process.env.STRIPE_SECRET_KEY;
      let tier = 'pro';

      if (subId && stripeKey) {
        const sr = await fetch('https://api.stripe.com/v1/subscriptions/' + subId, {
          headers: { 'Authorization': 'Bearer ' + stripeKey },
        });
        const sub = await sr.json();
        const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
        if (priceId && PRICE_TIERS[priceId]) tier = PRICE_TIERS[priceId];
      }

      if (userId) {
        await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + userId, {
          method:  'PATCH',
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body:    JSON.stringify({ tier, stripe_customer_id: customerId }),
        });
      }
    }

    else if (type === 'customer.subscription.deleted') {
      const customerId = obj.customer;
      const userId = await findUserByCustomer(customerId);
      if (userId) await setTier(userId, 'free');
    }

  } catch(e) {
    console.error('Webhook error:', e.message);
  }

  return { statusCode: 200, body: '{"received":true}' };
};
