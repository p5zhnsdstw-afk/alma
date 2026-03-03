# Ari → Alma MVP: JTBD Bridge Strategy
## From Personal Prototype to Minimum Viable Product

**Date:** 2026-03-02
**Framework:** Klement JTBD + Gap Analysis
**Reference:** `~/.claude/openclaw/home-command-center-strategy.md` (22-framework foundation)
**Session:** VKG-2026-03-02-001

---

## 1. WHAT ARI DOES TODAY (Capability Map)

### Working — Validated with Real Users (Robert & Mari)

| Capability | Job Served | Maturity | Alma Job Story |
|-----------|-----------|----------|---------------|
| Morning briefing (7:25 AM) | SM-3: "What does my day hold?" | **Strong** | JS-1 (morning control) |
| Evening summary (8:55 PM) | SM-3: End-of-day synthesis | **Strong** | JS-1 |
| Event reminders (every 15 min, 8AM-10PM) | SM-2: Don't drop balls | **Strong** | JS-1, JS-4 |
| Task system (tasks.json v2) | SM-2: Capture & track | **Medium** | JS-4 (quick capture) |
| Intent detection → auto-task | SM-2: "Necesito..." → captured | **Medium** | JS-4 |
| Voice note transcription | SM-4: Quick capture mid-task | **Medium** | JS-4 |
| Meeting capture (Regla #6) | SM-2: Post-meeting follow-through | **Medium** | JS-5 (reliable follow-through) |
| Per-user data isolation | NC-6, NC-10 | **Strong** | Architecture requirement |
| Calendar integration (CalDAV) | SM-1, SM-2 | **Medium** | JS-1 |
| Memory/KB (ari-kb) | Personalization over time | **Weak** (FTS5 broken) | Switching cost builder |
| Cron-based scheduling | All proactive features | **Strong** | Infrastructure |
| WhatsApp channel | Zero-friction delivery | **Strong** | Core channel decision |

### Missing — Required for Alma MVP

| Alma Job Story | Gap | Severity |
|---------------|-----|----------|
| **JS-2: Home maintenance lifecycle** | **Does not exist.** No home profile, no appliance tracking, no maintenance schedules, no seasonal reminders. | **CRITICAL** — this is the differentiator |
| **JS-3: Family load distribution** | **Partially exists.** Ari serves Robert & Mari independently but doesn't coordinate BETWEEN them. No "nudge Mari about X" from Robert's request. No load balancing detection. | **HIGH** — core value prop for champion buyer |
| **Multi-family architecture** | Ari is single-family. Alma needs per-family SQLite, multi-tenant isolation. | **CRITICAL** — can't sell without it |
| **Onboarding flow** | Ari was configured manually over months. Alma needs 24-hour time-to-value (NC-1). | **CRITICAL** — PMF depends on first impression |
| **WhatsApp Business API** | Ari uses Baileys (unofficial, brittle). Alma needs WBA Cloud API (NC-4). | **CRITICAL** — can't scale on Baileys |
| **Billing/payments** | None. | **Required** for revenue |
| **Apple Calendar sync** | Ari only does Google CalDAV. Many LATAM families use iPhone + Apple Calendar. | **HIGH** — D-20 already decided |
| **Home maintenance KB** | No structured maintenance knowledge. Need Postgres + pgvector for home data (per CLAUDE.md). | **CRITICAL** — enables JS-2, SM-4, SM-6 |

---

## 2. MVP JOB PRIORITIZATION (Which Jobs to Nail)

From the strategy doc, Alma's JTBD breaks into 3 tiers. **MVP = Tier 1 + Tier 2.**

### Tier 1 — Must Work Day One (validated in Ari, port to Alma architecture)

| Job Story | Feature | Why Day One |
|-----------|---------|------------|
| **JS-1:** Morning briefing | Synthesized daily briefing via WhatsApp at configured time | NC-1: tangible value in 24 hours. Ari proves this works — strongest signal. |
| **JS-4:** Quick capture | Voice/text → task or reminder in 5 seconds | Reduces anxiety immediately. Ari validates this daily. |
| **JS-5:** Meeting follow-through | Post-meeting action items captured and nudged | Professional value — justifies cost for working adults. |

**These are Ari's PROVEN jobs.** Port them, don't redesign them.

### Tier 2 — Must Work by Week 4 (the differentiator)

| Job Story | Feature | Why Tier 2 |
|-----------|---------|-----------|
| **JS-2:** Home maintenance lifecycle | Home profile + appliance tracking + proactive seasonal/lifecycle reminders | **THE moat.** NC-2: prevent one expensive surprise in 6 months. Without this, Alma is "just another reminder bot." |
| **JS-3:** Family coordination | Multi-member household, per-person nudges, shared visibility, load awareness | Champion buyer (73%-load partner) won't pay $50/mo for personal reminders. She pays to DISTRIBUTE the load. |

### Tier 3 — Post-MVP (Month 3-6)

| Job Story | Feature | Why Later |
|-----------|---------|----------|
| Cross-domain intelligence | "Your HVAC tech is coming Thursday but you have back-to-back meetings" | Requires both calendar + home maintenance mature |
| Financial tracking | "Your home maintenance saved ~$2,400 vs emergency repairs this year" | Value storytelling for retention + referrals (NC-7) |
| Family onboarding virality | Spouse gets value → tells friends → organic growth (NC-8) | Growth, not PMF |

---

## 3. THE MVP BUILD SEQUENCE

```
Phase 0: ARCHITECTURE MIGRATION (Weeks 1-2)
├── Multi-family SQLite (D-10 already decided)
├── WhatsApp Business API (D-1 already decided)
├── Separate OpenClaw instance for Alma (D-9)
├── Channel abstraction layer (anti-pattern: no platform lock-in)
└── Per-member calendar adapters: Google + Apple (D-14, D-20)

Phase 1: PORT ARI'S PROVEN JOBS (Weeks 2-3)
├── Morning briefing (JS-1) — port Ari's cron + template
├── Event reminders (JS-1) — port 15-min cron pattern
├── Quick capture: text + voice → task (JS-4)
├── Meeting capture → tasks with nudges (JS-5)
├── Evening summary — port pattern
└── Onboarding: 5-message WhatsApp flow → value in <24h (NC-1)
    "What's your name? Who's in your family? Connect your calendar."

Phase 2: BUILD THE DIFFERENTIATOR (Weeks 3-6)
├── Home profile capture (conversational)
│   "What appliances do you have? Water heater age? HVAC type?"
├── Home maintenance KB (Postgres + pgvector)
│   Structured: appliance → maintenance schedule → cost of neglect
├── Proactive maintenance reminders (JS-2)
│   "Your water heater is 8 years old. Annual flush is due."
├── Family member onboarding (JS-3)
│   Primary adds spouse → spouse gets own briefing + nudges
├── Task delegation + nudge distribution (JS-3)
│   "Robert: the fumigator is coming Thursday 10AM. Can you be home?"
└── "Alma moment" logging
    Track every prevented-problem for retention storytelling

Phase 3: PAYMENT + POLISH (Weeks 6-8)
├── Stripe integration (Alma $24.99/mo, Familia $39.99/mo)
├── Progressive onboarding (anti-pattern: don't overwhelm week 1)
├── Spam throttling (max 5 proactive messages/day per member)
└── Fundadoras 50 launch mechanics
```

---

## 4. VALIDATION CRITERIA (How We Know MVP Works)

### Must-Pass Gates Before "Fundadoras 50" Launch

| Gate | Metric | Source |
|------|--------|--------|
| **G-1: 24-hour value** | 100% of new users receive first morning briefing within 24h of signup | NC-1 |
| **G-2: Calendar works** | Both Google + Apple Calendar sync bidirectionally | D-14, D-20 |
| **G-3: Home profile captured** | 80% of users complete home profile within 7 days | JS-2 prerequisite |
| **G-4: Maintenance reminder delivered** | First proactive home maintenance reminder sent within 14 days | NC-2 path |
| **G-5: Family member added** | 60% of primary users add at least one family member by day 30 | JS-3, NC-8 |
| **G-6: Retention signal** | <10% churn in first 30 days of Fundadoras cohort | CSF-1 |
| **G-7: Unit economics** | Variable cost ≤$5/primary user/month | CSF-2 |
| **G-8: WhatsApp stable** | Zero Baileys-style disconnects (WBA Cloud API) | NC-4 |

### Dogfood First: Robert & Mari as Alpha

Before Fundadoras 50, Alma must run for Robert & Mari for 2+ weeks:
- Ari continues running (don't break what works)
- Alma runs in parallel as a SEPARATE instance (D-9)
- Robert & Mari test Alma's onboarding as if they were new users
- Home profile captured, maintenance reminders working, family coordination tested
- If Robert & Mari wouldn't pay $50/mo for this, it's not ready

---

## 5. WHAT TO CARRY FROM ARI (Don't Reinvent)

### Port Directly
- Morning/evening briefing templates and timing
- Event reminder cron pattern (every 15 min)
- Task system structure (v2 format works)
- Intent detection patterns ("necesito", "tengo que"...)
- Voice note → transcription → action pipeline
- Meeting capture → task creation (Regla #6)
- Per-user data isolation architecture
- SOUL.md behavioral rules (adapted for multi-family)

### Evolve
- **Calendar:** CalDAV → Google OAuth + Apple CalDAV adapters (bidirectional)
- **Memory:** ari-kb (broken FTS5) → per-family SQLite with working search
- **Channel:** Baileys → WhatsApp Business Cloud API
- **Tasks:** tasks.json → per-family SQLite table
- **Identity:** Single-family IDENTITY.md → per-family config (names, timezone, preferences)

### Leave Behind (Ari-specific, not Alma)
- Robert's minoxidil reminders
- Mission Control weekly reports
- Stoic quotes
- Portfolio updates
- Claude Code integration scripts

---

## 6. STRATEGIC RISK CHECK

| Risk | Mitigation |
|------|-----------|
| **Home maintenance KB quality** — bad advice erodes trust instantly | Anti-pattern from strategy: NEVER LLM-generate maintenance advice. Use structured, expert-validated schedules only. AI decides WHEN to remind, not WHAT to do. |
| **WhatsApp Business API approval** — Meta can reject or rate-limit | Apply early (Week 1). Have template messages pre-approved. Fallback: Baileys for alpha only. |
| **Scope creep** — "one more feature" before launch | Fundadoras 50 is a CLOSED beta. 50 families, $24.99/mo. Ship Tier 1+2, iterate based on real usage. |
| **Ari dependency** — breaking Ari while building Alma | D-9: Alma is a SEPARATE OpenClaw instance. Ari keeps running untouched. |
| **Over-engineering onboarding** — complex setup kills activation | Progressive: Day 1 = name + calendar. Day 3 = home profile. Day 7 = add family. NOT everything at once. |

---

## 7. DECISION LOG (This Document)

| # | Decision | Rationale |
|---|----------|-----------|
| D-MVP-1 | MVP = Tier 1 (proven jobs) + Tier 2 (differentiator) | Tier 1 alone is a commodity. Tier 2 alone has no foundation. Both together = viable product. |
| D-MVP-2 | Port Ari patterns, don't redesign | 6+ months of real-world validation. Morning briefing format, reminder cadence, task capture — all proven. |
| D-MVP-3 | Dogfood with Robert & Mari before Fundadoras | They're the archetype. If it doesn't work for them, it won't work for 50 strangers. |
| D-MVP-4 | Home maintenance KB = structured data, not LLM generation | Trust is the product. One bad maintenance suggestion and the user leaves forever. |
| D-MVP-5 | 8-week build to Fundadoras 50 launch | Aggressive but feasible: Weeks 1-2 architecture, Weeks 2-3 port Ari, Weeks 3-6 differentiator, Weeks 6-8 payment + polish. |

---

## 8. POST-MVP ROADMAP: Alma v1 → v2 → v3+

### The Compounding Vision

Each version deepens the moat (switching costs + process power) and expands the addressable market. The sequence follows the 7 Powers timeline from the strategy: Counter-Positioning (MVP) → Switching Costs (v1-v2) → Process Power (v2-v3).

```
MVP (Fundadoras 50)        v1.0 (Month 3-6)           v2.0 (Month 6-12)         v3.0 (Month 12-24)
─────────────────────      ─────────────────────       ─────────────────────      ─────────────────────
50 families, LATAM         200 families                1,000 families             5,000+ families
$24.99-$39.99/mo           + Premium tier $9.99        + Enterprise/property mgmt  $3M ARR target
Counter-Positioning        Build Switching Costs       Process Power              Category Leadership
```

---

### v1.0 — "The Habit Machine" (Month 3-6, post-Fundadoras)

**Strategic goal:** Turn early adopters into addicts. Prove retention (<5% monthly churn).

| Feature | Job Served | Why Now |
|---------|-----------|---------|
| **Cross-domain intelligence** | SM-2 (context-switching) | "Your plumber comes Thursday 10AM but you have a board meeting. Reschedule plumber?" Calendar + home maintenance CONNECTED. |
| **Financial impact tracking** | NC-7 (word of mouth) | "Alma saved you ~$1,800 in prevented repairs this quarter." The story users tell friends. |
| **Seasonal intelligence engine** | SM-6 (new homeowner) | Location-aware: "Guayaquil rainy season starts in 2 weeks. Gutter inspection recommended." |
| **Smart message timing** | Anti-pattern: spam | Learn when each user is most responsive. Don't message during deep work blocks. |
| **Conversation memory depth** | CSF-3 (switching costs) | "Last time you called a plumber, you used Juan (+593...) and paid $85. Want me to contact him?" |
| **Service provider directory** | Switching cost builder | User builds a personal rolodex of trusted providers. Painful to recreate elsewhere. |
| **Referral mechanics** | NC-8 | "Invite a family, get a month free." Spouse → spouse is the viral loop. |

**Key metric:** Month-6 cohort churn <5%. If yes → product-market fit confirmed, raise or scale.

---

### v2.0 — "The Home Brain" (Month 6-12)

**Strategic goal:** Make Alma irreplaceable. The switching cost is now the accumulated home intelligence.

| Feature | Job Served | Why Now |
|---------|-----------|---------|
| **Home digital twin** | SM-6, CSF-3 | Complete model: every appliance, warranty date, service history, provider contacts, maintenance costs. Leaving Alma = losing your home's memory. |
| **Predictive maintenance** | SM-4 (prevent $5K surprises) | Move from schedule-based ("flush water heater annually") to condition-based ("your water heater is showing signs of age — schedule inspection before winter"). Uses accumulated data + KB. |
| **Multi-property support** | Market expansion | Vacation homes, rental properties. Same family, multiple homes. Premium tier. |
| **Family financial dashboard** | New job: household budget awareness | "This month: $340 in home maintenance, $85 scheduled, $0 emergencies. YTD savings vs reactive: ~$4,200." |
| **Vendor coordination** | SM-5 (family OS) | Alma schedules the plumber, confirms with the homeowner, sends the address, follows up on quality. End-to-end. |
| **Document storage** | Switching cost compounder | Warranties, receipts, contracts, insurance policies — all captured via WhatsApp photo. Searchable. |
| **Localized maintenance KB** | Process power | LATAM-specific: different building codes, climate patterns, appliance brands, seasonal schedules vs North America. Hard-won knowledge. |
| **Property manager tier** | Revenue expansion | Property managers with 5-50 units. $199/mo. Same product, different buyer persona. |

**Key metric:** LTV/CAC >3:1. Net revenue retention >110% (expansion via family members + tiers).

---

### v3.0 — "The Category" (Month 12-24)

**Strategic goal:** Own "AI Home & Life Manager" as a category. $3M ARR. Defensible moat.

| Feature | Job Served | Why Now |
|---------|-----------|---------|
| **Marketplace: trusted providers** | New revenue stream | Alma recommends vetted providers. Takes referral fee. Users trust Alma's recommendation > Google search. |
| **Insurance integration** | SM-4 (financial protection) | "Your home maintenance history qualifies you for 15% lower premiums." Partnership with insurers who value proactive homeowners. |
| **Smart home integration** | SM-6, IoT expansion | Connect to smart sensors: water leak detectors, HVAC monitors, security systems. Alma becomes the intelligence layer on top of dumb devices. |
| **Regional expansion** | Scale | Mexico, Colombia, Chile, Brazil (Portuguese). Localized maintenance KB per region. |
| **Community intelligence** | Process power + data moat | "3 homeowners in your neighborhood reported termite activity. Schedule inspection?" Aggregated anonymized data creates unique value. |
| **API / Partnerships** | Distribution | Real estate agents gift Alma to new buyers. Mortgage companies bundle it. Insurance requires it. |
| **Multi-channel** | Market expansion | WhatsApp remains primary. Add: voice assistant (Alexa/Google), SMS fallback, optional web dashboard for power users. |
| **Alma Pro (B2B)** | New market | HOAs, property management companies, real estate portfolios. Enterprise pricing. |

**Key metric:** $3M ARR, 80%+ gross margins, category recognition ("the Alma of X" used in conversation).

---

### Version Evolution: JTBD Expansion Map

```
                    MVP                    v1.0                 v2.0                  v3.0
                    ────                   ────                 ────                  ────
JS-1 Morning       ██████████             ██████████           ██████████            ██████████
     briefing      (port from Ari)        (smart timing)       (predictive)          (multi-channel)

JS-2 Home          ████████░░             ██████████           ██████████            ██████████
     maintenance   (schedule-based)       (seasonal intel)     (predictive + twin)   (community intel)

JS-3 Family        ██████░░░░             ████████░░           ██████████            ██████████
     coordination  (nudges)               (delegation)         (vendor coord)        (full OS)

JS-4 Quick         ██████████             ██████████           ██████████            ██████████
     capture       (port from Ari)        (memory-enriched)    (doc storage)         (multi-channel)

JS-5 Follow-       ████████░░             ██████████           ██████████            ██████████
     through       (port from Ari)        (cross-domain)       (automated)           (automated)

NEW: Financial     ░░░░░░░░░░             ██████░░░░           ██████████            ██████████
     awareness     (not yet)              (impact tracking)    (dashboard)           (insurance)

NEW: Home as       ░░░░░░░░░░             ░░░░░░░░░░           ████████░░            ██████████
     asset         (not yet)              (not yet)            (digital twin)        (marketplace)
```

### Moat Deepening Over Time

```
Month:        0────────6────────12────────18────────24────────36
              │        │         │         │         │         │
Counter-Pos:  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░  (erodes)
Switching:    ░░░░░░░░████████████████████████████████████████  (compounds)
Process:      ░░░░░░░░░░░░░░░░██████████████████████████████████ (compounds)
Brand:        ░░░░░░░░░░░░░░░░░░░░░░░░██████████████████████████ (builds)
Data/Network: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████████████ (late but durable)
```

**The critical window:** Months 0-18. Counter-positioning buys time. If switching costs + process power aren't deep by month 18, competitors copy the positioning and Alma becomes a feature, not a category.
