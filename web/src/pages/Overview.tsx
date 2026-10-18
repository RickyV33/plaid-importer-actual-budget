// Landing page: what came in, where it went, and when the next sync runs.
// Read-only and local-only; every figure links to the page that acts on it.

import { FiAlertTriangle, FiArrowRight } from "react-icons/fi";
import { api } from "../api";
import { BarList } from "../components/BarList";
import { ColumnChart } from "../components/ColumnChart";
import { HeroNumber } from "../components/HeroNumber";
import { Notice, PageIntro, Panel } from "../components/layout";
import { FreshnessChip, RelTime } from "../components/marks";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { useData } from "../useData";

export function Overview() {
  const { t, num, pct, time, dateTime } = useI18n();
  const { data: o, error } = useData(api.overview);

  return (
    <>
      <PageIntro eyebrow={t("dashboard.eyebrow")} title={t("dashboard.title")} description={t("dashboard.lede")} />
      {error && <Notice tone="error">{errorText(t, error)}</Notice>}
      {o && (
        <>
          <section className="hero-card">
            <div className="hero-main">
              <p className="eyebrow">{t("dashboard.hero.eyebrow")}</p>
              <HeroNumber value={o.importedTotals.d30} format={num} />
              <span className="hero-caption">{o.connectionCount === 0 ? t("dashboard.hero.noConnections") : t("dashboard.hero.caption")}</span>
              <div className="hero-pills">
                {([7, 60, 90] as const).map((d) => (
                  <b key={d}>{t("dashboard.hero.window", { count: num(o.importedTotals[`d${d}`]), days: d })}</b>
                ))}
              </div>
            </div>
            <div className="hero-side">
              <p className="eyebrow">{t("dashboard.next.eyebrow")}</p>
              {o.nextSyncAt ? (
                <>
                  <p className="hero-side-figure" title={time(o.nextSyncAt)}>
                    <RelTime at={o.nextSyncAt} />
                  </p>
                  <p className="hero-side-text">{dateTime(o.nextSyncAt)}</p>
                </>
              ) : (
                <p className="hero-side-text">{t("dashboard.next.none")}</p>
              )}
              <a className="text-button" href="/schedules">
                {t("dashboard.next.link")} <FiArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>

          <div className="metric-grid">
            <a className="metric" href="/connections">
              <span>{t("dashboard.connections")}</span>
              {o.connectionCount > 0 ? (
                <>
                  <strong>{num(o.connectionCount)}</strong>
                  {o.relinkCount > 0 ? (
                    <span className="alert">
                      <FiAlertTriangle aria-hidden="true" />
                      {t("dashboard.relinkAlert", { count: o.relinkCount })}
                    </span>
                  ) : (
                    <small>{t("dashboard.accounts", { count: num(o.accountCount) })}</small>
                  )}
                </>
              ) : (
                <small>{t("dashboard.noConnections")}</small>
              )}
            </a>

            <a className="metric" href="/profiles">
              <span>{t("dashboard.profiles")}</span>
              {o.profileCount > 0 ? (
                <>
                  <strong>{num(o.profileCount)}</strong>
                  <small>{t("dashboard.profilesDetail")}</small>
                </>
              ) : (
                <small>{t("dashboard.noProfiles")}</small>
              )}
            </a>

            <a className="metric" href="/profiles">
              <span>{t("dashboard.routed")}</span>
              {o.coverage.total > 0 ? (
                <>
                  <strong>{t("dashboard.routedValue", { routed: num(o.coverage.routed), total: num(o.coverage.total) })}</strong>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${(o.coverage.routed / o.coverage.total) * 100}%` }} />
                  </span>
                  <small>{t("dashboard.routedDetail")}</small>
                </>
              ) : (
                <small>{t("dashboard.noAccounts")}</small>
              )}
            </a>

            <a className="metric" href="/history">
              <span>{t("dashboard.success")}</span>
              {o.outcomes.rate !== null ? (
                <>
                  <strong>{pct(o.outcomes.rate)}</strong>
                  <small>{t("dashboard.successDetail", { runs: num(o.outcomes.runs), failed: num(o.outcomes.failed) })}</small>
                </>
              ) : (
                <small>{t("dashboard.noRuns")}</small>
              )}
            </a>

            {o.otherUsers !== null && (
              <div className="metric">
                <span>{t("dashboard.otherUsers")}</span>
                {o.otherUsers > 0 ? (
                  <>
                    <strong>{num(o.otherUsers)}</strong>
                    <small>{t("dashboard.otherUsersDetail")}</small>
                  </>
                ) : (
                  <small>{t("dashboard.noOtherUsers")}</small>
                )}
              </div>
            )}
          </div>

          <div className="two-col">
            <Panel title={t("dashboard.daily.title")} description={t("dashboard.daily.desc")}>
              <ColumnChart points={o.daily} caption={t("dashboard.daily.title")} />
            </Panel>
            <Panel title={t("dashboard.byConnection.title")} description={t("dashboard.byConnection.desc")}>
              <BarList rows={o.byConnection} empty={t("insights.chart.empty")} />
            </Panel>
          </div>

          <Panel title={t("dashboard.syncStatus")} description={t("dashboard.syncStatusDesc")}>
            {o.connectionSyncs.length === 0 ? (
              <p className="muted small">{t("dashboard.noConnections")}</p>
            ) : (
              <ul className="row-list">
                {o.connectionSyncs.map((c) => (
                  <li key={c.id} className="row">
                    <span className="row-main">
                      <span className="row-title">
                        {c.institutionName ?? t("health.unknownBank")} <FreshnessChip kind={c.freshness} />
                      </span>
                      <span className="row-secondary">
                        {c.lastSyncedAt ? (
                          <>
                            {t("dashboard.lastSync")} <RelTime at={c.lastSyncedAt} />
                          </>
                        ) : (
                          t("dashboard.neverSynced")
                        )}
                      </span>
                    </span>
                    <span className="row-aside">
                      {c.nextRunAt ? (
                        <>
                          <span>{t("dashboard.nextSyncCol")}</span>
                          <small>{dateTime(c.nextRunAt)}</small>
                        </>
                      ) : (
                        <small>{t("dashboard.noSchedule")}</small>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
