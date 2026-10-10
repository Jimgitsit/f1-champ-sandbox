import { useEffect, useMemo, useState } from "react";
import type { Season } from "./types";
import { fetchSeason } from "./api";
import {
  type Baseline,
  type Mode,
  type Scenario,
  baselineOrder,
  completedTables,
  emptyScenario,
  project,
  rank,
  remaining,
} from "./engine";
import { MAX_SERIES } from "./palette";
import Header from "./components/Header";
import TitlePicture from "./components/TitlePicture";
import Presets from "./components/Presets";
import ScenarioGrid from "./components/ScenarioGrid";
import Standings from "./components/Standings";
import Chart from "./components/Chart";

function yearFromUrl(): number {
  const q = new URLSearchParams(window.location.search).get("season");
  const n = Number(q);
  return Number.isInteger(n) && n >= 1950 ? n : new Date().getFullYear();
}

/** Contender slots: a driver keeps its colour slot while on the board. */
type Board = { columns: string[]; slots: Record<string, number> };

function defaultBoard(season: Season, mode: Mode): Board {
  const tables = completedTables(season);
  const active = new Set(season.drivers.filter((d) => d.active).map((d) => d.id));
  let columns: string[];
  if (mode === "drivers") {
    columns = rank(tables.drivers).filter((id) => active.has(id)).slice(0, 6);
  } else {
    const teams = rank(tables.constructors).slice(0, 3);
    const byTeam = new Map(season.constructors.map((c) => [c.id, [] as string[]]));
    for (const id of rank(tables.drivers)) {
      const d = season.drivers.find((x) => x.id === id);
      if (d && d.active) {
        byTeam.get(d.constructorId)?.push(d.id);
      }
    }
    columns = teams.flatMap((t) => byTeam.get(t) ?? []).slice(0, MAX_SERIES);
  }
  const slots: Record<string, number> = {};
  columns.forEach((id, i) => {
    slots[id] = i;
  });
  return { columns, slots };
}

function addColumn(board: Board, id: string): Board {
  if (board.columns.includes(id) || board.columns.length >= MAX_SERIES) {
    return board;
  }
  const used = new Set(Object.values(board.slots));
  let slot = 0;
  while (used.has(slot)) {
    slot++;
  }
  return { columns: [...board.columns, id], slots: { ...board.slots, [id]: slot } };
}

function removeColumn(board: Board, id: string): Board {
  const slots = { ...board.slots };
  delete slots[id];
  return { columns: board.columns.filter((x) => x !== id), slots };
}

export default function App() {
  const [year, setYear] = useState(yearFromUrl);
  const [season, setSeason] = useState<Season | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("drivers");
  const [baselineKind, setBaselineKind] = useState<Baseline>("standings");
  const [scenario, setScenario] = useState<Scenario>(emptyScenario);
  const [board, setBoard] = useState<Board>({ columns: [], slots: {} });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSeason(year)
      .then((s) => {
        if (cancelled) {
          return;
        }
        setSeason(s);
        setScenario(emptyScenario());
        setBoard(defaultBoard(s, mode));
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // mode is read only for the initial board; switching mode resets it below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const changeYear = (y: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("season", String(y));
    window.history.replaceState(null, "", url);
    setYear(y);
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    if (season) {
      setBoard(defaultBoard(season, m));
    }
  };

  const tables = useMemo(() => (season ? completedTables(season) : null), [season]);
  const baseline = useMemo(
    () => (season && tables ? baselineOrder(season, tables, baselineKind) : []),
    [season, tables, baselineKind],
  );
  const rest = useMemo(() => (season ? remaining(season) : []), [season]);
  const projection = useMemo(
    () => (season ? project(season, scenario, baseline) : null),
    [season, scenario, baseline],
  );

  return (
    <div className="app">
      <Header
        year={year}
        season={season}
        loading={loading}
        onYear={changeYear}
        mode={mode}
        onMode={changeMode}
      />
      {error && (
        <div className="notice error" role="alert">
          <strong>Couldn’t load the {year} season.</strong> {error}
          {" "}
          <button className="link" onClick={() => changeYear(year - 1)}>
            Try {year - 1}
          </button>
        </div>
      )}
      {season && tables && projection && (
        <>
          {season.gridSource === "previous" && (
            <div className="notice">
              No round of {season.year} has run yet, so the grid is borrowed from the end of {season.year - 1}.
              Line-ups change over the winter; treat the names as placeholders.
            </div>
          )}
          <TitlePicture season={season} tables={tables} mode={mode} />
          <main className="layout">
            <section className="builder">
              <Presets
                season={season}
                rest={rest}
                scenario={scenario}
                baseline={baseline}
                baselineKind={baselineKind}
                mode={mode}
                onScenario={setScenario}
                onBaseline={setBaselineKind}
              />
              <ScenarioGrid
                season={season}
                rest={rest}
                scenario={scenario}
                baseline={baseline}
                board={board}
                mode={mode}
                onScenario={setScenario}
                onAdd={(id) => setBoard((b) => addColumn(b, id))}
                onRemove={(id) => setBoard((b) => removeColumn(b, id))}
              />
            </section>
            <aside className="outcome">
              <Standings season={season} tables={tables} projection={projection} mode={mode} />
              <Chart
                season={season}
                tables={tables}
                projection={projection}
                mode={mode}
                board={board}
              />
            </aside>
          </main>
        </>
      )}
      {loading && !season && <div className="notice">Loading the {year} season…</div>}
      <footer className="foot">
        Results from the <a href="https://api.jolpi.ca/">Jolpica F1 API</a>; points tables read from
        the season’s own results. Ties resolve by countback (most wins, then seconds, …) on Grand Prix
        finishes. Not affiliated with Formula 1.
      </footer>
    </div>
  );
}

export type { Board };
