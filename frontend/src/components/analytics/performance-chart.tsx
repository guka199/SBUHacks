"use client";

import { useEffect, useRef, useState } from "react";
import {
  count,
  networks,
  niceMax,
  type PlotModel,
} from "@/lib/dashboard-analytics";
import { PlatformIcon } from "../ui";
import styles from "./dashboard.module.css";

export function PerformanceChart({ model }: { model: PlotModel }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(220, entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const current =
    active == null ? null : Math.min(active, model.times.length - 1);
  const height = width < 480 ? 216 : 248;
  const left = width < 480 ? 39 : 49,
    right = 12,
    top = 16,
    bottom = 34;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const maximum = niceMax(
    Math.max(
      0,
      ...model.series.flatMap((s) => s.points.map((p) => p?.value ?? 0)),
    ),
  );
  const first = model.times[0] ?? 0,
    last = model.times.at(-1) ?? first;
  const x = (i: number) =>
    left +
    (last === first
      ? plotWidth / 2
      : ((model.times[i] - first) / (last - first)) * plotWidth);
  const y = (value: number) =>
    top + plotHeight - (value / maximum) * plotHeight;
  const pointsAt = (index: number) =>
    model.series.flatMap((series) => {
      const point = series.points[index];
      return point ? [{ ...point, platform: series.platform }] : [];
    });
  const labelCount = Math.min(width < 480 ? 4 : 6, model.times.length);
  const labelIndexes = [
    ...new Set(
      Array.from({ length: labelCount }, (_, i) =>
        labelCount === 1
          ? 0
          : Math.round((i * (model.times.length - 1)) / (labelCount - 1)),
      ),
    ),
  ];

  if (!model.series.length)
    return (
      <div className={styles.chartEmpty}>
        <strong>No recorded data for this view.</strong>
        <p>
          Try another metric, platform or date range. Missing metrics are never
          filled with estimates.
        </p>
      </div>
    );
  if (model.audienceBars) {
    const largest = Math.max(
      1,
      ...model.series.map((s) => s.points[0]?.value ?? 0),
    );
    return (
      <div ref={container} className={styles.audienceBars}>
        <p className={styles.chartNote}>
          Current audience · growth needs two dated collections
        </p>
        {model.series.map((series) => (
          <div key={series.platform} className={styles.audienceRow}>
            <span>
              <PlatformIcon id={series.platform} size={18} />
              {networks[series.platform].name}
            </span>
            <strong title={count(series.points[0]!.value, false)}>
              {count(series.points[0]!.value)}
            </strong>
            <meter
              min={0}
              max={largest}
              value={series.points[0]!.value}
              style={
                {
                  "--series": networks[series.platform].color,
                } as React.CSSProperties
              }
              aria-label={`${networks[series.platform].name} current followers or subscribers`}
            />
          </div>
        ))}
        <p className={styles.chartNote}>
          Followers and subscribers can include the same people across accounts.
        </p>
      </div>
    );
  }

  return (
    <div ref={container} className={styles.chart}>
      <div className={styles.chartMeasure}>{model.unit}</div>
      <div className={styles.plotWrap}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          tabIndex={0}
          aria-label={`${model.unit} by ${model.cadence}. Use left and right arrows to inspect dates, Home or End to jump. A data table follows.`}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const position =
              ((event.clientX - bounds.left) / bounds.width) * width;
            let nearest = 0;
            for (let i = 1; i < model.times.length; i++)
              if (Math.abs(x(i) - position) < Math.abs(x(nearest) - position))
                nearest = i;
            setActive(nearest);
          }}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (
              !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(
                event.key,
              )
            )
              return;
            event.preventDefault();
            setActive(
              event.key === "Escape"
                ? null
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? model.times.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          model.times.length - 1,
                          (current ??
                            (event.key === "ArrowLeft"
                              ? model.times.length
                              : -1)) + (event.key === "ArrowLeft" ? -1 : 1),
                        ),
                      ),
            );
          }}
        >
          <title>{`${model.unit} by ${model.cadence}`}</title>
          {[0, 1, 2, 3, 4].map((tick) => (
            <g key={tick} aria-hidden="true">
              <line
                x1={left}
                x2={width - right}
                y1={y((maximum * tick) / 4)}
                y2={y((maximum * tick) / 4)}
                className={styles.gridLine}
              />
              <text
                x={left - 9}
                y={y((maximum * tick) / 4) + 4}
                textAnchor="end"
                className={styles.axisText}
              >
                {count((maximum * tick) / 4)}
              </text>
            </g>
          ))}
          {labelIndexes.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 7}
              textAnchor={
                i === 0 && model.times.length > 1
                  ? "start"
                  : i === model.times.length - 1 && model.times.length > 1
                    ? "end"
                    : "middle"
              }
              className={styles.axisText}
              aria-hidden="true"
            >
              {model.labels[i]}
            </text>
          ))}
          {model.series.map((series) => {
            const segments: string[] = [];
            let path = "";
            series.points.forEach((point, index) => {
              if (!point) {
                if (!model.snapshot && path) {
                  segments.push(path);
                  path = "";
                }
                return;
              }
              path += `${path ? " L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`;
            });
            if (path) segments.push(path);
            return (
              <g key={series.platform} aria-hidden="true">
                {segments.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={networks[series.platform].color}
                    strokeWidth={2.5}
                    strokeDasharray={networks[series.platform].dash}
                    strokeLinejoin="round"
                  />
                ))}
                {series.points.map(
                  (point, i) =>
                    point && (
                      <circle
                        key={i}
                        cx={x(i)}
                        cy={y(point.value)}
                        r={current === i ? 5 : 3.5}
                        fill={networks[series.platform].color}
                        stroke="var(--surface)"
                        strokeWidth={1.5}
                      />
                    ),
                )}
              </g>
            );
          })}
          {current != null && current >= 0 && (
            <line
              x1={x(current)}
              x2={x(current)}
              y1={top}
              y2={height - bottom}
              className={styles.crosshair}
              aria-hidden="true"
            />
          )}
        </svg>
        {current != null && current >= 0 && (
          <div
            className={styles.tooltip}
            style={{
              left: `${Math.max(4, Math.min(width - Math.min(220, width - 8) - 4, x(current) - 80))}px`,
            }}
          >
            <strong>{model.fullLabels[current]}</strong>
            {pointsAt(current).length ? (
              pointsAt(current).map((p) => (
                <span key={p.platform}>
                  <i style={{ background: networks[p.platform].color }} />
                  {networks[p.platform].name}
                  <b>{count(p.value, false)}</b>
                  {!model.snapshot && (
                    <small>{`${p.count} post${p.count === 1 ? "" : "s"}`}</small>
                  )}
                </span>
              ))
            ) : (
              <span>No observations in this period</span>
            )}
          </div>
        )}
      </div>
      <div className={styles.legend}>
        {model.series.map((s) => (
          <span key={s.platform}>
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="22"
                y1="4"
                y2="4"
                stroke={networks[s.platform].color}
                strokeWidth="2.5"
                strokeDasharray={networks[s.platform].dash}
              />
            </svg>
            {networks[s.platform].name}
          </span>
        ))}
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {current != null && current >= 0
          ? `${model.fullLabels[current]}. ${
              pointsAt(current)
                .map(
                  (p) =>
                    `${networks[p.platform].name}: ${count(p.value, false)}`,
                )
                .join(". ") || "No observations"
            }`
          : ""}
      </div>
      <details className={styles.dataDisclosure}>
        <summary>View chart data</summary>
        <div
          className={styles.dataScroll}
          tabIndex={0}
          aria-label="Chart data table, scroll horizontally if needed"
        >
          <table>
            <caption>{model.unit}; dates in UTC</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                {model.series.map((s) => (
                  <th scope="col" key={s.platform}>
                    {networks[s.platform].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.times.map((time, i) => (
                <tr key={time}>
                  <th scope="row">{model.fullLabels[i]}</th>
                  {model.series.map((s) => (
                    <td key={s.platform}>
                      {count(s.points[i]?.value, false)}
                      {s.points[i] && !model.snapshot
                        ? ` (${s.points[i]!.count} posts)`
                        : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
