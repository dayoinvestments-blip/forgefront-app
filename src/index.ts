import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

import { authRouter }             from './routes/auth';
import { jobsRouter }             from './routes/jobs';
import { crewRouter }             from './routes/crew';
import { invoicesRouter }         from './routes/invoices';
import { contractsRouter }        from './routes/contracts';
import { unifiedContractsRouter } from './routes/unifiedContracts';
import { bidWriterRouter }        from './routes/bidWriter';
import { adminRouter }            from './routes/admin';
import { webhooksRouter }         from './routes/webhooks';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);
app.use(express.json({ limit: '1mb' }));

app.use('/api/',          rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use('/api/auth/login',    rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 5  }));
app.use('/api/bid-writer',    rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }));

app.use('/api/auth',      authRouter);
app.use('/api/jobs',      jobsRouter);
app.use('/api/crew',      crewRouter);
app.use('/api/invoices',  invoicesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/contracts', unifiedContractsRouter);
app.use('/api/bid-writer',bidWriterRouter);
app.use('/api/admin',     adminRouter);

app.get('/health', async (_, res) => {
  try {
    const { supabaseAdmin } = await import('./db/supabase');
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    res.json({ status: error ? 'degraded' : 'ok', version: '2.0.0', db: error ? 'error' : 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded' });
  }
});

app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 ForgeFront API v2.0 (Supabase) on :${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌ SUPABASE_URL not set'}`);
});
