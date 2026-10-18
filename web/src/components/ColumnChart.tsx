// One column per day. Columns are focusable with a labelled tooltip, and a
// visually hidden table carries the same numbers for assistive tech.

import { m } from "motion/react";
import { useI18n } from "../i18n";

export type DayPoint = { date: string; imported: number };

export function ColumnChart({ points, caption }: { points: DayPoint[]; caption: string }) {
  const { t, num, day, weekday } = useI18n();
  if (!points.length || points.every((p) => p.imported === 0)) return <p className="muted small">{t("insights.chart.empty")}</p>;
  const max = Math.max(1, ...points.map((p) => p.imported));
  const label = (p: DayPoint) => `${weekday(p.date)} ${day(p.date)}: ${t("insights.chart.imported", { count: num(p.imported) })}`;
  const axis = [points[0]!, points[Math.floor(points.length / 2)]!, points[points.length - 1]!];
  return (
    <figure className="column-chart">
      <div className="columns">
        {points.map((p) => (
          <div key={p.date} className="column" tabIndex={0} role="img" aria-label={label(p)}>
            <m.span
              className={`column-fill${p.imported === 0 ? " zero" : ""}`}
              initial={{ height: 1 }}
              animate={{ height: p.imported === 0 ? 1 : `${Math.max(2, (p.imported / max) * 100)}%` }}
              transition={{ type: "spring", stiffness: 140, damping: 22 }}
            />
            <span className="tooltip" aria-hidden="true">
              <b>
                {weekday(p.date)} {day(p.date)}
              </b>
              <span>{t("insights.chart.imported", { count: num(p.imported) })}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="chart-axis" aria-hidden="true">
        {axis.map((p, i) => (
          <span key={i}>{day(p.date)}</span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t("insights.chart.date")}</th>
            <th scope="col">{t("insights.chart.importedCol")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{day(p.date)}</td>
              <td>{num(p.imported)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
