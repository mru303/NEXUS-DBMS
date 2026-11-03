/* ------------------------------------------------------------------
   Lightweight SVG charts on d3-scale / d3-shape.
   Marks follow the dataviz rules: one y-axis, thin 2px lines, 4px rounded
   bar ends on the baseline, recessive grid, crosshair + tooltip on hover,
   legends always present for 2+ series, text in ink colours (never in the
   series colour). Colours come from CSS variables so themes switch live.
------------------------------------------------------------------- */
import clsx from 'clsx';
import { scaleBand, scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useElementSize } from './ui/overlays';

export interface Series {
  name: string;
  color: string; // CSS colour, e.g. var(--viz-1)
  kind?: 'area' | 'line' | 'dashed';
}
export interface Datum {
  label: string;
  values: number[];
  /** Optional longer label for the tooltip */
  title?: string;
}

export function Legend({ series, onSelect }: { series: Series[]; onSelect?: (i: number) => void }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s, i) => {
        const swatch = s.kind === 'dashed'
          ? <span className="inline-block h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: s.color }} />
          : <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />;
        return (
          <li key={s.name}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(i)} className="inline-flex items-center gap-2 rounded text-[12.5px] text-ink-2 hover:text-ink hover:underline underline-offset-4">
                {swatch}{s.name}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">{swatch}{s.name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Tooltip({ x, width, title, rows, format }: { x: number; width: number; title: string; rows: { name: string; color: string; value: number }[]; format: (n: number) => string }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="pointer-events-none absolute top-1 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop" style={{ left }}>
      <p className="mb-1 text-[11.5px] font-medium text-ink-3">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center justify-between gap-4 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 text-ink-2"><span className="size-2 rounded-[2px]" style={{ background: r.color }} />{r.name}</span>
          <span className="num font-semibold text-ink">{format(r.value)}</span>
        </p>
      ))}
    </div>
  );
}

function niceY(max: number) {
  const y = scaleLinear().domain([0, max > 0 ? max : 1]).nice(4);
  return y;
}

const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

/* ------------------------------------------------------------------
   Area / line chart with crosshair
------------------------------------------------------------------- */
export function AreaChart({ data, series, height = 260, format, axisFormat, ariaLabel }: {
  data: Datum[];
  series: Series[];
  height?: number;
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  ariaLabel: string;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const max = Math.max(0, ...data.flatMap((d) => d.values));
  const y = useMemo(() => niceY(max).range([innerH, 0]), [max, innerH]);
  const x = (i: number) => (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70))));
  const fmtAxis = axisFormat ?? format;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`${gid}-g${si}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x1={0} x2={innerW} stroke="var(--viz-grid)" />
                <text x={-10} dy="0.32em" textAnchor="end" className="num fill-ink-3 text-[11px]">{fmtAxis(t)}</text>
              </g>
            ))}
            {data.map((d, i) => i % step === 0 && (data.length - 1 - i >= step / 2 || i === data.length - 1 || i === 0) && (
              <text key={i} x={x(i)} y={innerH + 18} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="fill-ink-3 text-[11px]">{d.label}</text>
            ))}
            {series.map((s, si) => {
              const pts = data.map((d, i) => [x(i), y(d.values[si] ?? 0)] as [number, number]);
              const ln = line().curve(curveMonotoneX)(pts) ?? '';
              const ar = area().curve(curveMonotoneX).y0(innerH)(pts) ?? '';
              return (
                <g key={s.name}>
                  {s.kind === 'area' && <path d={ar} fill={`url(#${gid}-g${si})`} />}
                  <path d={ln} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.kind === 'dashed' ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={0} y2={innerH} stroke="var(--c-line-strong)" />
                {series.map((s, si) => (
                  <circle key={si} cx={x(hover)} cy={y(data[hover].values[si] ?? 0)} r={4.5} fill={s.color} stroke="var(--c-surface)" strokeWidth={2} />
                ))}
              </g>
            )}
            <rect
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={(e) => {
                const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                const px = e.clientX - rect.left;
                const i = data.length <= 1 ? 0 : Math.round((px / innerW) * (data.length - 1));
                setHover(Math.max(0, Math.min(data.length - 1, i)));
              }}
              onPointerLeave={() => setHover(null)}
            />
          </g>
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip
          x={PAD.left + x(hover)}
          width={width}
          title={data[hover].title ?? data[hover].label}
          format={format}
          rows={series.map((s, si) => ({ name: s.name, color: s.color, value: data[hover].values[si] ?? 0 }))}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Vertical bar chart: grouped or stacked
------------------------------------------------------------------- */
export function BarChart({ data, series, height = 260, format, axisFormat, stacked, onSelect, ariaLabel }: {
  data: Datum[];
  series: Series[];
  height?: number;
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  stacked?: boolean;
  onSelect?: (index: number) => void;
  ariaLabel: string;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const max = stacked ? Math.max(0, ...data.map((d) => d.values.reduce((a, b) => a + b, 0))) : Math.max(0, ...data.flatMap((d) => d.values));
  const y = niceY(max).range([innerH, 0]);
  const x0 = scaleBand<number>().domain(data.map((_, i) => i)).range([0, innerW]).paddingInner(0.35).paddingOuter(0.15);
  const bw = x0.bandwidth();
  const groupW = stacked ? Math.min(bw, 44) : Math.min(bw, 22 * series.length + 2 * (series.length - 1));
  const barW = stacked ? groupW : (groupW - 2 * (series.length - 1)) / series.length;
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 56))));
  const fmtAxis = axisFormat ?? format;
  const r = Math.min(4, barW / 2);

  // rounded-top bar path (data end rounded, baseline square)
  const barPath = (bx: number, by: number, w: number, h: number, round: boolean) => {
    if (h <= 0) return '';
    const rr = round ? Math.min(r, h) : 0;
    return `M${bx},${by + h}V${by + rr}Q${bx},${by} ${bx + rr},${by}H${bx + w - rr}Q${bx + w},${by} ${bx + w},${by + rr}V${by + h}Z`;
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x1={0} x2={innerW} stroke="var(--viz-grid)" />
                <text x={-10} dy="0.32em" textAnchor="end" className="num fill-ink-3 text-[11px]">{fmtAxis(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = (x0(i) ?? 0) + bw / 2;
              const gx = cx - groupW / 2;
              let acc = 0;
              return (
                <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                  {hover === i && <rect x={x0(i)! - 4} width={bw + 8} y={0} height={innerH} rx={6} fill="var(--c-hover)" opacity={0.6} />}
                  {series.map((s, si) => {
                    const v = d.values[si] ?? 0;
                    if (stacked) {
                      const top = y(acc + v);
                      const h = y(acc) - top;
                      const isTop = d.values.slice(si + 1).every((n) => !n);
                      acc += v;
                      // 2px surface gap between stacked segments
                      return <path key={si} d={barPath(gx, top, groupW, Math.max(0, h - (si > 0 && h > 2 ? 2 : 0)), isTop)} fill={s.color} />;
                    }
                    const bx = gx + si * (barW + 2);
                    return <path key={si} d={barPath(bx, y(v), barW, innerH - y(v), true)} fill={s.color} />;
                  })}
                  {(i % step === 0) && <text x={cx} y={innerH + 18} textAnchor="middle" className="fill-ink-3 text-[11px]">{d.label}</text>}
                  <rect
                    x={x0(i)! - (x0.step() - bw) / 2}
                    width={x0.step()}
                    y={0}
                    height={innerH}
                    fill="transparent"
                    className={onSelect ? 'cursor-pointer' : undefined}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => onSelect?.(i)}
                  />
                </g>
              );
            })}
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--c-line-strong)" />
          </g>
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip
          x={PAD.left + (x0(hover) ?? 0) + bw / 2}
          width={width}
          title={data[hover].title ?? data[hover].label}
          format={format}
          rows={series.map((s, si) => ({ name: s.name, color: s.color, value: data[hover].values[si] ?? 0 }))}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Horizontal bar list (HTML) — best for ranked categories with long names
------------------------------------------------------------------- */
export interface HBarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Optional reference value drawn as a marker (e.g. budget) */
  reference?: number;
  sub?: ReactNode;
  color?: string;
  onClick?: () => void;
}

export function HBarList({ items, format, max: maxIn, referenceLabel }: { items: HBarItem[]; format: (n: number) => string; max?: number; referenceLabel?: string }) {
  const max = maxIn ?? Math.max(1, ...items.map((i) => Math.max(i.value, i.reference ?? 0)));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => {
        const w = (it.value / max) * 100;
        const over = it.reference !== undefined && it.value > it.reference;
        const inner = (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink-2">{it.label}</span>
              <span className="num shrink-0 font-medium text-ink">
                {format(it.value)}
                {it.reference !== undefined && <span className="font-normal text-ink-3"> / {format(it.reference)}</span>}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-raised">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(w, it.value > 0 ? 1.5 : 0)}%`, background: over ? 'var(--c-danger)' : it.color ?? 'var(--viz-1)' }} />
              {it.reference !== undefined && (
                <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink-2" style={{ left: `calc(${(it.reference / max) * 100}% - 1px)` }} title={referenceLabel} />
              )}
            </div>
            {it.sub && <p className="mt-1 text-xs text-ink-3">{it.sub}</p>}
          </>
        );
        return (
          <li key={it.key}>
            {it.onClick ? (
              <button type="button" onClick={it.onClick} className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition-colors hover:bg-hover">{inner}</button>
            ) : inner}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------
   Part-to-whole: one segmented bar + labelled rows
------------------------------------------------------------------- */
export function SegmentBar({ parts, onSelect, format = String }: {
  parts: { key: string; label: string; value: number; color: string }[];
  onSelect?: (key: string) => void;
  format?: (n: number) => string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <ul className="mt-4 flex flex-col">
        {parts.map((p) => {
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              <span className="flex-1 text-[13px] text-ink-2">{p.label}</span>
              <span className="num text-[13px] font-medium text-ink">{format(p.value)}</span>
              <span className="num w-11 text-right text-xs text-ink-3">{Math.round((p.value / total) * 100)}%</span>
            </>
          );
          return (
            <li key={p.key}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(p.key)} className={clsx('-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover')}>{row}</button>
              ) : <div className="flex items-center gap-3 py-2">{row}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Small inline sparkline for KPI cards */
export function Sparkline({ values, color = 'var(--viz-1)', width = 88, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)] as [number, number]);
  const d = line().curve(curveMonotoneX)(pts) ?? '';
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}
