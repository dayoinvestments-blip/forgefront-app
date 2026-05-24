import { Router, Request, Response } from 'express';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// In production, connect to your database (Postgres, MongoDB, etc.)
// These handlers update user subscription status in your DB
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('No signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      const tier = sub.items.data[0]?.price.lookup_key?.includes('pro') ? 'pro' : 'base';
      console.log(`[Webhook] Subscription ${event.type}: user=${userId} tier=${tier} status=${sub.status}`);
      // TODO: await db.updateUserSubscription(userId, { tier, status: sub.status, expiresAt: sub.current_period_end });
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      console.log(`[Webhook] Subscription cancelled: user=${userId}`);
      // TODO: await db.updateUserSubscription(userId, { tier: 'free', status: 'cancelled' });
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`[Webhook] Payment failed: customer=${invoice.customer}`);
      // TODO: Send dunning email, flag account
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`[Webhook] Payment succeeded: $${(invoice.amount_paid / 100).toFixed(2)}`);
      break;
    }
  }

  res.json({ received: true });
});

// RevenueCat webhook (for mobile in-app purchase events)
router.post('/revenuecat', async (req: Request, res: Response) => {
  const rcSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const authHeader = req.headers.authorization;
  if (rcSecret && authHeader !== `Bearer ${rcSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event } = req.body;
  console.log(`[RevenueCat] Event: ${event?.type} user=${event?.app_user_id}`);

  switch (event?.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
      // TODO: await db.updateUserSubscription(event.app_user_id, { tier: parseTier(event.product_id), isActive: true });
      break;
    case 'CANCELLATION':
    case 'EXPIRATION':
      // TODO: await db.updateUserSubscription(event.app_user_id, { tier: 'free', isActive: false });
      break;
  }

  res.json({ received: true });
});

export { router as webhooksRouter };
