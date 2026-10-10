import { useState } from "react";
import type { Season } from "../types";
import type { Baseline, Mode, Path, Scenario, Session } from "../engine";
import { easiestPath, emptyScenario, placeRelative, setPosition } from "../engine";

type Props = {
  season: Season;
  rest: Session[];
  scenario: Scenario;
  baseline: string[];
  baselineKind: Baseline;
  mode: Mode;
  onScenario: (s: Scenario) => void;
  onBaseline: (b: Baseline) => void;
};

type Tool = "presets" | "path";

type Rule = { driver: string; action: string };

const MAX_RULES = 5;

const ACTIONS: { value: string; label: string }[] = [
  { value: "p1", label: "wins every session" },
  { value: "p1-finale-dnf", label: "wins all but the finale, retiring there" },
  { value: "p2", label: "finishes 2nd everywhere" },
  { value: "p3", label: "finishes 3rd everywhere" },
  { value: "p4", label: "finishes 4th everywhere" },
  { value: "p5", label: "finishes 5th everywhere" },
  { value: "dnf", label: "retires from the rest" },
  { value: "behind", label: "is right behind the driver above each time" },
  { value: "ahead", label: "is right ahead of the driver above each time" },
];

const emptyRule = (): Rule => ({ driver: "", action: "" });

/** Rules apply in order, each on top of the last, from a clean scenario. */
function applyRules(rules: Rule[], rest: Session[], baseline: string[]): Scenario {
  let sc = emptyScenario();
  let above: string | null = null;
  const finale = rest[rest.length - 1];
  for (const rule of rules) {
    if (!rule.driver) {
      continue;
    }
    const d = rule.driver;
    const place = (position: number | "dnf", exceptFinale = false) => {
      for (const s of rest) {
        const p = exceptFinale && s.key === finale?.key ? "dnf" : position;
        sc = setPosition(sc, s.key, baseline, d, p);
      }
    };
    switch (rule.action) {
      case "p1":
        place(1);
        break;
      case "p1-finale-dnf":
        place(1, true);
        break;
      case "p2":
      case "p3":
      case "p4":
      case "p5":
        place(Number(rule.action.slice(1)));
        break;
      case "dnf":
        place("dnf");
        break;
      case "behind":
      case "ahead":
        if (above && above !== d) {
          for (const s of rest) {
            sc = placeRelative(sc, s.key, baseline, above, d, rule.action);
          }
        }
        break;
      default:
        break;
    }
    above = d;
  }
  return sc;
}

export default function Presets({
  season,
  rest,
  scenario,
  baseline,
  baselineKind,
  mode,
  onScenario,
  onBaseline,
}: Props) {
  const active = season.drivers.filter((d) => d.active);
  const [tool, setTool] = useState<Tool>("presets");
  const [rules, setRules] = useState<Rule[]>([emptyRule()]);
  const [pathDriver, setPathDriver] = useState("");
  const [path, setPath] = useState<Path | null>(null);

  const touched = Object.keys(scenario.orders).length;

  const entityOf = (driverId: string) =>
    mode === "drivers" ? driverId : active.find((d) => d.id === driverId)?.constructorId ?? driverId;
  const entityName = (id: string) =>
    mode === "drivers"
      ? season.drivers.find((d) => d.id === id)?.familyName ?? id
      : season.constructors.find((c) => c.id === id)?.name ?? id;

  const updateRules = (next: Rule[]) => {
    setRules(next);
    onScenario(applyRules(next, rest, baseline));
  };

  const changeRule = (i: number, patch: Partial<Rule>) => {
    updateRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const removeRule = (i: number) => {
    const next = rules.filter((_, j) => j !== i);
    updateRules(next.length > 0 ? next : [emptyRule()]);
  };

  const choosePathDriver = (driverId: string) => {
    setPathDriver(driverId);
    if (!driverId) {
      setPath(null);
      onScenario(emptyScenario());
      return;
    }
    const p = easiestPath(season, mode, entityOf(driverId), baseline);
    setPath(p);
    onScenario(p.scenario);
  };

  const clear = () => {
    setRules([emptyRule()]);
    setPathDriver("");
    setPath(null);
    onScenario(emptyScenario());
  };

  const switchTool = (t: Tool) => {
    if (t !== tool) {
      setTool(t);
      clear();
    }
  };

  if (rest.length === 0) {
    return (
      <div className="presets done">
        <p>
          Every session of {season.year} has run, so there is nothing left to vary. Pick a season in
          progress to build scenarios.
        </p>
      </div>
    );
  }

  const driverOptions = (
    <>
      <option value="">a driver…</option>
      {active.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </>
  );

  return (
    <div className="presets">
      <div className="segmented small" role="group" aria-label="How to build the scenario">
        <button className={tool === "presets" ? "on" : ""} onClick={() => switchTool("presets")}>
          Presets
        </button>
        <button className={tool === "path" ? "on" : ""} onClick={() => switchTool("path")}>
          Easiest path
        </button>
      </div>

      {tool === "presets" && (
        <div className="rules">
          {rules.map((rule, i) => (
            <div className="preset-row rule" key={i}>
              <label className="field">
                <span>{i === 0 ? "If" : "and"}</span>
                <select value={rule.driver} onChange={(e) => changeRule(i, { driver: e.target.value })}>
                  {driverOptions}
                </select>
              </label>
              <label className="field">
                <select
                  value={rule.action}
                  aria-label="does what"
                  onChange={(e) => changeRule(i, { action: e.target.value })}
                >
                  <option value="">does…</option>
                  {ACTIONS.filter((a) => i > 0 || (a.value !== "behind" && a.value !== "ahead")).map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              {(rules.length > 1 || rule.driver || rule.action) && (
                <button className="remove" onClick={() => removeRule(i)} aria-label="Remove this line">
                  ×
                </button>
              )}
            </div>
          ))}
          {rules.length < MAX_RULES && (
            <button className="link add" onClick={() => setRules([...rules, emptyRule()])}>
              + add another
            </button>
          )}
        </div>
      )}

      {tool === "path" && (
        <div className="rules">
          <div className="preset-row">
            <label className="field">
              <span>Easiest path for</span>
              <select value={pathDriver} onChange={(e) => choosePathDriver(e.target.value)}>
                {driverOptions}
              </select>
            </label>
            {mode === "constructors" && pathDriver && (
              <span className="hint-inline">solved for {entityName(entityOf(pathDriver))}</span>
            )}
          </div>
          {path && (
            <p className="path">{describePath(path, entityOf(pathDriver), entityName, mode === "drivers" ? 1 : 2)}</p>
          )}
        </div>
      )}

      <div className="preset-row quiet">
        <label className="field">
          <span>Untouched sessions finish in</span>
          <select value={baselineKind} onChange={(e) => onBaseline(e.target.value as Baseline)}>
            <option value="standings">current championship order</option>
            <option value="lastRace">the last race’s order</option>
            <option value="average">season-average finishing order</option>
          </select>
        </label>
        <button className="link" disabled={touched === 0} onClick={clear}>
          Clear scenario{touched > 0 ? ` (${touched} session${touched === 1 ? "" : "s"} set)` : ""}
        </button>
      </div>
    </div>
  );
}

const ordinal = (n: number) => {
  const r = n % 100;
  const suffix = r >= 11 && r <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
};

const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

function describePath(path: Path, entity: string, name: (id: string) => string, k: number): string {
  const me = name(entity);
  const block = (p: number) => (k === 1 ? ordinal(p) : `${ordinal(p)} and ${ordinal(p + 1)}`);
  const holds = path.held.map((h) =>
    h.position === "dnf"
      ? `${name(h.id)} scores nothing`
      : `${name(h.id)} finishes no higher than ${block(h.position)}`,
  );
  if (path.outcome === "wins") {
    if (path.own > 1) {
      return `${me} can finish ${block(path.own)} in every remaining session and still take the title, even with the strongest rivals ahead each time.`;
    }
    if (holds.length === 0) {
      return `${me} wins every remaining session and takes the title with everyone else in championship order behind.`;
    }
    return `${me} wins every remaining session, and ${list(holds)}. That is the least it takes.`;
  }
  const out = path.uncatchable.map(name);
  const reach = out.length > 0 ? ` ${list(out)} ${out.length === 1 ? "is" : "are"} already out of reach.` : "";
  const effort = holds.length > 0 ? `Winning everything while ${list(holds)}` : "Winning everything";
  return `${me} can’t win the title.${reach} ${effort} gets ${me} to ${ordinal(path.finish)}.`;
}
