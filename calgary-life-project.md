# Calgary Life — Project Brief

A browser-based life simulator set in Calgary, inspired by Nigeria's *Lagos Life* (1M+ players within days of launch). Players create a character, work, spend, and survive local realities: winter, rent, transit, Stampede, boom-and-bust.

> Working title. Alternatives: *YYC Life*, *Cowtown Life*, *Canada Life* (later expansion).

---

## 1. Why this can work (lessons from Lagos Life)

| Lagos Life ingredient | Calgary equivalent |
|---|---|
| Everyday local friction as gameplay (generators, inverters for unreliable power) | Winter, block heaters, dead car batteries, hail, CTrain delays |
| Real landmarks (Amala Shitta, Quilox) | Kensington, Stampede Grounds, 17th Ave, Bow River pathway, Calgary Tower, Deerfoot |
| Random class split: "Nepo" vs "Lapo" | Random starting background (see §4) |
| Browser-only, no download | Same: web, mobile-first, no install |
| Multiplayer / meeting others | Light social layer (see §6) |
| Sims-style open-ended play | Same: no forced storyline |
| Shareable, funny, screenshot-worthy moments | Event text and result cards designed for posting |

**Core principle:** local specificity is the product. Every mechanic should make a Calgarian say "that's so true."

---

## 2. Goals and non-goals

**Goals**
- Ship a playable, funny MVP fast (target: 2–4 weeks solo).
- Mobile-first, loads in seconds, guest play with no sign-up.
- Built to be shared: every session should produce at least one postable moment.

**Non-goals (for v1)**
- Full Sims-style 3D or deep graphics.
- Real-money features or heavy monetization.
- Covering all of Canada. Start with Calgary, expand after validation.

---

## 3. Core game loop

1. **Create character:** name, avatar, neighbourhood to start in.
2. **Get assigned a background** (random, see §4).
3. **Each in-game day:** choose actions with limited **energy** and **time**:
   - Work (shift, side hustle, remote job)
   - Commute (CTrain, bus, drive, bike)
   - Spend (groceries, rent, car, fun)
   - Socialize (friends, events, meet other players)
   - Rest
4. **Random events** hit (weather, breakdowns, price changes, city events).
5. **Track stats:** money, energy, mood, health, reputation, housing, transport.
6. **Goals and progression:** better housing, better job, car upgrade, savings, social status.
7. **End-of-week summary card** (shareable).

---

## 4. Starting backgrounds (the "Nepo vs Lapo" hook)

Assigned randomly at the start so players compare experiences.

Candidate pairs (pick one for v1, or let players roll among several):

- **Mount Royal Heir** vs **Basement Suite Renter**
- **Oil Patch Six-Figures** vs **Gig Worker Juggling Three Apps**
- **Born-and-Raised Calgarian** vs **Just Landed at YYC** (newcomer: no credit history, no "Canadian experience")

Each background changes starting money, housing, job options, and which events hit hardest.

---

## 5. Local mechanics ("pain points as gameplay")

**Weather and seasons**
- Chinook swings: sudden thaw/freeze affects mood, commute, and car.
- -30°C mornings: car won't start without a block heater.
- Hail season: car damage event, insurance deductible decision.
- Winter tires vs all-seasons.

**Transport**
- CTrain / bus delays; free-fare downtown zone.
- Parking costs vs transit pass vs owning a car.
- Deerfoot Trail traffic roulette.
- Stretch idea: real Calgary Transit route data for commutes (see §9).

**Housing and money**
- Rising rent, damage deposits, roommates.
- Boom-and-bust oil cycle shifts job availability and wages.
- Property tax, utilities (winter heating bill spikes).

**Culture and events**
- Stampede week: pancake breakfasts, concerts, big spending temptation.
- Flames game nights, Tim Hortons runs, Kensington patios, Bow River pathway.
- Festivals and seasonal events as timed limited events.

**Newcomer track (high-value for sharing)**
- Building credit, first job, getting licences recognized, "Canadian experience" catch-22.

---

## 6. Social / multiplayer (phase 2)

- Shared city map showing other players at locations.
- Simple chat and emotes.
- Friend list and visiting each other's homes.
- Leaderboards (richest, happiest, most-delayed commuter).
- Keep v1 single-player with async social features (leaderboard, shareable cards) to move fast.

---

## 7. Shareability features (build in from day one)

- End-of-week **result card**: "This week I spent $400 on Stampede pancakes and was late 3 times. Rating: Certified Calgarian."
- Funny, quotable event text.
- Background reveal screen ("You rolled: Basement Suite Renter 😬").
- One-tap share image generation.
- Short, consistent URL; open graph previews.

---

## 8. Tech stack (suggested)

- **Frontend:** React + TypeScript + Vite (mobile-first).
- **Game layer:** start as a text/menu/card sim with a simple map UI; add Phaser or PixiJS only if visuals need it.
- **State:** Zustand or reducer-based store; deterministic event system seeded by day for reproducibility.
- **Backend (when needed):** Supabase or Firebase for auth (guest first), save data, leaderboards, and later realtime multiplayer.
- **Hosting:** Vercel or Netlify. Image share cards via a serverless function or client-side canvas.
- **Analytics:** lightweight (Plausible/PostHog) to see where players drop off.

---

## 9. Stretch: use real transit data

An existing project (`calgary-transit`) already handles Calgary Transit routes and maps. Potential reuse:
- Real CTrain/bus routes for the commute mechanic.
- Delays driven by real or simulated schedule data.
- Map view with actual neighbourhoods and stops.

---

## 10. MVP scope (v0.1)

- [ ] Character creation + random background
- [ ] Daily action loop with energy/time/money
- [ ] 3 stats minimum: money, energy, mood
- [ ] ~30 random events (weather, transport, money, social)
- [ ] Rent + job + one commute mechanic
- [ ] Weekly result card with share button
- [ ] Guest play, localStorage save
- [ ] Mobile-first UI, under 2s load

## 11. Roadmap

1. **Week 1:** core loop, stats, event engine, 10 events.
2. **Week 2:** backgrounds, jobs, housing, weather/seasons, 30 events.
3. **Week 3:** share cards, polish, humour pass on all text, playtest with 5–10 Calgarians.
4. **Week 4:** soft launch (Calgary subreddit, local Instagram/TikTok, friends), measure and iterate.
5. **Later:** multiplayer, newcomer track, other cities (Edmonton, Toronto, Vancouver), then "Canada Life."

---

## 12. Launch and growth ideas

- Seed in r/Calgary, local Discords, Calgary TikTok/Instagram creators.
- Lean into inside jokes. Locals share what's relatable.
- Time a launch near Stampede (early July) or the first big cold snap.
- Let players submit event ideas (community content keeps it fresh).
- Track a "viral coefficient": how many new players each share brings.

---

## 13. Risks and open questions

- **Humour and tone:** needs to be affectionate, not mean. Playtest early.
- **Trademark/IP:** avoid using real brand logos (Tim Hortons, Flames, Stampede) in ways that need licensing. Use parody or generic names.
- **Scope creep:** resist multiplayer and fancy graphics before the core loop is fun.
- **Retention:** one-session virality is easy, long-term retention needs goals and progression.
- **Open questions:** single city or multi-city at launch? Text-only or pixel-art map? Monetization at all?

---

## 14. Next steps

1. Create a new repo and scaffold Vite + React + TS.
2. Define the data model: `Player`, `Stats`, `Background`, `Action`, `Event`.
3. Write the first 10 funny events before building any UI.
4. Build the daily loop with placeholder UI.
5. Playtest with friends, then iterate on humour and balance.
