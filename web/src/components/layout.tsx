// Page and section scaffolding: every page and panel opens with a header and a
// one-line description of what it is for.

import type { ReactNode } from "react";
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";

export function PageIntro(props: { eyebrow: string; title: string; description: string; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="page-intro">
      <div className="page-intro-text">
        <p className="eyebrow">{props.eyebrow}</p>
        <h2>{props.title}</h2>
        <p className="lede">{props.description}</p>
        {props.meta && <p className="muted small">{props.meta}</p>}
      </div>
      {props.actions && <div className="page-intro-actions">{props.actions}</div>}
    </header>
  );
}

export function Panel(props: {
  title: ReactNode;
  description?: string | undefined;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${props.className ?? ""}`}>
      <div className="panel-head">
        <div className="panel-head-main">
          <h3>{props.title}</h3>
          {props.description && <p className="muted small">{props.description}</p>}
          {props.meta && <div className="panel-meta">{props.meta}</div>}
        </div>
        {props.actions && <div className="panel-actions">{props.actions}</div>}
      </div>
      {props.children}
    </section>
  );
}

/** A heading and its one-line description, for a section that isn't a panel. */
export function SectionHead({ title, description }: { title: string; description: string }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      <p className="muted small">{description}</p>
    </div>
  );
}

export type Tone = "info" | "ok" | "warn" | "error";
const TONE_ICON = { info: FiInfo, ok: FiCheckCircle, warn: FiAlertTriangle, error: FiAlertTriangle };

export function Notice(props: { tone?: Tone; children: ReactNode; onDismiss?: () => void; dismissLabel?: string }) {
  const tone = props.tone ?? "info";
  const Icon = TONE_ICON[tone];
  return (
    <div className={`notice ${tone === "info" ? "" : tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div className="notice-body">{props.children}</div>
      {props.onDismiss && (
        <button type="button" className="icon-button" onClick={props.onDismiss} aria-label={props.dismissLabel} title={props.dismissLabel}>
          <FiX aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function EmptyState(props: { title: string; description: string; children?: ReactNode }) {
  return (
    <section className="empty-state">
      <h3>{props.title}</h3>
      <p className="muted">{props.description}</p>
      {props.children && <div className="button-row">{props.children}</div>}
    </section>
  );
}
