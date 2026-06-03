# ForgeFront — Required Netlify Environment Variables

Go to: Netlify → Site → Site configuration → Environment variables

| Variable | Where to get it | Required? |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key | ✅ Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → your endpoint → Signing secret | ✅ Yes |
| `SUPABASE_URL` | `https://ycadicxcwcgdiefdqbrn.supabase.co` | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key | ✅ Yes |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | ✅ Yes |
| `SAM_GOV_API_KEY` | SAM-f65fe6c1-4ac7-4244-ab06-2cf3fd0af73e | ✅ Yes |

## Stripe Webhook Setup

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://forgefront.app/.netlify/functions/stripe-webhook`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Save → copy the `whsec_...` Signing Secret → add as `STRIPE_WEBHOOK_SECRET`

## Adding Command Tier ($199/mo)

1. Stripe Dashboard → Products → Add product → "ForgeFront Command" → $199/mo recurring
2. Copy the `price_xxx` ID
3. In `netlify/functions/create-checkout.js`, uncomment and fill in `command_monthly`
4. In `netlify/functions/stripe-webhook.js`, uncomment and fill in the Command price ID
5. Redeploy

## Adding Pay-Per-Use Items

Same process — create one-time price in Stripe, copy ID, uncomment in create-checkout.js.
