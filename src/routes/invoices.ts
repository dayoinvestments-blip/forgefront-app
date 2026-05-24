import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../db/supabase';

const router = Router();
router.use(requireAuth);

function generateInvoiceNumber() {
  return `FF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// GET /api/invoices
router.get('/', async (req: AuthRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('invoices').select('*, invoice_line_items(*), jobs(name)')
    .eq('user_id', req.user!.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Failed to fetch invoices' });
  res.json({
    invoices: data,
    stats: {
      total: data.length,
      totalBilled: data.reduce((s, i) => s + Number(i.total), 0),
      paid: data.filter(i => i.status === 'paid').length,
      outstanding: data.filter(i => ['sent','overdue'].includes(i.status)).length,
    }
  });
});

// GET /api/invoices/:id
router.get('/:id', async (req: AuthRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('invoices').select('*, invoice_line_items(*)')
    .eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (error || !data) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: data });
});

// POST /api/invoices
router.post('/', async (req: AuthRequest, res) => {
  const Schema = z.object({
    job_id:         z.string().uuid().optional(),
    client:         z.string().min(1),
    client_email:   z.string().default(''),
    client_address: z.string().default(''),
    due_date:       z.string(),
    tax_rate:       z.number().min(0).max(100).default(0),
    notes:          z.string().default(''),
    status:         z.enum(['draft','sent','paid','overdue']).default('draft'),
    lineItems:      z.array(z.object({
      description: z.string().default(''),
      quantity:    z.number().min(0).default(1),
      unit_price:  z.number().min(0).default(0),
    })).min(1),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const subtotal = d.lineItems.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const taxAmount = parseFloat((subtotal * (d.tax_rate / 100)).toFixed(2));
  const total = parseFloat((subtotal + taxAmount).toFixed(2));

  try {
    const { data: inv, error: invErr } = await supabaseAdmin.from('invoices').insert({
      user_id: req.user!.id,
      job_id: d.job_id || null,
      invoice_number: generateInvoiceNumber(),
      client: d.client,
      client_email: d.client_email,
      client_address: d.client_address,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: d.due_date,
      subtotal, tax_rate: d.tax_rate, tax_amount: taxAmount, total,
      status: d.status, notes: d.notes,
    }).select().single();
    if (invErr) throw invErr;

    // Insert line items
    await supabaseAdmin.from('invoice_line_items').insert(
      d.lineItems.map((l, i) => ({
        invoice_id: inv.id, description: l.description,
        quantity: l.quantity, unit_price: l.unit_price, sort_order: i,
      }))
    );

    // Update job invoiced amount
    if (d.job_id) {
      const { data: job } = await supabaseAdmin.from('jobs').select('invoiced').eq('id', d.job_id).single();
      if (job) {
        await supabaseAdmin.from('jobs').update({ invoiced: Number(job.invoiced) + total }).eq('id', d.job_id);
      }
    }

    const { data: full } = await supabaseAdmin
      .from('invoices').select('*, invoice_line_items(*)').eq('id', inv.id).single();
    res.status(201).json({ invoice: full });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PATCH /api/invoices/:id/status
router.patch('/:id/status', async (req: AuthRequest, res) => {
  const { status } = req.body;
  if (!['draft','sent','paid','overdue'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const { data, error } = await supabaseAdmin.from('invoices')
    .update({ status }).eq('id', req.params.id).eq('user_id', req.user!.id).select().single();
  if (error || !data) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice: data });
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  await supabaseAdmin.from('invoices').delete()
    .eq('id', req.params.id).eq('user_id', req.user!.id);
  res.json({ message: 'Invoice deleted' });
});

export { router as invoicesRouter };
