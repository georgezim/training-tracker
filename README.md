# Dromos

Personal training PWA — AI-powered coaching for marathon, half marathon, 10K, and fitness goals.

## Quick Start

### 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and open your project
2. Click **SQL Editor** → **New query**
3. Paste the contents of `supabase/migrations/001_initial.sql`
4. Click **Run**

### 2. Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone or browser.

### 3. Add to Home Screen (PWA)

**iPhone (Safari):**
- Open the app in Safari
- Tap the Share button → "Add to Home Screen"

**Android (Chrome):**
- Tap the 3-dot menu → "Add to Home Screen" (or "Install app")

---

## Features

| Tab | What it does |
|-----|-------------|
| **Today** | Shows today's workout, race countdown, session completion toggle, and today's metrics |
| **Week** | Full 7-day view with completion dots for all sessions |
| **Check-in** | Log Whoop recovery, sleep score, Achilles pain, feeling, and notes |
| **History** | Scrollable log of past check-ins with color-coded metrics |

### Color coding
- 🔵 **Blue** — Run days
- 🟣 **Purple** — Gym class
- 🟠 **Orange** — Bike
- ⚫ **Gray** — Rest
- 🔴 **Red** — Race day

### Metric thresholds
| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Whoop Recovery | ≥ 70% | 33–69% | < 33% |
| Sleep Score | ≥ 70% | 50–69% | < 50% |
| Achilles Pain | 0/10 | 1–3/10 | > 3/10 |

### Automatic warnings
- **Achilles alert** — shown on Today tab if pain > 3/10
- **Low recovery alert** — shown if Whoop recovery < 33%

---

## Training Plan

**Start:** Monday April 14, 2026  
**Duration:** 31 weeks

| Phase | Weeks | Focus |
|-------|-------|-------|
| 1 — Base Building | W1–6 | Easy runs, build from 5km to 13km long run |
| 2 — 10K Sharpening | W7–10 | Tempo runs. **Race: 10K (Jun 23)** |
| 3 — Volume Build | W11–18 | Build to 26–28km long run, MP segments |
| 4 — 30K Prep | W19–22 | **Race: Ioannina 30K (Sep 11)** |
| 5 — Marathon Specific | W23–28 | Peak 34–35km, 45–55km/week |
| 6 — Taper | W29–31 | **Race: Athens Marathon (Nov 15) 🏆** |

### Weekly structure
- **Mon** — Run (easy Phases 1–2, tempo/MP from Phase 3+)
- **Tue** — Gym class (strength + eccentric heel drops)
- **Wed** — Bike (45–65 min easy)
- **Thu** — Gym class (+ short easy run from Phase 3+)
- **Fri** — REST
- **Sat** — Long Run ⭐ (most important session)
- **Sun** — REST

---

## Tech Stack

- **Next.js 14** (App Router)
- **Supabase** (PostgreSQL + real-time)
- **Tailwind CSS**
- **PWA** with service worker for offline support

## Deployment

```bash
# Build for production
npm run build
npm start
```

Or deploy to [Vercel](https://vercel.com) — just connect your repo and add the `.env.local` variables as environment variables in the Vercel dashboard.
