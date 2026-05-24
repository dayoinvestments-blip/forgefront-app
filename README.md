# ForgeFront — SDVOSB Command Center

**Built by LaDarrell Willis · NextGen Welding & Fabrication LLC**

## How to Deploy

### Netlify (Web Dashboard)
1. Upload this entire folder to GitHub
2. Connect GitHub repo to Netlify
3. Add environment variables in Netlify → Site Settings → Environment Variables:
   - `SAM_GOV_API_KEY` = SAM-f65fe6c1-4ac7-4244-ab06-2cf3fd0af73e
   - `SUPABASE_URL` = https://ycadicxcwcgdiefdqbrn.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key from Supabase
4. Netlify auto-detects `netlify.toml` and deploys everything

### Database (First time only)
1. Go to Supabase → SQL Editor → New Query
2. Paste contents of `database/STEP1-run-this-in-supabase.sql`
3. Click Run

### Mobile App (iOS / Android)
```bash
npm install
eas build --platform ios
eas build --platform android
```

## Your Credentials
- Supabase: https://ycadicxcwcgdiefdqbrn.supabase.co
- Login: darrelltwillis@hotmail.com
- Netlify: luxury-cactus-b84bad.netlify.app
- SAM.gov key expires in ~88 days — renew at sam.gov/profile/details
