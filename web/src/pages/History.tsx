// Every sync run: a 30-day summary and a 90-day chart (both independent of
// paging), then the runs, newest first. A run that imported something or failed
// opens to show each account's result.

import { useState } from "react";
import { FiChevronLeft, FiChevronRight, FiCheck } from "react-icons/fi";
import { api, ApiError, type HistoryRunView, type OrphanView } from "../api";
import { ColumnChart } from "../components/ColumnChart";
import { Notice, PageIntro, Panel } from "../components/layout";
import { Chip } from "../components/marks";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { useData } from "../useData";

const STATUS_TONE = { success: "ok", failure: "error", running: "info" } as const;

export function History({ offset }: { offset: number }) {
  const { t, num, pct } = useI18n();
  const { data, error, set } = useData(() => api.history(offset), [offset]);
  const [problem, setProblem] = useState<string | null>(null);

  const ack = async (id: number) => {
    try {
      const { orphans } = await api.ackOrphan(id);
      if (data) set({ ...data, orphans });
    } catch (e) {
      setProblem(errorText(t, e instanceof ApiError ? e.code : "network"));
    }
  };

  return (
    <>
      <PageIntro eyebrow={t("history.eyebrow")} title={t("history.title")} description={t("history.lede")} />
      {error && <Notice tone="error">{errorText(t, error)}</Notice>}
      {problem && (
        <Notice tone="error" onDismiss={() => setProblem(null)} dismissLabel={t("shell.dismiss")}>
          {problem}
        </Notice>
      )}
      {data && data.orphans.length > 0 && <Orphans orphans={data.orphans} onAck={(id) => void ack(id)} />}
      {data && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span>{t("history.m.runs")}</span>
              <strong>{num(data.summary.runs)}</strong>
              <small>{t("history.m.last30")}</small>
            </div>
            <div className="metric">
              <span>{t("dashboard.success")}</span>
              <strong>{data.summary.rate === null ? "–" : pct(data.summary.rate)}</strong>
              <small>{data.summary.rate === null ? t("dashboard.noRuns") : t("history.m.last30")}</small>
            </div>
            <div className="metric">
              <span>{t("history.imported")}</span>
              <strong>{num(data.summary.imported)}</strong>
              <small>{t("history.m.transactions")}</small>
            </div>
            <div className="metric">
              <span>{t("history.m.failures")}</span>
              <strong>{num(data.summary.failed)}</strong>
              <small>{t("history.m.last30")}</small>
            </div>
          </div>

          <Panel title={t("history.chart.title")} description={t("history.chart.desc")}>
            <ColumnChart points={data.daily} caption={t("history.chart.title")} />
          </Panel>

          <Panel title={t("history.runs.title")} className="history-runs">
            {data.runs.length === 0 ? (
              <p className="muted small">{t("history.none")}</p>
            ) : (
              <ul className="row-list">
                {data.runs.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </ul>
            )}
            {(data.offset > 0 || data.hasMore) && (
              <div className="panel-foot">
                {data.offset > 0 && (
                  <a className="secondary" href={`/history?offset=${data.prevOffset}`}>
                    <FiChevronLeft aria-hidden="true" />
                    {t("history.newerPage")}
                  </a>
                )}
                {data.hasMore && (
                  <a className="secondary" href={`/history?offset=${data.nextOffset}`}>
                    {t("history.olderPage")}
                    <FiChevronRight aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

function RunRow({ run }: { run: HistoryRunView }) {
  const { t, num, dateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const expandable = run.results.length > 0 && (run.totalImported > 0 || run.status === "failure");
  const detailId = `run-${run.id}`;
  const tone = STATUS_TONE[run.status as keyof typeof STATUS_TONE] ?? "";

  const main = (
    <>
      <span className="row-main">
        <span className="row-title">
          {dateTime(run.startedAt)}
          <Chip tone={run.triggeredBy === "scheduled" ? "info" : ""}>{t(`history.triggerOf.${run.triggeredBy}`)}</Chip>
        </span>
        <span className="row-secondary">
          {t(`history.scopeOf.${run.scope}`)} · <Chip tone={tone}>{t(`history.${run.status}`)}</Chip>
        </span>
      </span>
      <span className="row-aside">
        <span>{t("insights.chart.imported", { count: num(run.totalImported) })}</span>
      </span>
    </>
  );

  if (!expandable) return <li className="row">{main}</li>;
  return (
    <>
      <li className="row" data-disclosure aria-expanded={open}>
        <button type="button" className="icon-button quiet" aria-expanded={open} aria-controls={detailId} aria-label={t("history.perAccount")} onClick={() => setOpen(!open)}>
          <FiChevronRight aria-hidden="true" className="disclosure-caret" />
        </button>
        {main}
      </li>
      {open && (
        <li id={detailId} className="row-detail">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("home.account")}</th>
                  <th>{t("history.status")}</th>
                  <th className="num">{t("history.imported")}</th>
                  <th>{t("history.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.accountName ?? r.plaid_account_id}</td>
                    <td>{t(`history.${r.status}`)}</td>
                    <td className="num">{num(r.txns_imported)}</td>
                    <td className="muted">{r.reason && r.reason !== "pulled" ? r.reason : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>
      )}
    </>
  );
}

function Orphans({ orphans, onAck }: { orphans: OrphanView[]; onAck: (id: number) => void }) {
  const { t, num } = useI18n();
  return (
    <Panel title={t("history.orphans.title", { count: num(orphans.length) })} description={t("history.orphans.desc")} className="orphans">
      <ul className="row-list">
        {orphans.map((o) => (
          <li key={o.id} className="row">
            <span className="row-main">
              <span className="row-title">
                {o.payeeName ?? "–"}
                {o.amountCents != null && <span className="mono small">{(o.amountCents / 100).toFixed(2)}</span>}
              </span>
              <span className="row-secondary">
                {[o.date, o.plaidAccountName, o.errorReason].filter(Boolean).join(" · ")}
              </span>
            </span>
            <button type="button" className="secondary" onClick={() => onAck(o.id)}>
              <FiCheck aria-hidden="true" />
              {t("history.orphans.ack")}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
