# Alma — AI Home & Life Manager

## What This Is
WhatsApp-native AI Home & Life Manager for dual-income homeowner families.
Built on OpenClaw framework, deployed as separate instance on macvieja.

## MVP C "La Que Manda" — The Family Nag Eliminator
**Core loop:** Mom tells Alma → Alma delivers to family at right time → follows up → confirms back → morning briefing shows status.
**Features:** Smart capture (WHO+WHAT+WHEN), delayed delivery, follow-up/re-nudge, confirmation, morning briefing with status, bidirectional replies.
**Uncommon Service (Frei):** Excel at multi-person delivery (10/10), follow-up (9/10), briefing with status (8/10). Deliberately BAD at: UI, integrations, home maintenance, config, speed, personalization.
**Score:** 8.6/10 (Vikings Tier 3, Hormozi Value Equation + Uncommon Service)

## Architecture (ADR-001: Modular Monolith)
```
src/modules/
  whatsapp/      # Message handling, webhook (ADR-003: provider abstraction)
  llm/           # LLM provider abstraction (ADR-004: Gemini Flash primary)
  delivery/      # MVP C core: delayed delivery, follow-up, confirmation, bidirectional
  calendar/      # Internal calendar + sync adapters (D-14/D-19/D-20)
    adapters/    # Google (MVP), Apple (post-MVP), ICS (later)
  tasks/         # Task tracking, reminders
  maintenance/   # Home maintenance KB (ADR-005: pgvector for shared KB)
  billing/       # Paddle payments (Merchant of Record)
  users/         # Multi-tenant, family groups + family_contacts
  briefing/      # Morning/evening briefings + delivery stats
  capture/       # Voice/text capture → delivery intent detection first
  nudge/         # Partner/family nudges
```

## Key Decisions
- D-1: WhatsApp Business API (not Baileys)
- D-9: Separate OpenClaw instance (not agent inside Ari)
- D-10: Per-family SQLite files for household data
- D-14: Alma internal calendar is source of truth + Google Calendar bidirectional sync (MVP)
- D-19: WhatsApp-only mode is first-class, not degraded (no sync = still works)
- D-20: Per-member calendar adapter (each family member can have different sync or none)
- ADR-003: WhatsApp API abstraction (CloudAPIProvider + BaileysDevProvider)
- ADR-004: LLM provider abstraction (Gemini Flash default)
- ADR-005: Shared home maintenance KB in Postgres + pgvector
- D-21: MVP C "La Que Manda" — delivery-first capture pipeline, family_contacts for lazy phone resolution
- D-22: Delivery scheduler runs every 60s in-process (not cron) for precise timing
- D-23: Unregistered family members can receive + reply without onboarding (delivery_phones reverse lookup)

## Calendar Architecture
```
Internal Calendar (family SQLite, source of truth)
  ← Google Adapter (MVP, bidirectional, OAuth)
  ← Apple CalDAV Adapter (MVP, bidirectional, app-specific password)
  ← ICS Adapter (later, read-only for Outlook)
  ← WhatsApp-only (no adapter needed, events captured via chat)
```
Both Google and Apple are MVP. Mixed households are the most common scenario.
Morning briefing reads from internal calendar — works regardless of sync.

Apple CalDAV notes:
- Requires app-specific password (appleid.apple.com → Security → App-Specific Passwords)
- Server: caldav.icloud.com, auth via Basic (apple_id:app_password)
- Discovery: PROPFIND principal → calendar-home-set → list calendars
- More friction than Google OAuth but essential for iPhone-primary users

## Data Architecture
- **Per-family:** SQLite file per family in `data/families/{family_id}.db`
  - `calendar_events` — internal calendar (source of truth, synced from external)
  - `items` — captured tasks, reminders, notes
  - `deliveries` — MVP C: sender→recipient message lifecycle (pending/scheduled/delivered/confirmed/expired)
  - `family_contacts` — name-to-phone mapping for delivery recipients (lazy collection)
  - `home_profile` + `maintenance_schedule` + `maintenance_log`
  - `preferences` + `episodes`
- **Shared:** Master DB (users, billing, referrals) in `data/alma-master.db`
  - Per-user calendar sync config (provider, token, external ID)
  - `delivery_phones` — reverse lookup: unregistered phone → family_id
- **Home maintenance KB:** Postgres + pgvector (shared knowledge, not per-family)

## Tech Stack
- **Runtime:** Node.js + TypeScript
- **Framework:** OpenClaw (WhatsApp connectivity, agent orchestration)
- **LLM:** Gemini 2.5 Flash (via OpenRouter or direct API)
- **Channel:** WhatsApp Business Cloud API
- **Payments:** Paddle (Merchant of Record — handles tax/IVA/compliance)
- **Deploy target:** macvieja (100.77.224.43) at `~/.alma/`

## Pricing
- Alma: $24.99/mo (primary user + partner nudges)
- Alma Familia: $39.99/mo (up to 4 members with briefings)
- Premium: $9.99/mo or free with 3 active referrals
- No free tier. 7-day trial, no credit card.

## Anti-Patterns (from strategy)
- NEVER send >5 proactive messages/day (NBR-1)
- NEVER generate maintenance advice from LLM — always grounded in manufacturer data (NBR-2)
- NEVER share data across families — architectural isolation mandatory (NBR-3)
- NEVER skip channel abstraction — WhatsApp rug pull is a real risk (NBR-4)
- NEVER front-load onboarding — progressive over 2 weeks (NBR-6)

## Commands
```bash
npm run dev          # Local development
npm run build        # TypeScript compile
npm run deploy       # Deploy to macvieja
npm run test         # Run tests
```

## Strategy Docs
- `~/.claude/openclaw/home-command-center-strategy.md` (frameworks 1-9)
- `~/.claude/openclaw/alma-strategy-v2-frameworks.md` (frameworks 10-22)
