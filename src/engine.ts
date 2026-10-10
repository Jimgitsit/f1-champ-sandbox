// Pure championship arithmetic. No React, no fetch — everything here is a
// function of a Season plus a Scenario, so it can be unit-tested and reused.
import type { Season, Result } from "./types";

export type SessionKind = "race" | "sprint";

export type Session = {
  key: string;
  round: number;
  kind: SessionKind;
  /** "Singapore Sprint" / "Singapore Grand Prix" */
  label: string;
  short: string;
  date: string;
  done: boolean;
  result?: Result[];
};

export type Mode = "drivers" | "constructors";

/** Points plus a per-position finish count (index 0 = wins) for countback ties. */
export type Tally = {
  points: number;
  finishes: number[];
};

export type Table = Map<string, Tally>;

export type Tables = { drivers: Table; constructors: Table };

/** The user's what-if: a finishing order per remaining session, DNFs flagged. */
export type Scenario = {
  orders: Record<string, string[]>;
  dnf: Record<string, string[]>;
};

export const emptyScenario = (): Scenario => ({ orders: {}, dnf: {} });

export type Baseline = "standings" | "lastRace" | "average";

export function sessions(season: Season): Session[] {
  const out: Session[] = [];
  for (const r of season.races) {
    if (r.hasSprint) {
      out.push({
        key: `${r.round}s`,
        round: r.round,
        kind: "sprint",
        label: `${r.short} Sprint`,
        short: r.short,
        date: r.date,
        done: !!r.sprintResult,
        result: r.sprintResult,
      });
    }
    out.push({
      key: `${r.round}r`,
      round: r.round,
      kind: "race",
      label: r.name,
      short: r.short,
      date: r.date,
      done: !!r.result,
      result: r.result,
    });
  }
  return out;
}

export const remaining = (season: Season): Session[] => sessions(season).filter((s) => !s.done);

export function pointsTable(season: Season, kind: SessionKind): number[] {
  return kind === "sprint" ? season.points.sprint : season.points.race;
}

/** Best points one driver can take from a session; for constructors, the best two. */
export function maxPoints(season: Season, kind: SessionKind, mode: Mode): number {
  const t = pointsTable(season, kind);
  return mode === "drivers" ? t[0] ?? 0 : (t[0] ?? 0) + (t[1] ?? 0);
}

const tally = (table: Table, id: string): Tally => {
  let t = table.get(id);
  if (!t) {
    t = { points: 0, finishes: [] };
    table.set(id, t);
  }
  return t;
};

function addFinish(table: Table, id: string, position: number | null, points: number, countback: boolean): void {
  const t = tally(table, id);
  t.points += points;
  if (countback && position !== null) {
    t.finishes[position - 1] = (t.finishes[position - 1] ?? 0) + 1;
  }
}

export function cloneTables(t: Tables): Tables {
  const copy = (m: Table): Table =>
    new Map([...m].map(([k, v]) => [k, { points: v.points, finishes: [...v.finishes] }]));
  return { drivers: copy(t.drivers), constructors: copy(t.constructors) };
}

/** Standings from the sessions that have actually run. */
export function completedTables(season: Season): Tables {
  const tables: Tables = { drivers: new Map(), constructors: new Map() };
  for (const d of season.drivers) {
    tally(tables.drivers, d.id);
  }
  for (const c of season.constructors) {
    tally(tables.constructors, c.id);
  }
  for (const s of sessions(season)) {
    if (!s.result) {
      continue;
    }
    for (const r of s.result) {
      // Countback uses Grand Prix classifications only, not sprints.
      addFinish(tables.drivers, r.driverId, r.position, r.points, s.kind === "race");
      addFinish(tables.constructors, r.constructorId, r.position, r.points, s.kind === "race");
    }
  }
  return tables;
}

/** Apply one hypothetical session result in place. */
export function applyOrder(
  tables: Tables,
  season: Season,
  session: Session,
  order: string[],
  dnf: string[],
): void {
  const pts = pointsTable(season, session.kind);
  const team = new Map(season.drivers.map((d) => [d.id, d.constructorId]));
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const out = dnf.includes(id);
    const position = out ? null : i + 1;
    const points = out ? 0 : pts[i] ?? 0;
    addFinish(tables.drivers, id, position, points, session.kind === "race");
    const c = team.get(id);
    if (c) {
      addFinish(tables.constructors, c, position, points, session.kind === "race");
    }
  }
}

/** Most points, then most wins, most seconds, ... (the FIA countback). */
export function compareTally(a: Tally, b: Tally): number {
  if (a.points !== b.points) {
    return b.points - a.points;
  }
  const n = Math.max(a.finishes.length, b.finishes.length);
  for (let i = 0; i < n; i++) {
    const d = (b.finishes[i] ?? 0) - (a.finishes[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

export function rank(table: Table): string[] {
  return [...table.keys()].sort((x, y) => {
    const c = compareTally(table.get(x)!, table.get(y)!);
    return c !== 0 ? c : x.localeCompare(y);
  });
}

// ---------- Baseline orders for untouched sessions ----------

export function baselineOrder(season: Season, tables: Tables, kind: Baseline): string[] {
  const active = season.drivers.filter((d) => d.active).map((d) => d.id);
  const activeSet = new Set(active);
  const byStandings = rank(tables.drivers).filter((id) => activeSet.has(id));
  if (kind === "standings") {
    return withStragglers(byStandings, active);
  }
  if (kind === "lastRace") {
    const last = [...season.races].reverse().find((r) => r.result);
    if (!last) {
      return withStragglers(byStandings, active);
    }
    const order = [...(last.result ?? [])]
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
      .map((r) => r.driverId)
      .filter((id) => activeSet.has(id));
    return withStragglers(order, active);
  }
  // Season-average finishing position (unclassified counts as last).
  const sum = new Map<string, number>();
  const n = new Map<string, number>();
  for (const r of season.races) {
    if (!r.result) {
      continue;
    }
    const field = r.result.length;
    for (const x of r.result) {
      sum.set(x.driverId, (sum.get(x.driverId) ?? 0) + (x.position ?? field));
      n.set(x.driverId, (n.get(x.driverId) ?? 0) + 1);
    }
  }
  const avg = (id: string) => (n.get(id) ? sum.get(id)! / n.get(id)! : 99);
  const order = [...active].sort((a, b) => avg(a) - avg(b) || byStandings.indexOf(a) - byStandings.indexOf(b));
  return order;
}

function withStragglers(order: string[], active: string[]): string[] {
  const seen = new Set(order);
  return [...order, ...active.filter((id) => !seen.has(id))];
}

// ---------- Scenario editing ----------

export function orderFor(scenario: Scenario, key: string, baseline: string[]): string[] {
  return scenario.orders[key] ?? baseline;
}

export function positionOf(scenario: Scenario, key: string, baseline: string[], driverId: string): number | "dnf" {
  if (scenario.dnf[key]?.includes(driverId)) {
    return "dnf";
  }
  return orderFor(scenario, key, baseline).indexOf(driverId) + 1;
}

/** Place a driver at a position (others shift) or mark them DNF (sent to the back). */
export function setPosition(
  scenario: Scenario,
  key: string,
  baseline: string[],
  driverId: string,
  position: number | "dnf",
): Scenario {
  const order = orderFor(scenario, key, baseline).filter((id) => id !== driverId);
  const dnf = (scenario.dnf[key] ?? []).filter((id) => id !== driverId);
  if (position === "dnf") {
    order.push(driverId);
    dnf.push(driverId);
  } else {
    // Classified finishers sit ahead of every DNF.
    const firstDnf = order.findIndex((id) => dnf.includes(id));
    const cap = firstDnf === -1 ? order.length : firstDnf;
    order.splice(Math.max(0, Math.min(position - 1, cap)), 0, driverId);
  }
  return {
    orders: { ...scenario.orders, [key]: order },
    dnf: { ...scenario.dnf, [key]: dnf },
  };
}

/** Put `other` immediately ahead of or behind `driverId`. */
export function placeRelative(
  scenario: Scenario,
  key: string,
  baseline: string[],
  driverId: string,
  other: string,
  where: "ahead" | "behind",
): Scenario {
  const p = positionOf(scenario, key, baseline, driverId);
  if (p === "dnf") {
    return setPosition(scenario, key, baseline, other, where === "behind" ? "dnf" : orderFor(scenario, key, baseline).length);
  }
  return setPosition(scenario, key, baseline, other, where === "ahead" ? p : p + 1);
}

// ---------- Projection ----------

export type Step = {
  session: Session;
  tables: Tables;
};

export type Projection = {
  steps: Step[];
  final: Tables;
  /** Session key at which the leader became uncatchable, per championship. */
  clinch: Record<Mode, string | null>;
};

export function project(season: Season, scenario: Scenario, baseline: string[]): Projection {
  const rest = remaining(season);
  const tables = completedTables(season);
  const steps: Step[] = [];
  const clinch: Record<Mode, string | null> = { drivers: null, constructors: null };

  const maxAfter = (i: number, mode: Mode) =>
    rest.slice(i + 1).reduce((acc, s) => acc + maxPoints(season, s.kind, mode), 0);

  const checkClinch = (i: number, snapshot: Tables) => {
    for (const mode of ["drivers", "constructors"] as Mode[]) {
      if (clinch[mode] !== null) {
        continue;
      }
      const table = snapshot[mode];
      const order = rank(table);
      if (order.length < 2) {
        continue;
      }
      const lead = table.get(order[0])!.points;
      const chaser = table.get(order[1])!.points;
      if (lead > chaser + maxAfter(i, mode)) {
        clinch[mode] = rest[i].key;
      }
    }
  };

  for (let i = 0; i < rest.length; i++) {
    const s = rest[i];
    applyOrder(tables, season, s, orderFor(scenario, s.key, baseline), scenario.dnf[s.key] ?? []);
    const snapshot = cloneTables(tables);
    steps.push({ session: s, tables: snapshot });
    checkClinch(i, snapshot);
  }
  return { steps, final: tables, clinch };
}

// ---------- Title picture as of today (scenario-independent) ----------

export type Status = {
  id: string;
  points: number;
  maxPossible: number;
  state: "clinched" | "alive" | "eliminated";
  /** Points the leader is ahead by (0 for the leader). */
  gap: number;
};

export function titlePicture(season: Season, tables: Tables, mode: Mode): Status[] {
  const rest = remaining(season);
  const remainingMax = rest.reduce((acc, s) => acc + maxPoints(season, s.kind, mode), 0);
  const table = tables[mode];
  const order = rank(table);
  const leaderPts = order.length > 0 ? table.get(order[0])!.points : 0;
  const runnerUpMax = order.length > 1 ? table.get(order[1])!.points + remainingMax : -1;
  return order.map((id, i) => {
    const points = table.get(id)!.points;
    const maxPossible = points + remainingMax;
    let state: Status["state"] = "alive";
    if (i === 0 && leaderPts > runnerUpMax) {
      state = "clinched";
    } else if (maxPossible < leaderPts) {
      state = "eliminated";
    }
    return { id, points, maxPossible, state, gap: leaderPts - points };
  });
}
