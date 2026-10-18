// Banks linked through Plaid: health at a glance, accounts with the budgets they
// feed, and the actions that talk to Plaid (link, relink, manage, sync, remove).
// After an action the page re-reads its data instead of reloading.

import { useState, type ReactNode } from "react";
import { FiEdit2, FiLink, FiPlus, FiRefreshCw } from "react-icons/fi";
import { api, ApiError, type ConnectionView, type SyncResult } from "../api";
import { EmptyState, Notice, PageIntro, Panel, type Tone } from "../components/layout";
import { FreshnessChip, Meter, RelTime, Chip } from "../components/marks";
import { ConfirmButton, IconButton, Row } from "../components/Row";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { openLink } from "../plaid";
import { useShell } from "../shell";
import { useData } from "../useData";

type Message = { tone: Tone; text: string };

export function Connections() {
  const { t, num, dateTime } = useI18n();
  const { refreshBanners } = useShell();
  const { data, error, reload } = useData(api.connections);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState<Message | null>(null);
  const [perBank, setPerBank] = useState<Record<string, Message[]>>({});

  const items = data?.items ?? [];
  const syncable = items.flatMap((i) => i.accounts.filter((a) => a.accessStatus !== "deselected").map((a) => a.plaidAccountId));
  const allPicked = syncable.length > 0 && syncable.every((id) => picked.has(id));
  const setMany = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const fail = (e: unknown) => setPage({ tone: "error", text: e instanceof ApiError ? errorText(t, e.code) : t("home.plaidExited", { msg: (e as Error).message }) });

  /** Runs an action with one busy marker, then re-reads the page and banners. */
  async function act(key: string, run: () => Promise<void>) {
    setBusy(key);
    setPage(null);
    try {
      await run();
      await reload();
      refreshBanners();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const showSync = (r: SyncResult) => {
    const msgs: Record<string, Message[]> = {};
    for (const s of r.synced) msgs[s.itemId] = [{ tone: "ok", text: t("home.connImported", { count: num(s.imported) }) }];
    for (const s of r.skipped) (msgs[s.itemId] ??= []).push({ tone: "warn", text: t("home.connSkipped", { minutes: s.retryAfterMinutes }) });
    setPerBank(msgs);
    setPage(r.status === "success" ? { tone: "ok", text: t("connections.syncDone", { count: num(r.totalImported) }) } : { tone: "error", text: t("connections.syncFailed", { count: num(r.totalImported) }) });
  };

  const sync = (selected: boolean) => {
    if (selected && picked.size === 0) {
      setPage({ tone: "warn", text: t("home.pickAccount") });
      return;
    }
    void act("sync", async () => {
      setPerBank({});
      showSync(await api.sync(selected ? { scope: "selected", plaidAccountIds: [...picked] } : { scope: "all" }));
    });
  };

  const link = () =>
    act("link", async () => {
      const token = await openLink((await api.linkToken()).link_token);
      if (token) await api.exchange(token);
    });
  const relink = (item: ConnectionView) =>
    act(`relink:${item.id}`, async () => {
      if (await openLink((await api.updateToken(item.id)).link_token)) await api.markActive(item.id);
    });
  const manage = (item: ConnectionView) =>
    act(`manage:${item.id}`, async () => {
      if (await openLink((await api.accountSelectToken(item.id)).link_token)) await api.refreshAccounts(item.id);
    });

  const linkButton = (primary: boolean): ReactNode =>
    primary ? (
      <button type="button" className="primary" onClick={() => void link()} disabled={busy !== null}>
        <FiLink aria-hidden="true" />
        {t("home.linkAccount")}
      </button>
    ) : (
      <IconButton label={t("home.linkAnother")} onClick={() => void link()} disabled={busy !== null}>
        <FiPlus aria-hidden="true" />
      </IconButton>
    );

  return (
    <>
      <PageIntro
        eyebrow={t("connections.eyebrow")}
        title={t("home.connections")}
        description={t("home.connectionsDesc")}
        actions={
          items.length > 0 && (
            <>
              <button type="button" className="primary" onClick={() => sync(true)} disabled={busy !== null}>
                <FiRefreshCw aria-hidden="true" className={busy === "sync" ? "spin" : ""} />
                {t("home.syncSelected")}
              </button>
              <button type="button" className="secondary" onClick={() => sync(false)} disabled={busy !== null}>
                <FiRefreshCw aria-hidden="true" />
                {t("home.syncAll")}
              </button>
              {linkButton(false)}
            </>
          )
        }
      />
      {error && <Notice tone="error">{errorText(t, error)}</Notice>}
      {page && (
        <Notice tone={page.tone} onDismiss={() => setPage(null)} dismissLabel={t("shell.dismiss")}>
          {page.text}
        </Notice>
      )}
      {busy === "sync" && <Notice>{t("home.syncing")}</Notice>}

      {data && items.length === 0 && (
        <EmptyState title={t("home.noBanks")} description={t("connections.emptyHelp")}>
          {linkButton(true)}
        </EmptyState>
      )}

      {items.length > 0 && (
        <div className="stack">
          <label className="check">
            <input type="checkbox" checked={allPicked} onChange={() => setMany(syncable, !allPicked)} /> {t("home.selectAll")}
          </label>
          {items.map((item) => {
            const ids = item.accounts.filter((a) => a.accessStatus !== "deselected").map((a) => a.plaidAccountId);
            const bankPicked = ids.length > 0 && ids.every((id) => picked.has(id));
            const name = item.institutionName ?? t("health.unknownBank");
            return (
              <Panel
                key={item.id}
                className="panel-hover"
                title={name}
                meta={
                  <>
                    <FreshnessChip kind={item.freshness} />
                    <span>
                      {item.lastSyncedAt ? (
                        <>
                          {t("dashboard.lastSync")} <RelTime at={item.lastSyncedAt} />
                        </>
                      ) : (
                        t("home.neverSynced")
                      )}
                    </span>
                  </>
                }
                actions={
                  <>
                    {item.status === "requires_relink" && (
                      <button type="button" className="secondary" onClick={() => void relink(item)} disabled={busy !== null}>
                        <FiLink aria-hidden="true" />
                        {t("home.relink")}
                      </button>
                    )}
                    <span className="row-actions">
                      {item.status !== "requires_relink" && (
                        <IconButton label={`${t("home.manageAccounts")}: ${name}`} onClick={() => void manage(item)} disabled={busy !== null}>
                          <FiEdit2 aria-hidden="true" />
                        </IconButton>
                      )}
                      <ConfirmButton
                        label={`${t("home.remove")}: ${name}`}
                        question={t("home.removeConfirm", { institution: name })}
                        disabled={busy !== null}
                        onConfirm={() => void act(`remove:${item.id}`, () => api.removeItem(item.id).then(() => {}))}
                      />
                    </span>
                  </>
                }
              >
                {item.rateLimit && (
                  <div className="panel-meter">
                    <Meter
                      value={item.rateLimit.used}
                      max={item.rateLimit.max}
                      full={item.rateLimit.full}
                      label={t("connections.rateLimit", { used: num(item.rateLimit.used), max: num(item.rateLimit.max), hours: num(item.rateLimit.windowHours) })}
                      detail={item.rateLimit.full && item.rateLimit.freesAt ? t("connections.rateLimitFull", { when: dateTime(item.rateLimit.freesAt) }) : undefined}
                    />
                  </div>
                )}
                {ids.length > 0 && (
                  <label className="check small bank-select">
                    <input type="checkbox" checked={bankPicked} onChange={() => setMany(ids, !bankPicked)} /> {t("connections.selectBank")}
                  </label>
                )}
                <ul className="row-list">
                  {item.accounts.map((a) => {
                    const off = a.accessStatus === "deselected";
                    return (
                      <Row
                        key={a.plaidAccountId}
                        muted={off}
                        lead={<input type="checkbox" aria-label={a.name} checked={picked.has(a.plaidAccountId)} disabled={off} onChange={() => setMany([a.plaidAccountId], !picked.has(a.plaidAccountId))} />}
                        title={
                          <>
                            {a.name}
                            {a.mask && <span className="muted mono small">····{a.mask}</span>}
                            {off && <Chip tone="warn">{t("home.notSyncing")}</Chip>}
                          </>
                        }
                        secondary={
                          <>
                            {a.type && `${a.type} · `}
                            {off ? t("home.notSyncingHelp") : a.budgets > 0 ? t("connections.feeds", { count: num(a.budgets) }) : t("connections.notRouted")}
                          </>
                        }
                        aside={
                          !off && (
                            <>
                              <span>{t("insights.chart.imported", { count: num(a.imported30) })}</span>
                              <small>{t("connections.last30")}</small>
                            </>
                          )
                        }
                        actions={
                          off && (
                            <ConfirmButton
                              label={`${t("home.remove")}: ${a.name}`}
                              question={t("home.accountRemoveConfirm", { name: a.name })}
                              disabled={busy !== null}
                              onConfirm={() => void act(`remove:${a.plaidAccountId}`, () => api.removeAccount(item.id, a.plaidAccountId).then(() => {}))}
                            />
                          )
                        }
                      />
                    );
                  })}
                </ul>
                {(perBank[item.id] ?? []).map((m, i) => (
                  <Notice key={i} tone={m.tone}>
                    {m.text}
                  </Notice>
                ))}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
