// Small data marks: a meter with its figures written beside it, the freshness
// chip (text, never color alone), and a relative time that keeps the exact one
// in its tooltip.

import { useI18n } from "../i18n";

export function Meter(props: { value: number; max: number; label: string; detail?: string | undefined; full?: boolean }) {
  const width = props.max ? Math.min(100, (props.value / props.max) * 100) : 0;
  return (
    <div className="meter-row">
      <span className="meter-label">
        <span>{props.label}</span>
        {props.detail && <span className="muted">{props.detail}</span>}
      </span>
      <span className={`meter${props.full ? " full" : ""}`} aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

const FRESH_TONE = { fresh: "ok", stale: "warn", old: "error", relink: "error", never: "" } as const;
export type Freshness = keyof typeof FRESH_TONE;

export function FreshnessChip({ kind }: { kind: Freshness }) {
  const { t } = useI18n();
  return <span className={`chip ${FRESH_TONE[kind]}`}>{t(`insights.freshness.${kind}`)}</span>;
}

export function Chip({ tone = "", children }: { tone?: "" | "info" | "ok" | "warn" | "error"; children: string }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function RelTime({ at }: { at: number }) {
  const { relative, dateTime } = useI18n();
  return (
    <time dateTime={new Date(at).toISOString()} title={dateTime(at)}>
      {relative(at)}
    </time>
  );
}
