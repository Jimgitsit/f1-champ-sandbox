import { useState } from "react";
import type { Season } from "../types";
import type { Baseline, Scenario, Session } from "../engine";
import { emptyScenario, placeRelative, setPosition } from "../engine";

type Props = {
  season: Season;
  rest: Session[];
  scenario: Scenario;
  baseline: string[];
  baselineKind: Baseline;
  columns: string[];
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
  onScenario,
  onBaseline,
}: Props) {
  const active = season.drivers.filter((d) => d.active);
  const [driver, setDriver] = useState(columns[0] ?? active[0]?.id ?? "");
  const [rival, setRival] = useState(columns[1] ?? active[1]?.id ?? "");
  const [racesOnly, setRacesOnly] = useState(false);
  const who = active.find((d) => d.id === driver) ?? active[0];
  const chosen = who?.id ?? "";

  const targets = racesOnly ? rest.filter((s) => s.kind === "race") : rest;
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
          <button onClick={() => everywhere(1)}>wins every {racesOnly ? "race" : "session"}</button>
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
      <div className="preset-row quiet">
        <label className="check">
          <input type="checkbox" checked={racesOnly} onChange={(e) => setRacesOnly(e.target.checked)} />
          Grands Prix only, leave sprints alone
        </label>
        <label className="field">
          <span>Untouched sessions finish in</span>
          <select value={baselineKind} onChange={(e) => onBaseline(e.target.value as Baseline)}>
            <option value="standings">current championship order</option>
            <option value="lastRace">the last race’s order</option>
            <option value="average">season-average finishing order</option>
          </select>
        </label>
        <button className="link" disabled={touched === 0} onClick={() => onScenario(emptyScenario())}>
          Clear scenario{touched > 0 ? ` (${touched} session${touched === 1 ? "" : "s"} set)` : ""}
        </button>
      </div>
    </div>
  );
}
