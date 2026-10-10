# F1 Champ

What has to happen for a driver or team to win the Formula 1 championship? Set
finishing positions for the remaining sessions (sprints included), or apply a
preset like "wins every race but the finale", and see the projected standings,
when the title gets clinched, and who is already out of it. Works for the
drivers' and constructors' championships and for any season Jolpica knows about,
including one that hasn't started yet.

Live: https://jimmcgowen.com/f1-champ/ (`?season=2025` for another year).

## Run

```sh
bun install
bun run build        # typecheck + vite build → dist/
bun run serve        # Bun server: dist/ + /api/season/:year on :58009
bun run dev          # Vite dev server on :5178, proxies /api to :58009
bun test             # engine tests
bun run icon         # regenerate public/apple-touch-icon.png
```

## How it works

- `server.ts` assembles one `Season` JSON per year from the
  [Jolpica](https://api.jolpi.ca/) API (schedule, every race and sprint result)
  and caches it in `cache/<year>.json` (20 min for a season in progress, a week
  once finished). The points tables are derived from the season's own results
  (mode per position), so older scoring systems come out right.
- `src/engine.ts` is the pure arithmetic: completed standings with FIA countback,
  a scenario (a full finishing order per remaining session + DNF flags),
  projection step by step, clinch detection, and the scenario-independent
  "who can still win" picture.
- The React UI holds a board of up to 8 contenders (colour slot sticks to the
  driver), a preset bar, the per-session grid, projected standings, and a
  cumulative-points chart.
