import { useId, useState } from "react";
import type { Season } from "../types";
import type { Mode, Projection, Tables } from "../engine";
import type { Board } from "../App";
import { seriesVar } from "../palette";

type Props = { season: Season; tables: Tables; projection: Projection; mode: Mode; board: Board };

type Series = { id: string; label: string; slot: number; values: number[] };

const W = 640;
const H = 300;
const PAD = { top: 16, right: 64, bottom: 56, left: 44 };

export default function Chart({ season, tables, projection, mode, board }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const steps = projection.steps;
  if (steps.length === 0 || board.columns.length === 0) {
    return null;
  }

  // In constructors mode, each board driver stands for their team (dedupe).
  const entities: { id: string; label: string; slot: number }[] = [];
  const seen = new Set<string>();
  for (const did of board.columns) {
    const d = season.drivers.find((x) => x.id === did);
    if (!d) {
      continue;
    }
    const id = mode === "drivers" ? d.id : d.constructorId;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const label =
      mode === "drivers" ? d.code : season.constructors.find((c) => c.id === id)?.name ?? id;
    entities.push({ id, label, slot: board.slots[did] });
  }

  const series: Series[] = entities.map((e) => ({
    ...e,
    values: [tables[mode].get(e.id)?.points ?? 0, ...steps.map((s) => s.tables[mode].get(e.id)?.points ?? 0)],
  }));
  const xLabels = ["Now", ...steps.map((s) => (s.session.kind === "sprint" ? `${s.session.short} S` : s.session.short))];
  const n = xLabels.length;
  const tilted = n > 6;
  const yMax = Math.max(1, ...series.flatMap((s) => s.values));
  const yMin = Math.min(...series.flatMap((s) => s.values));
  const lo = Math.max(0, Math.floor((yMin - (yMax - yMin) * 0.1) / 25) * 25);
  const hi = Math.ceil(yMax / 25) * 25 || 25;

  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(1, n - 1);
  const y = (v: number) => PAD.top + ((hi - v) * (H - PAD.top - PAD.bottom)) / (hi - lo);

  const ticks: number[] = [];
  const stepSize = hi - lo > 200 ? 50 : 25;
  for (let v = lo; v <= hi; v += stepSize) {
    ticks.push(v);
  }

  // End labels, nudged apart so they don't overprint.
  const ends = series
    .map((s) => ({ s, yy: y(s.values[n - 1]) }))
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].yy - ends[i - 1].yy < 13) {
      ends[i].yy = ends[i - 1].yy + 13;
    }
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) {
        best = i;
      }
    }
    setHover(best);
  };

  const hovered = hover !== null ? series.map((s) => ({ s, v: s.values[hover] })).sort((a, b) => b.v - a.v) : [];

  return (
    <section className="chart">
      <h2>Points as the season plays out</h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative points per session for the contenders on the board"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left - 4} y={0} width={W - PAD.left - PAD.right + 8} height={H} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <g key={v} className="tick">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) => {
          if (tilted && n > 16 && i % 2 === 1 && i !== n - 1) {
            return null;
          }
          return tilted ? (
            <text
              key={i}
              className="xlabel tilted"
              transform={`translate(${x(i)} ${H - PAD.bottom + 12}) rotate(-32)`}
            >
              {l}
            </text>
          ) : (
            <text key={i} className="xlabel" x={x(i)} y={H - PAD.bottom + 16} textAnchor="middle">
              {l}
            </text>
          );
        })}
        {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => (
            <polyline
              key={s.id}
              className="line"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              stroke={seriesVar(s.slot)}
            />
          ))}
          {hover !== null &&
            series.map((s) => (
              <circle key={s.id} className="dot" cx={x(hover)} cy={y(s.values[hover])} r={4} fill={seriesVar(s.slot)} />
            ))}
        </g>
        {ends.map(({ s, yy }) => (
          <text key={s.id} className="endlabel" x={W - PAD.right + 8} y={yy + 4}>
            {s.label}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip" role="status">
          <strong>{hover === 0 ? "Now" : steps[hover - 1].session.label}</strong>
          <ul>
            {hovered.map(({ s, v }) => (
              <li key={s.id}>
                <span className="swatch" style={{ background: seriesVar(s.slot) }} />
                {s.label} <b>{v}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="legend">
        {series.map((s) => (
          <li key={s.id}>
            <span className="swatch" style={{ background: seriesVar(s.slot) }} />
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
