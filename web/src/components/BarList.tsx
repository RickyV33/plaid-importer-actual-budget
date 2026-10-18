// Horizontal bars for one breakdown (a single series, so one color). Every row
// carries its value and share as text, and a hover/focus tooltip, so nothing is
// read from bar length alone.

import { m } from "motion/react";
import { useI18n } from "../i18n";

export type BarRow = { key: string; label: string; value: number; share: number };

export function BarList(props: { rows: BarRow[]; empty: string; valueText?: (r: BarRow) => string }) {
  const { num, pct } = useI18n();
  const text = props.valueText ?? ((r: BarRow) => num(r.value));
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  if (!props.rows.length || props.rows.every((r) => r.value === 0)) return <p className="muted small">{props.empty}</p>;
  return (
    <ul className="bar-list">
      {props.rows.map((r) => (
        <li key={r.key} className="bar-row" tabIndex={0}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track" aria-hidden="true">
            <m.span className="bar-fill" initial={{ width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
          </span>
          <span className="bar-value">
            {text(r)} <small>{pct(r.share)}</small>
          </span>
          <span className="tooltip" role="tooltip">
            <b>{r.label}</b>
            <span>
              {text(r)} · {pct(r.share)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
