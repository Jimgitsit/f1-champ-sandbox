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
  columns: string[];
  mode: Mode;
  onScenario: (s: Scenario) => void;
  onBaseline: (b: Baseline) => void;
};

export default function Presets({
  season,
  rest,
  scenario,
  baseline,
  baselineKind,
  columns,
  mode,
  onScenario,
  onBaseline,
}: Props) {
  const active = season.drivers.filter((d) => d.active);
  const [driver, setDriver] = useState(columns[0] ?? active[0]?.id ?? "");
  const [rival, setRival] = useState(columns[1] ?? active[1]?.id ?? "");
  const who = active.find((d) => d.id === driver) ?? active[0];
  const chosen = who?.id ?? "";

  const targets = rest;
  const finale = rest[rest.length - 1];

  const everywhere = (position: number | "dnf", exceptFinale = false) => {
    let sc = scenario;
    for (const s of targets) {
      const p = exceptFinale && s.key === finale?.key ? "dnf" : position;
      sc = setPosition(sc, s.key, baseline, chosen, p);
    }
    onScenario(sc);
  };

  const rivalRelative = (where: "ahead" | "behind") => {
    let sc = scenario;
    for (const s of targets) {
      sc = placeRelative(sc, s.key, baseline, chosen, rival, where);
    }
    onScenario(sc);
  };

  const touched = Object.keys(scenario.orders).length;
  const [path, setPath] = useState<Path | null>(null);
  const entityOf = (driverId: string) =>
    mode === "drivers" ? driverId : active.find((d) => d.id === driverId)?.constructorId ?? driverId;
  const entityName = (id: string) =>
    mode === "drivers"
      ? season.drivers.find((d) => d.id === id)?.familyName ?? id
      : season.constructors.find((c) => c.id === id)?.name ?? id;
  const findPath = () => {
    const p = easiestPath(season, mode, entityOf(chosen), baseline);
    setPath(p);
    onScenario(p.scenario);
  };
  const clear = () => {
    setPath(null);
    onScenario(emptyScenario());
  };

  if (rest.length === 0) {
    return (
      <div className="presets done">
        <p>Every session of {season.year} has run, so there is nothing left to vary. Pick a season in progress to build scenarios.</p>
      </div>
    );
  }

  return (
    <div className="presets">
      <div className="preset-row">
        <label className="field">
          <span>If</span>
          <select value={chosen} onChange={(e) => setDriver(e.target.value)}>
            {active.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="buttons">
          <button onClick={() => everywhere(1)}>wins every session</button>
          <button onClick={() => everywhere(1, true)}>wins all but the finale, retiring there</button>
          <button onClick={() => everywhere(2)}>finishes 2nd everywhere</button>
          <button onClick={() => everywhere(3)}>finishes 3rd everywhere</button>
          <button onClick={() => everywhere("dnf")}>retires from the rest</button>
        </div>
      </div>
      <div className="preset-row">
        <label className="field">
          <span>and</span>
          <select value={rival} onChange={(e) => setRival(e.target.value)}>
            {active
              .filter((d) => d.id !== chosen)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <div className="buttons">
          <button onClick={() => rivalRelative("behind")}>is right behind each time</button>
          <button onClick={() => rivalRelative("ahead")}>is right ahead each time</button>
        </div>
      </div>
      <div className="preset-row">
        <span className="field"><span>or find the easiest path for</span></span>
        <div className="buttons">
          <button className="primary" onClick={findPath}>
            {who?.familyName ?? "them"}{mode === "constructors" ? `’s team` : ""} to win the title
          </button>
        </div>
      </div>
      {path && (
        <p className="path">
          {describePath(path, entityOf(chosen), entityName, mode === "drivers" ? 1 : 2)}
        </p>
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
