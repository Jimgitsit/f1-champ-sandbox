import { describe, expect, test } from "bun:test";
import type { Season } from "./types";
import {
  completedTables,
  rank,
  project,
  titlePicture,
  setPosition,
  placeRelative,
  positionOf,
  baselineOrder,
  emptyScenario,
  remaining,
  easiestPath,
  layoutOrder,
} from "./engine";

// Three-driver, two-team toy season: round 1 done, round 2 (with sprint) and
// round 3 to go.
function toy(): Season {
  return {
    year: 2030,
    fetchedAt: new Date().toISOString(),
    gridSource: "season",
    drivers: [
      { id: "a", code: "AAA", name: "A", familyName: "A", number: "1", constructorId: "t1", active: true },
      { id: "b", code: "BBB", name: "B", familyName: "B", number: "2", constructorId: "t1", active: true },
      { id: "c", code: "CCC", name: "C", familyName: "C", number: "3", constructorId: "t2", active: true },
    ],
    constructors: [
      { id: "t1", name: "Team 1" },
      { id: "t2", name: "Team 2" },
    ],
    points: { race: [25, 18, 15], sprint: [8, 7, 6] },
    races: [
      {
        round: 1,
        name: "One Grand Prix",
        short: "One",
        date: "2030-03-01",
        country: "X",
        hasSprint: false,
        result: [
          { driverId: "a", constructorId: "t1", position: 1, points: 25, status: "Finished" },
          { driverId: "c", constructorId: "t2", position: 2, points: 18, status: "Finished" },
          { driverId: "b", constructorId: "t1", position: null, points: 0, status: "Retired" },
        ],
      },
      { round: 2, name: "Two Grand Prix", short: "Two", date: "2030-03-08", country: "X", hasSprint: true },
      { round: 3, name: "Three Grand Prix", short: "Three", date: "2030-03-15", country: "X", hasSprint: false },
    ],
  };
}

describe("completed standings", () => {
  test("sums points for drivers and constructors", () => {
    const t = completedTables(toy());
    expect(t.drivers.get("a")!.points).toBe(25);
    expect(t.drivers.get("c")!.points).toBe(18);
    expect(t.drivers.get("b")!.points).toBe(0);
    expect(t.constructors.get("t1")!.points).toBe(25);
    expect(rank(t.drivers)).toEqual(["a", "c", "b"]);
  });

  test("countback breaks points ties by best finishes", () => {
    const s = toy();
    s.races[1].result = [
      { driverId: "c", constructorId: "t2", position: 1, points: 25, status: "Finished" },
      { driverId: "b", constructorId: "t1", position: 2, points: 18, status: "Finished" },
      { driverId: "a", constructorId: "t1", position: 3, points: 15, status: "Finished" },
    ];
    // a: 40 (1 win), c: 43, b: 18. Make a and c equal: give c 3 fewer.
    s.races[1].result![0].points = 22;
    const t = completedTables(s);
    expect(t.drivers.get("a")!.points).toBe(40);
    expect(t.drivers.get("c")!.points).toBe(40);
    // both have one win; c has a 2nd, a has a 3rd → c ahead
    expect(rank(t.drivers)).toEqual(["c", "a", "b"]);
  });
});

describe("remaining sessions and projection", () => {
  test("lists sprint before race for a sprint weekend", () => {
    expect(remaining(toy()).map((s) => s.key)).toEqual(["2s", "2r", "3r"]);
  });

  test("baseline standings order fills every untouched session", () => {
    const s = toy();
    const t = completedTables(s);
    const base = baselineOrder(s, t, "standings");
    expect(base).toEqual(["a", "c", "b"]);
    const p = project(s, emptyScenario(), base);
    // a wins sprint (8) + two races (50) → 83
    expect(p.final.drivers.get("a")!.points).toBe(83);
    expect(p.final.constructors.get("t1")!.points).toBe(25 + 8 + 6 + 25 + 15 + 25 + 15);
  });

  test("setPosition shifts others and DNF sits at the back with zero points", () => {
    const s = toy();
    const base = ["a", "c", "b"];
    let sc = setPosition(emptyScenario(), "3r", base, "b", 1);
    expect(sc.orders["3r"]).toEqual(["b", "a", "c"]);
    sc = setPosition(sc, "3r", base, "a", "dnf");
    expect(sc.orders["3r"]).toEqual(["b", "c", "a"]);
    expect(positionOf(sc, "3r", base, "a")).toBe("dnf");
    // placing someone "last" never goes behind a DNF
    sc = setPosition(sc, "3r", base, "c", 3);
    expect(sc.orders["3r"]).toEqual(["b", "c", "a"]);
    const p = project(s, sc, base);
    const r3 = p.steps[2].tables.drivers;
    expect(r3.get("a")!.points).toBe(25 + 8 + 25);
  });

  test("placeRelative puts the rival directly behind", () => {
    const base = ["a", "c", "b"];
    let sc = setPosition(emptyScenario(), "3r", base, "b", 1);
    sc = placeRelative(sc, "3r", base, "b", "a", "behind");
    expect(sc.orders["3r"]).toEqual(["b", "a", "c"]);
    sc = placeRelative(sc, "3r", base, "b", "c", "ahead");
    expect(sc.orders["3r"]).toEqual(["c", "b", "a"]);
  });

  test("clinch is detected at the first session the lead is uncatchable", () => {
    const s = toy();
    const base = ["a", "c", "b"];
    const p = project(s, emptyScenario(), base);
    // after 2s: a 33, c 25 → 8 lead, 50 left: no. after 2r: a 58, c 43 → 15 lead, 25 left: no.
    // after 3r: a 83 → clinched at the finale.
    expect(p.clinch.drivers).toBe("3r");
    // Give a huge lead: a wins round 2 race while c DNFs → a 58, c 25, 25 left: no (33 > 25 yes!)
    let sc = setPosition(emptyScenario(), "2r", base, "c", "dnf");
    const p2 = project(s, sc, base);
    expect(p2.clinch.drivers).toBe("2r");
  });
});

describe("title picture", () => {
  test("marks eliminated drivers and the leader's clinch", () => {
    const s = toy();
    const t = completedTables(s);
    const st = titlePicture(s, t, "drivers");
    // 58 points left; nobody is out yet
    expect(st.map((x) => x.state)).toEqual(["alive", "alive", "alive"]);
    expect(st[0].maxPossible).toBe(25 + 58);
    // Drop the remaining rounds: a has clinched
    s.races.splice(1, 2);
    const st2 = titlePicture(s, completedTables(s), "drivers");
    expect(st2[0].state).toBe("clinched");
    expect(st2[1].state).toBe("eliminated");
  });
});

describe("easiest path", () => {
  test("a leader is told how low they can finish", () => {
    const s = toy();
    const base = ["a", "c", "b"];
    // a leads c by 7 with 58 on the table. Holding P2 every session: a +32 (7+18+18)... c wins all +58:
    // a 57 vs c 76 → no. P1 everywhere is the only way → own = 1.
    const p = easiestPath(s, "drivers", "a", base);
    expect(p.outcome).toBe("wins");
    expect(p.own).toBe(1);
    expect(p.held).toEqual([]);
  });

  test("a chaser gets the rivals held just low enough", () => {
    const s = toy();
    // b has 0, a 25, c 18. b winning all → 58. a must score < 33 over sprint+2 races:
    // P2 everywhere = 7+18+18 = 43 no; P3 = 6+15+15 = 36 no; DNF (only 3 cars) → dnf.
    const base = ["a", "c", "b"];
    const p = easiestPath(s, "drivers", "b", base);
    expect(p.outcome).toBe("wins");
    expect(p.own).toBe(1);
    expect(p.held.find((h) => h.id === "a")?.position).toBe("dnf");
    // c: 18 + 43 (P2) = 61 ≥ 58 no; with a out, P3 collapses to P2 → c must DNF too
    expect(p.held.find((h) => h.id === "c")?.position).toBe("dnf");
    expect(rank(project(s, p.scenario, base).final.drivers)[0]).toBe("b");
  });

  test("an eliminated entity gets its best finish", () => {
    const s = toy();
    s.races.splice(2, 1); // only round 2 (sprint + race, 33 pts) remains
    const base = ["a", "c", "b"];
    const p = easiestPath(s, "drivers", "b", base);
    // b max 33 > a's 25, so b can still pass a if a scores < 8: a DNF both → b wins
    expect(p.outcome).toBe("wins");
    s.races[0].result![0].points = 60; // a has 60 now, out of reach
    const p2 = easiestPath(s, "drivers", "b", base);
    expect(p2.outcome).toBe("best");
    expect(p2.finish).toBe(2);
    expect(p2.uncatchable).toEqual(["a"]);
  });

  test("a team block lands intact when a member starts ahead of it", () => {
    const s = toy();
    const base = ["b", "c", "a"];
    // b starts ahead of a in the baseline; the block must still land as a, b.
    const order = layoutOrder(base, { slots: new Map([["a", 2], ["b", 3]]), dnf: new Set() });
    expect(order).toEqual(["c", "a", "b"]);
    // a slot inside the DNF zone is not a layout
    expect(layoutOrder(base, { slots: new Map([["a", 3]]), dnf: new Set(["c"]) })).toBeNull();
    const p = easiestPath(s, "constructors", "t1", base);
    expect(p.outcome).toBe("wins");
    for (const key of Object.keys(p.scenario.orders)) {
      expect(p.scenario.orders[key].slice(p.own - 1, p.own + 1).sort()).toEqual(["a", "b"]);
    }
  });

  test("works for a team", () => {
    const s = toy();
    const base = ["a", "c", "b"];
    const p = easiestPath(s, "constructors", "t2", base);
    expect(p.outcome).toBe("wins");
    expect(p.own).toBe(1);
  });
});
