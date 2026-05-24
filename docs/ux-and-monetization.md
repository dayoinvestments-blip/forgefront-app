# ForgeFront — UX Enhancements & Monetization Pathways

## UX ENHANCEMENTS — Highest Impact First

### Tier 1: Build These Next (High ROI, Low Effort)
---

**1. Contract Match Explainer Card**
When a contract scores ≥70, show a "Why this matched" drawer with:
- NAICS alignment visual
- Set-aside badge (green = your cert)
- Distance from preferred state
- "Similar won contracts by SDVOSBs" (social proof)
_Impact: Reduces decision fatigue. Users act faster on contracts they understand._

**2. Swipe-to-Dismiss / Swipe-to-Save Contracts**
Add swipe gestures to ContractRow:
- Swipe right → Save to watchlist
- Swipe left → Dismiss (hide from feed)
_Impact: Reduces noise, makes feed feel curated. 10 min to implement with react-native-gesture-handler._

**3. Dashboard Pulse Indicator**
Replace the static alert banner with a live "pulse" animation when new contracts have been matched since last visit. Show a red dot on the Contracts tab.
_Impact: Creates urgency and return visits. Classic engagement driver._

**4. One-Tap Proposal Start**
From ContractDetail, add a large CTA: "✍️ Start AI Proposal" that pre-fills contract metadata (title, agency, NAICS, solicitation number) into BidWriter.
_Impact: Removes the biggest friction point in the Pro workflow._

**5. Invoice "Quick Send" from Dashboard**
Show the most recent unpaid invoice at the top of Dashboard with a "Resend" button.
_Impact: Gets contractors paid faster — directly tied to their loyalty to the app._

**6. Haptic Feedback Throughout**
Add expo-haptics to key interactions:
- Contract saved → light impact
- Invoice sent → success notification
- Bid generated → medium impact
_Impact: Makes the app feel premium on iOS. 30 minutes of work._

**7. Empty State Illustrations**
Replace empty list views with contextual guidance:
- No jobs yet → "Add your first job to start tracking"
- No contracts matched → "Update your NAICS codes in profile"
_Impact: Reduces confusion for new users. Reduces churn in first 48 hours._

**8. Offline Banner**
Show a subtle top banner when the user is offline, with a message: "Showing cached contracts. Connect to refresh."
_Impact: Critical for contractors working in the field with spotty signal._

---

### Tier 2: Build in 30–90 Days

**9. Push Notification Drip**
Trigger push notifications via Expo:
- New SDVOSB contract matching your NAICS → immediate
- Response deadline in 72 hours → reminder
- Invoice unpaid after 30 days → "Follow up with [Client]"
- Crew cert expiring in 14 days → "Renew [Name]'s cert"

**10. Profile Completion Meter**
Show a % complete ring on the profile screen:
- NAICS codes added (+20%)
- Set-aside certs confirmed (+20%)
- Company info complete (+20%)
- First job added (+20%)
- First invoice sent (+20%)
_Impact: Onboarding gamification. Increases activation rate._

**11. Bid Proposal History**
Save every AI-generated proposal to a "My Proposals" tab. Let users:
- Copy and reuse past proposals
- See win/loss status (manual input)
- Tag with contract it was submitted for

**12. Contract Bookmark / Watchlist**
Persistent saved contracts list that syncs across sessions.

**13. Dark/Light Mode Toggle**
App is dark-only currently. Add a theme toggle — light mode matters for field use in sunlight.

**14. Crew Certification Expiration Alerts**
The CrewScreen already tracks certs. Wire expo-notifications to fire 30/14/7 days before expiration.

---

### Tier 3: Platform Maturity (90+ Days)

**15. Calendar Integration**
Pull response deadlines into the user's device calendar (expo-calendar).

**16. Document Scanner**
Use expo-camera to scan and attach documents (SOWs, award letters) directly to job records.

**17. Subcontractor Network**
Let Pro users post their own subcontracting needs to other ForgeFront users. B2B flywheel.

**18. Past Performance Builder**
Auto-generate a formatted past performance citation from completed jobs. Feeds directly into future bid proposals.

---

## MONETIZATION PATHWAYS

### Current Model (Live)
| Tier | Price | Limit |
|------|-------|-------|
| Free | $0 | 3 contracts, no AI |
| Base | $29/mo | 25 contracts, 3 AI proposals/day |
| Pro | $79/mo | Unlimited, 20 AI proposals/day |

**Estimated MRR at 100 users (50/30/20 split):** ~$3,880/mo
**Estimated MRR at 500 users:** ~$19,400/mo

---

### Expansion Revenue Streams

**1. AI Proposal Credits (Pay-per-use)**
Free users pay $4.99 per AI proposal (one at a time).
_Converts free users who find one matching contract but won't subscribe yet._

**2. Contract Alert SMS ($4.99/mo add-on)**
Text alerts for new contract matches in real time. BYO Twilio integration.
_Low cost to build, high perceived value for contractors in the field._

**3. Featured Business Listings (B2B)**
Let prime contractors pay to feature their subcontracting opportunities directly in the ForgeFront SubNet feed. $99–$299/mo per listing.
_Monetizes the supply side. Zero additional user acquisition needed._

**4. Verified SDVOSB Badge ($49 one-time)**
Charge a one-time fee to verify and display a "Verified SDVOSB" badge on user profile. Manual verification or CVE API integration.
_Trust signal that also creates a revenue event at signup._

**5. Annual Plan Discount (25% off)**
Base: $261/yr (~$21.75/mo). Pro: $711/yr (~$59.25/mo).
_Improves cash flow and reduces churn. Offer during onboarding and paywall._

**6. ForgeFront Pro Teams ($149/mo, up to 5 users)**
Multi-user accounts for larger SDVOSB companies with a PM, estimator, and field crew.
_3x ARPU. Natural expansion path as users grow._

**7. White-Label Licensing (B2B SaaS)**
License the platform to veteran business organizations (DAV, VFW, SCORE) who want to offer it to their members under their own brand.
_Enterprise contract. One deal could equal 6–12 months of subscription revenue._

**8. Workforce Development Module (Grant-funded)**
A stripped-down version of the platform for vocational training programs.
Charge institutions $999–$4,999/yr for a "cohort license."
_Directly tied to NextGen Welding's workforce pipeline mission._

**9. Data & Insights Reports (Future)**
At scale (5,000+ users), aggregate anonymized bid/contract win data and sell industry reports to primes, associations, and procurement consultants. $299–$999/report.

---

## STATE/LOCAL API ACTIVATION CHECKLIST

### SAM.gov (Federal) — Free
- [ ] Register at https://api.sam.gov
- [ ] Generate API key
- [ ] Add `SAM_GOV_API_KEY=your_key` to backend .env
- [ ] Test: `GET /api/contracts/unified?sources=federal`

### BidNet Direct (State/Local) — ~$500/mo
- [ ] Contact BidNet at https://www.bidnetdirect.com/api
- [ ] Request API credentials for "developer/SaaS" use case
- [ ] Add `BIDNET_API_KEY=your_key` to backend .env
- [ ] Test: `GET /api/contracts/unified?sources=state_local&states=LA`
- [ ] Alternative: DemandStar (demandstar.com) has similar pricing and coverage

### SBA SubNet (Federal Subcontracts) — Free
- [ ] No formal JSON API exists; monitor for beta access at https://web.sba.gov/subnet
- [ ] Short-term: use mock data (already built in) — quality mock data is in UnifiedContractService.ts
- [ ] Long-term: build a lightweight scraper targeting the SubNet search results page

### Recommended First Step
Get SAM.gov API key (free, 10 minutes). It activates the federal feed immediately with real data.
State/local mock data is already wired and returns realistic Louisiana-specific opportunities.
