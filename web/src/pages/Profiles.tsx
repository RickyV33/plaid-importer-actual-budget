// Budgets and their routing: each bank account → the Actual account it feeds,
// with its pending switch. Changes save in place and the coverage meter follows.

import { useState } from "react";
import { FiArrowRight, FiPlus } from "react-icons/fi";
import { api, ApiError, type ProfileView } from "../api";
import { EmptyState, Notice, PageIntro, Panel } from "../components/layout";
import { Chip, Meter } from "../components/marks";
import { ConfirmButton, EditLink, IconButton } from "../components/Row";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { useData } from "../useData";

export function Profiles() {
  const { t, num } = useI18n();
  const { data, error, reload, set } = useData(api.profiles);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(key: string, run: () => Promise<unknown>) {
    setSaving(key);
    setProblem(null);
    try {
      await run();
      await reload();
    } catch (e) {
      setProblem(errorText(t, e instanceof ApiError ? e.code : "network"));
      await reload();
    } finally {
      setSaving(null);
    }
  }

  /** Flip the switch at once; the server confirms (or the reload puts it back). */
  const setPending = (p: ProfileView, plaidAccountId: string, value: boolean) => {
    if (data)
      set({
        profiles: data.profiles.map((x) =>
          x.id !== p.id
            ? x
            : { ...x, connections: x.connections.map((c) => ({ ...c, accounts: c.accounts.map((a) => (a.plaidAccountId === plaidAccountId ? { ...a, pendingVisible: value } : a)) })) },
        ),
      });
    void save(`pending:${p.id}:${plaidAccountId}`, () => api.setPendingVisible(p.id, plaidAccountId, value));
  };

  const profiles = data?.profiles ?? [];
  return (
    <>
      <PageIntro
        eyebrow={t("profiles.eyebrow")}
        title={t("home.profiles")}
        description={t("home.profilesDesc")}
        actions={
          <IconButton href="/profiles/new" tone="primary" label={t("home.newProfile")}>
            <FiPlus aria-hidden="true" />
          </IconButton>
        }
      />
      {error && <Notice tone="error">{errorText(t, error)}</Notice>}
      {problem && (
        <Notice tone="error" onDismiss={() => setProblem(null)} dismissLabel={t("shell.dismiss")}>
          {problem}
        </Notice>
      )}
      {data && profiles.length === 0 && (
        <EmptyState title={t("profiles.emptyTitle")} description={t("home.noProfiles")}>
          <a className="primary" href="/profiles/new">
            <FiPlus aria-hidden="true" />
            {t("home.newProfile")}
          </a>
        </EmptyState>
      )}
      <div className="stack">
        {profiles.map((p) => (
          <Panel
            key={p.id}
            className="panel-hover"
            title={p.name}
            meta={<span className="mono">{`${hostOf(p.serverUrl)} · ${t("home.budget", { id: p.budgetId })}`}</span>}
            actions={
              <span className="row-actions">
                <EditLink href={`/profiles/${p.id}/edit`} name={p.name} />
                <ConfirmButton
                  label={`${t("common.delete")}: ${p.name}`}
                  question={t("home.deleteProfileConfirm", { name: p.name })}
                  onConfirm={() => void save(`delete:${p.id}`, () => api.deleteProfile(p.id))}
                />
              </span>
            }
          >
            {p.coverage.total > 0 && (
              <div className="panel-meter">
                <Meter value={p.coverage.routed} max={p.coverage.total} label={t("profiles.coverage", { routed: num(p.coverage.routed), total: num(p.coverage.total) })} />
              </div>
            )}
            {p.actualError && <Notice tone="warn">{t("home.actualUnreachable")}</Notice>}
            {p.connections.map((c) => (
              <div key={c.itemId} className="route-group">
                <div className="route-group-head">{c.institutionName ?? t("health.unknownBank")}</div>
                {c.accounts.map((a) => {
                  const key = `${p.id}:${a.plaidAccountId}`;
                  return (
                    <div key={a.plaidAccountId} className="route">
                      <div className="route-from">
                        <span className="row-title">
                          {a.name}
                          {a.mask && <span className="muted mono small">····{a.mask}</span>}
                          {a.accessStatus === "deselected" && <Chip tone="warn">{t("home.notSyncing")}</Chip>}
                        </span>
                        {a.type && <span className="row-secondary">{a.type}</span>}
                      </div>
                      <FiArrowRight className="route-arrow" aria-hidden="true" />
                      <div className="route-to">
                        <label className="visually-hidden" htmlFor={`map-${key}`}>
                          {t("home.mappedTo")}: {a.name}
                        </label>
                        <select
                          id={`map-${key}`}
                          value={a.mappedActualId ?? ""}
                          disabled={saving !== null || p.actualError}
                          onChange={(e) => void save(`map:${key}`, () => api.setMapping(p.id, a.plaidAccountId, e.target.value || null))}
                        >
                          <option value="">{t("home.unmapped")}</option>
                          {p.actualAccounts.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                        <span className="route-pending">
                          {a.mappedActualId && (
                            <label className="switch" title={t("home.pendingHelp")}>
                              <input type="checkbox" checked={a.pendingVisible} onChange={(e) => setPending(p, a.plaidAccountId, e.target.checked)} />
                              <span className="switch-track" aria-hidden="true" />
                              <span className="small">{t("home.showPending")}</span>
                            </label>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </Panel>
        ))}
      </div>
    </>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
