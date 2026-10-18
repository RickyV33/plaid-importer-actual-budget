// List rows: calm at rest, with icon actions revealed on hover or focus (and
// always shown on touch screens, via the stylesheet).

import type { ReactNode } from "react";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { useI18n } from "../i18n";

export function Row(props: {
  icon?: ReactNode;
  title: ReactNode;
  secondary?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  lead?: ReactNode;
  muted?: boolean;
}) {
  return (
    <li className={`row${props.muted ? " muted-row" : ""}`}>
      {props.lead}
      {props.icon && (
        <span className="row-icon" aria-hidden="true">
          {props.icon}
        </span>
      )}
      <span className="row-main">
        <span className="row-title">{props.title}</span>
        {props.secondary && <span className="row-secondary">{props.secondary}</span>}
      </span>
      {props.aside && <span className="row-aside">{props.aside}</span>}
      {props.actions && <span className="row-actions">{props.actions}</span>}
    </li>
  );
}

/** An icon button with an accessible name (and the same text as its tooltip). */
export function IconButton(props: {
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  children: ReactNode;
}) {
  const cls = `icon-button${props.tone ? ` ${props.tone}` : ""}`;
  if (props.href)
    return (
      <a className={cls} href={props.href} aria-label={props.label} title={props.label}>
        {props.children}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={props.onClick} disabled={props.disabled} aria-label={props.label} title={props.label}>
      {props.children}
    </button>
  );
}

export function EditLink({ href, name }: { href: string; name: string }) {
  const { t } = useI18n();
  return (
    <IconButton href={href} label={`${t("common.edit")}: ${name}`}>
      <FiEdit2 aria-hidden="true" />
    </IconButton>
  );
}

/** Deletes after the browser's confirm dialog, as Media Insights does. */
export function ConfirmButton(props: { label: string; question: string; onConfirm: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <IconButton
      label={props.label}
      tone="danger"
      disabled={props.disabled ?? false}
      onClick={() => {
        if (window.confirm(props.question)) props.onConfirm();
      }}
    >
      {props.children ?? <FiTrash2 aria-hidden="true" />}
    </IconButton>
  );
}
