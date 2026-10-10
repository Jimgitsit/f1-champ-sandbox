import { useState } from "react";
import type { Season } from "../types";
import type { Mode, Scenario, Session } from "../engine";
import { orderFor, pointsTable, positionOf, setPosition } from "../engine";
import type { Board } from "../App";
import { MAX_SERIES, seriesVar } from "../palette";

type Props = {
  season: Season;
  rest: Session[];
  scenario: Scenario;
  baseline: string[];
  board: Board;
  mode: Mode;
  onScenario: (s: Scenario) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
};

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function ScenarioGrid({
  season,
  rest,
  scenario,
  baseline,
  board,
  mode,
  onScenario,
  onAdd,
  onRemove,
}: Props) {
  const [picking, setPicking] = useState(false);
  const drivers = new Map(season.drivers.map((d) => [d.id, d]));
  const teams = new Map(season.constructors.map((c) => [c.id, c.name]));
  const gridSize = baseline.length;

  const resetRow = (key: string) => {
    const orders = { ...scenario.orders };
    const dnf = { ...scenario.dnf };
    delete orders[key];
    delete dnf[key];
    onScenario({ orders, dnf });
  };

  if (rest.length === 0) {
    return null;
  }

  const active = season.drivers.filter((d) => d.active);
  const byTeam = new Map<string, typeof active>();
  for (const d of active) {
    const list = byTeam.get(d.constructorId) ?? [];
    list.push(d);
    byTeam.set(d.constructorId, list);
  }

  return (
    <div className="grid-wrap">
      <div className="grid-head">
        <h2>Remaining sessions</h2>
        <button className="link" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
          {picking ? "Done choosing" : `Choose who’s on the board (${board.columns.length}/${MAX_SERIES})`}
        </button>
      </div>
      {picking && (
        <div className="picker">
          {[...byTeam.entries()].map(([teamId, list]) => (
            <div className="picker-team" key={teamId}>
              <span className="picker-team-name">{teams.get(teamId) ?? teamId}</span>
              {list.map((d) => {
                const on = board.columns.includes(d.id);
                const full = !on && board.columns.length >= MAX_SERIES;
                return (
                  <button
                    key={d.id}
                    className={`pick ${on ? "on" : ""}`}
                    disabled={full}
                    onClick={() => (on ? onRemove(d.id) : onAdd(d.id))}
                    style={on ? { borderColor: seriesVar(board.slots[d.id]) } : undefined}
                  >
                    {d.code}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="hint">
            Everyone else still finishes somewhere: the rows are full {gridSize}-car orders, and the
            board just picks whose cells you see.
          </p>
        </div>
      )}
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-session">Session</th>
              {board.columns.map((id) => {
                const d = drivers.get(id);
                return (
                  <th key={id} className="col-driver">
                    <span className="swatch" style={{ background: seriesVar(board.slots[id]) }} />
                    <span className="code">{d?.code ?? id}</span>
                    {mode === "constructors" && (
                      <span className="team">{teams.get(d?.constructorId ?? "") ?? ""}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rest.map((s) => {
              const touched = scenario.orders[s.key] !== undefined;
              const order = orderFor(scenario, s.key, baseline);
              const pts = pointsTable(season, s.kind);
              return (
                <tr key={s.key} className={`${s.kind} ${touched ? "touched" : ""}`}>
                  <th scope="row" className="col-session">
                    <span className="session-name">
                      {s.short}
                      {s.kind === "sprint" && <em> Sprint</em>}
                    </span>
                    <span className="session-date">{fmtDate(s.date)}</span>
                    {touched && (
                      <button className="reset" onClick={() => resetRow(s.key)} title="Back to baseline">
                        reset
                      </button>
                    )}
                  </th>
                  {board.columns.map((id) => {
                    const p = positionOf(scenario, s.key, baseline, id);
                    const points = p === "dnf" ? 0 : pts[p - 1] ?? 0;
                    return (
                      <td key={id}>
                        <label className="cell">
                          <select
                            value={p === "dnf" ? "dnf" : String(p)}
                            aria-label={`${drivers.get(id)?.name ?? id} at ${s.label}`}
                            onChange={(e) => {
                              const v = e.target.value;
                              onScenario(
                                setPosition(scenario, s.key, baseline, id, v === "dnf" ? "dnf" : Number(v)),
                              );
                            }}
                          >
                            {order.map((_, i) => (
                              <option key={i} value={i + 1}>
                                P{i + 1}
                              </option>
                            ))}
                            <option value="dnf">DNF</option>
                          </select>
                          <span className={`pts ${points === 0 ? "zero" : ""}`}>
                            {points > 0 ? `+${points}` : "0"}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
