# ForgeFront v5 — SDVOSB Command Center

## Deploy to Netlify (web dashboard)
1. Push this repo to GitHub (all files, root level)
2. Connect GitHub repo to Netlify
3. Add environment variables in Netlify → Site Settings → Environment Variables:
   - SAM_GOV_API_KEY        = SAM-f65fe6c1-4ac7-4244-ab06-2cf3fd0af73e
   - SUPABASE_URL           = https://ycadicxcwcgdiefdqbrn.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY = your service role key
   - ANTHROPIC_API_KEY      = your Anthropic key (for AI profile assist)
4. Deploy — Netlify auto-detects netlify.toml and functions/

## What's new in v5
- Landing/About page (public-facing, explains app before login)
- Business Profile page (5-section AI-assisted form — powers all bid proposals)
- Watchlist — save and track contracts
- Annual billing toggle in upgrade modal (default)
- Pay-per-proposal ($4.99 single bid option)
- Reframed paywall with specific contract count
- Bid Writer reads Business Profile automatically
- AI Improve buttons on every profile field
- About ForgeFront in nav
- Boot shows landing page for first-time visitors

## Your credentials
- Login: darrelltwillis@hotmail.com
- Supabase: https://ycadicxcwcgdiefdqbrn.supabase.co
- SAM.gov key expires ~88 days from issue — renew at sam.gov/profile/details
