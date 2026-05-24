import { Router } from 'express';
import axios from 'axios';
import { requireAuth, requireBase } from '../middleware/auth';

const router = Router();
const SAM_API_KEY = process.env.SAM_API_KEY;

router.get('/search', requireAuth, requireBase, async (req, res) => {
  const { naics, setAside, limit = 25, offset = 0 } = req.query;
  try {
    const response = await axios.get('https://api.sam.gov/opportunities/v2/search', {
      params: {
        api_key: SAM_API_KEY,
        naicsCode: naics,
        typeOfSetAsideDescription: setAside || '',
        postedFrom: daysAgo(90),
        postedTo: today(),
        active: 'Yes',
        limit,
        offset,
      },
    });
    res.json(response.data);
  } catch (e: any) {
    console.error('SAM.gov proxy error:', e.response?.status, e.message);
    res.status(502).json({ error: 'SAM.gov API unavailable' });
  }
});

function today() { return new Date().toISOString().split('T')[0].replace(/-/g, '/'); }
function daysAgo(d: number) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().split('T')[0].replace(/-/g, '/'); }

export { router as contractsRouter };
