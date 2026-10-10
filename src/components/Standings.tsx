import { useState } from "react";
import type { Season } from "../types";
import type { Mode, Projection, Tables } from "../engine";
import { compareTally, rank, remaining } from "../engine";

type Props = { season: Season; tables: Tables; projection: Projection; mode: Mode };

export default function Standings({ season, tables, projection, mode }: Props) {
  const now = tables[mode];
  const end = projection.final[mode];
  const nowOrder = rank(now);
  const endOrder = rank(end);
  const rest = remaining(season);
  const sessionLabel = new Map(rest.map((s) => [s.key, s.label]));

  const name = (id: string) =>
    mode === "drivers"
      ? season.drivers.find((d) => d.id === id)?.name ?? id
      : season.constructors.find((c) => c.id === id)?.name ?? id;
  const sub = (id: string) => {
    if (mode !== "drivers") {
      return "";
    }
    const d = season.drivers.find((x) => x.id === id);
    return season.constructors.find((c) => c.id === d?.constructorId)?.name ?? "";
  };

  const champion = endOrder[0];
  const second = endOrder[1];
  const tied = second !== undefined && end.get(champion)!.points === end.get(second)!.points;
  const clinchKey = projection.clinch[mode];
  const finaleKey = rest[rest.length - 1]?.key;

  let verdict: string;
  if (rest.length === 0) {
    verdict = `${name(champion)} is the ${season.year} champion.`;
  } else if (tied) {
    const cb = compareTally(end.get(champion)!, end.get(second)!);
    verdict =
      cb === 0
        ? `${name(champion)} and ${name(second)} finish level and identical on countback; this scenario can’t separate them.`
        : `${name(champion)} takes it on countback, level on points with ${name(second)}.`;
  } else if (clinchKey && clinchKey !== finaleKey) {
    verdict = `${name(champion)} wins it, clinched at the ${sessionLabel.get(clinchKey)}.`;
  } else {
    const margin = end.get(champion)!.points - end.get(second)!.points;
    verdict = `${name(champion)} wins it at the finale by ${margin} point${margin === 1 ? "" : "s"}.`;
  }

  const [all, setAll] = useState(false);
  const LIMIT = 10;
  const shown = all ? endOrder : endOrder.slice(0, LIMIT);

  return (
    <section className="standings">
      <h2>In this scenario</h2>
      <p className="verdict">{verdict}</p>
      <table>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>{mode === "drivers" ? "Driver" : "Team"}</th>
            <th className="num">Now</th>
            <th className="num">End</th>
            <th className="num" title="Change in position">Δ</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((id, i) => {
            const from = nowOrder.indexOf(id);
            const move = from - i;
            const gap = i === 0 ? "" : end.get(id)!.points - end.get(champion)!.points;
            return (
              <tr key={id} className={i === 0 ? "champion" : ""}>
                <td className="num">{i + 1}</td>
                <td>
                  <span className="name">{name(id)}</span>
                  {sub(id) && <span className="sub">{sub(id)}</span>}
                </td>
                <td className="num">{now.get(id)?.points ?? 0}</td>
                <td className="num">
                  <strong>{end.get(id)!.points}</strong>
                  {gap !== "" && <span className="gap">{gap}</span>}
                </td>
                <td className={`num move ${move > 0 ? "up" : move < 0 ? "down" : ""}`}>
                  {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {endOrder.length > LIMIT && (
        <button className="link more" onClick={() => setAll((a) => !a)}>
          {all ? `Show top ${LIMIT}` : `Show all ${endOrder.length}`}
        </button>
      )}
    </section>
  );
}
