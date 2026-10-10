// f1-champ-sandbox server: serves the built SPA from ./dist and exposes
// GET /api/season/:year — one compact JSON of schedule + every race and sprint
// result, assembled from the Jolpica API (the Ergast successor) and cached on
// disk so a reload never re-hits their rate limit. Runs behind nginx at
// jimmcgowen.com/f1-champ-sandbox/ (trailing-slash proxy_pass strips the prefix).
import { join, normalize, extname } from "path";
import { mkdir } from "node:fs/promises";
import type { Season, Driver, Constructor, Race, Result } from "./src/types";

const PORT = Number(process.env.PORT) || 58009;
const ROOT = join(import.meta.dir, "dist");
const CACHE_DIR = join(import.meta.dir, "cache");
const JOLPICA = "https://api.jolpi.ca/ergast/f1";

// A season still in progress refreshes every 20 minutes; a finished one weekly.
const TTL_CURRENT_MS = 20 * 60 * 1000;
const TTL_PAST_MS = 7 * 24 * 60 * 60 * 1000;

const STANDARD_RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const STANDARD_SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

// ---------- Jolpica fetching ----------

type MRData = {
  MRData: {
    total: string;
    RaceTable?: { Races: JRace[] };
  };
};

type JDriver = {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
};

type JConstructor = { constructorId: string; name: string };

type JResult = {
  position: string;
  positionText: string;
  points: string;
  status: string;
  Driver: JDriver;
  Constructor: JConstructor;
};

type JRace = {
  round: string;
  raceName: string;
  date: string;
  Circuit: { Location: { country: string; locality: string } };
  Sprint?: unknown;
  Results?: JResult[];
  SprintResults?: JResult[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jget(path: string): Promise<MRData> {
  const url = `${JOLPICA}${path}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Jolpica ${res.status} for ${path}`);
    }
    return (await res.json()) as MRData;
  }
  throw new Error(`Jolpica rate-limited for ${path}`);
}

/** Jolpica pages result rows (max 100 per call), splitting a race across pages. */
async function allRaces(path: string): Promise<JRace[]> {
  const byRound = new Map<string, JRace>();
  const limit = 100;
  let offset = 0;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await jget(`${path}${sep}limit=${limit}&offset=${offset}`);
    const races = data.MRData.RaceTable?.Races ?? [];
    for (const r of races) {
      const have = byRound.get(r.round);
      if (!have) {
        byRound.set(r.round, r);
      } else {
        have.Results = [...(have.Results ?? []), ...(r.Results ?? [])];
        have.SprintResults = [...(have.SprintResults ?? []), ...(r.SprintResults ?? [])];
      }
    }
    offset += limit;
    if (offset >= Number(data.MRData.total)) {
      break;
    }
    await sleep(300);
  }
  return [...byRound.values()];
}

// ---------- Season assembly ----------

function toResult(r: JResult): Result {
  const pos = /^\d+$/.test(r.positionText) ? Number(r.positionText) : null;
  return {
    driverId: r.Driver.driverId,
    constructorId: r.Constructor.constructorId,
    position: pos,
    points: Number(r.points) || 0,
    status: r.status,
  };
}

function shortName(raceName: string): string {
  return raceName.replace(/\s+Grand Prix.*$/i, "").trim();
}

/** Most common points value per classified position across the season's results. */
function derivePoints(lists: Result[][], fallback: number[]): number[] {
  const tallies: Map<number, number>[] = [];
  for (const list of lists) {
    for (const r of list) {
      if (r.position === null) {
        continue;
      }
      const t = tallies[r.position - 1] ?? (tallies[r.position - 1] = new Map());
      t.set(r.points, (t.get(r.points) ?? 0) + 1);
    }
  }
  if (tallies.length === 0) {
    return fallback;
  }
  const out: number[] = [];
  for (let i = 0; i < tallies.length; i++) {
    const t = tallies[i];
    let best = 0;
    let bestN = -1;
    if (t) {
      for (const [pts, n] of t) {
        if (n > bestN) {
          best = pts;
          bestN = n;
        }
      }
    }
    out.push(best);
  }
  while (out.length > 0 && out[out.length - 1] === 0) {
    out.pop();
  }
  return out.length > 0 ? out : fallback;
}

function driverCode(d: JDriver): string {
  return d.code ?? d.familyName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

async function buildSeason(year: number): Promise<Season> {
  const schedule = (await jget(`/${year}.json?limit=100`)).MRData.RaceTable?.Races ?? [];
  if (schedule.length === 0) {
    throw Object.assign(new Error(`No schedule published for ${year}`), { status: 404 });
  }
  await sleep(300);
  const results = await allRaces(`/${year}/results.json`);
  await sleep(300);
  const sprints = await allRaces(`/${year}/sprint.json`);

  const resultsByRound = new Map(results.map((r) => [r.round, r.Results ?? []]));
  const sprintsByRound = new Map(sprints.map((r) => [r.round, r.SprintResults ?? []]));

  const drivers = new Map<string, Driver>();
  const constructors = new Map<string, Constructor>();
  const noteEntrants = (list: JResult[]) => {
    for (const r of list) {
      constructors.set(r.Constructor.constructorId, {
        id: r.Constructor.constructorId,
        name: r.Constructor.name,
      });
      // Later rounds overwrite earlier, so constructorId ends up as the latest team.
      drivers.set(r.Driver.driverId, {
        id: r.Driver.driverId,
        code: driverCode(r.Driver),
        name: `${r.Driver.givenName} ${r.Driver.familyName}`,
        familyName: r.Driver.familyName,
        number: r.Driver.permanentNumber ?? "",
        constructorId: r.Constructor.constructorId,
        active: false,
      });
    }
  };

  const races: Race[] = [];
  for (const j of schedule.sort((a, b) => Number(a.round) - Number(b.round))) {
    const race: Race = {
      round: Number(j.round),
      name: j.raceName,
      short: shortName(j.raceName),
      date: j.date,
      country: j.Circuit.Location.country,
      hasSprint: j.Sprint !== undefined || sprintsByRound.has(j.round),
    };
    const sr = sprintsByRound.get(j.round);
    if (sr && sr.length > 0) {
      noteEntrants(sr);
      race.sprintResult = sr.map(toResult);
    }
    const rr = resultsByRound.get(j.round);
    if (rr && rr.length > 0) {
      noteEntrants(rr);
      race.result = rr.map(toResult);
    }
    races.push(race);
  }

  // The grid for what remains = whoever entered the most recent race.
  const lastRun = [...races].reverse().find((r) => r.result);
  let gridSource: Season["gridSource"] = "season";
  if (lastRun) {
    for (const r of lastRun.result ?? []) {
      const d = drivers.get(r.driverId);
      if (d) {
        d.active = true;
      }
    }
  } else {
    // Nothing has run yet: borrow last season's final grid so the whole-season
    // what-if still has drivers to place.
    const prev = await buildSeason(year - 1);
    for (const d of prev.drivers.filter((x) => x.active)) {
      drivers.set(d.id, { ...d });
    }
    for (const c of prev.constructors) {
      constructors.set(c.id, c);
    }
    gridSource = "previous";
  }

  const raceLists = races.flatMap((r) => (r.result ? [r.result] : []));
  const sprintLists = races.flatMap((r) => (r.sprintResult ? [r.sprintResult] : []));

  return {
    year,
    fetchedAt: new Date().toISOString(),
    drivers: [...drivers.values()],
    constructors: [...constructors.values()],
    races,
    points: {
      race: derivePoints(raceLists, STANDARD_RACE_POINTS),
      sprint: derivePoints(sprintLists, STANDARD_SPRINT_POINTS),
    },
    gridSource,
  };
}

// ---------- Cache ----------

const memory = new Map<number, Season>();
const inflight = new Map<number, Promise<Season>>();

function isFresh(s: Season): boolean {
  const age = Date.now() - Date.parse(s.fetchedAt);
  const finished = s.races.length > 0 && s.races.every((r) => r.result);
  const ttl = s.year < new Date().getUTCFullYear() || finished ? TTL_PAST_MS : TTL_CURRENT_MS;
  return age < ttl;
}

async function readDisk(year: number): Promise<Season | null> {
  const f = Bun.file(join(CACHE_DIR, `${year}.json`));
  if (!(await f.exists())) {
    return null;
  }
  try {
    return (await f.json()) as Season;
  } catch {
    return null;
  }
}

async function getSeason(year: number): Promise<Season> {
  const cached = memory.get(year) ?? (await readDisk(year));
  if (cached) {
    memory.set(year, cached);
    if (isFresh(cached)) {
      return cached;
    }
  }
  let p = inflight.get(year);
  if (!p) {
    p = buildSeason(year)
      .then(async (s) => {
        memory.set(year, s);
        await mkdir(CACHE_DIR, { recursive: true });
        await Bun.write(join(CACHE_DIR, `${year}.json`), JSON.stringify(s));
        return s;
      })
      .finally(() => inflight.delete(year));
    inflight.set(year, p);
  }
  try {
    return await p;
  } catch (err) {
    if (cached) {
      console.error(`refresh of ${year} failed, serving stale:`, err);
      return cached;
    }
    throw err;
  }
}

// ---------- HTTP ----------

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function json(body: unknown, status = 200, cache = "no-cache"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": TYPES[".json"], "cache-control": cache },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname);

    const m = path.match(/^\/api\/season\/(\d{4})$/);
    if (m) {
      const year = Number(m[1]);
      if (year < 1950 || year > new Date().getUTCFullYear() + 1) {
        return json({ error: `Season ${year} is out of range` }, 400);
      }
      try {
        const season = await getSeason(year);
        return json(season, 200, "public, max-age=300");
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502;
        return json({ error: (err as Error).message }, status);
      }
    }
    if (path.startsWith("/api/")) {
      return json({ error: "Not found" }, 404);
    }

    const file = path === "/" ? "/index.html" : path;
    const resolved = normalize(join(ROOT, file));
    if (!resolved.startsWith(ROOT)) {
      return new Response("Forbidden", { status: 403 });
    }
    const f = Bun.file(resolved);
    if (await f.exists()) {
      const immutable = resolved.includes("/assets/");
      return new Response(f, {
        headers: {
          "content-type": TYPES[extname(resolved)] ?? "application/octet-stream",
          "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
        },
      });
    }
    return new Response(Bun.file(join(ROOT, "index.html")), {
      headers: { "content-type": TYPES[".html"], "cache-control": "no-cache" },
    });
  },
});

console.log(`f1-champ-sandbox serving ./dist + /api on http://localhost:${PORT}`);
