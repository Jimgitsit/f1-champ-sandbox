import type { Season } from "../types";
import type { Mode } from "../engine";
import { sessions } from "../engine";

type Props = {
  year: number;
  season: Season | null;
  loading: boolean;
  onYear: (y: number) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 2) {
    return "just now";
  }
  if (mins < 90) {
    return `${mins} min ago`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 36) {
    return `${hours} h ago`;
  }
  return `${Math.round(hours / 24)} d ago`;
}

export default function Header({ year, season, loading, onYear, mode, onMode }: Props) {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= 2010; y--) {
    years.push(y);
  }
  const all = season ? sessions(season) : [];
  const racesDone = season ? season.races.filter((r) => r.result).length : 0;
  const sprintsLeft = all.filter((s) => !s.done && s.kind === "sprint").length;

  return (
    <header className="masthead">
      <div className="masthead-title">
        <h1>
          <span className="wide">F1</span> title permutations
        </h1>
        <p className="tagline">Set the rest of the season. See who takes the championship.</p>
      </div>
      <div className="masthead-controls">
        <label className="field">
          <span>Season</span>
          <select value={year} onChange={(e) => onYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Championship">
          <button className={mode === "drivers" ? "on" : ""} onClick={() => onMode("drivers")}>
            Drivers
          </button>
          <button
            className={mode === "constructors" ? "on" : ""}
            onClick={() => onMode("constructors")}
          >
            Constructors
          </button>
        </div>
        <p className="status">
          {loading && "Loading…"}
          {!loading && season && (
            <>
              {racesDone} of {season.races.length} rounds run
              {sprintsLeft > 0 && `, ${sprintsLeft} sprint${sprintsLeft === 1 ? "" : "s"} to come`}.
              Results updated {ago(season.fetchedAt)}.
            </>
          )}
        </p>
      </div>
    </header>
  );
}
