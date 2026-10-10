import type { Season } from "../types";
import type { Mode, Tables } from "../engine";
import { titlePicture, remaining, maxPoints } from "../engine";

type Props = { season: Season; tables: Tables; mode: Mode };

const STATE_LABEL = {
  clinched: "Champion",
  alive: "Still in it",
  eliminated: "Out",
} as const;

const STATE_GLYPH = {
  clinched: "★",
  alive: "●",
  eliminated: "○",
} as const;

export default function TitlePicture({ season, tables, mode }: Props) {
  const rows = titlePicture(season, tables, mode);
  const rest = remaining(season);
  const left = rest.reduce((acc, s) => acc + maxPoints(season, s.kind, mode), 0);
  const names = new Map<string, string>(
    mode === "drivers"
      ? season.drivers.map((d) => [d.id, d.code])
      : season.constructors.map((c) => [c.id, c.name]),
  );
  const alive = rows.filter((r) => r.state !== "eliminated");
  const out = rows.length - alive.length;

  return (
    <section className="picture" aria-label="Title picture today">
      <div className="picture-lead">
        <h2>Where it stands</h2>
        <p>
          {left === 0
            ? "The season is complete."
            : `${left} points still on the table across ${rest.length} session${rest.length === 1 ? "" : "s"}.`}{" "}
          {alive.length === 1
            ? `${names.get(alive[0].id)} has the title.`
            : `${alive.length} ${mode === "drivers" ? "drivers" : "teams"} can still win it`}
          {out > 0 && alive.length > 1 ? `, ${out} cannot.` : ""}
        </p>
      </div>
      <ol className="picture-row">
        {alive.map((r, i) => (
          <li key={r.id} className={`chip ${r.state}`}>
            <span className="chip-pos">{i + 1}</span>
            <span className="chip-name">{names.get(r.id) ?? r.id}</span>
            <span className="chip-pts">{r.points}</span>
            <span className="chip-meta">
              {r.gap === 0 ? `max ${r.maxPossible}` : `${r.gap} behind`}
            </span>
            <span className="chip-state">
              <span aria-hidden="true">{STATE_GLYPH[r.state]}</span> {STATE_LABEL[r.state]}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
