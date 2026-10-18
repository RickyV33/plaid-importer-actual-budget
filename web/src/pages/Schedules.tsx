// Recurring syncs: the coming week at a glance, then each schedule as a calm row
// with toggle, edit, and delete on hover or focus.

import { useState } from "react";
import { FiPlus, FiToggleLeft, FiToggleRight } from "react-icons/fi";
import { api, ApiError, type ScheduleView } from "../api";
import { EmptyState, Notice, PageIntro, Panel } from "../components/layout";
import { Chip } from "../components/marks";
import { ConfirmButton, EditLink, IconButton } from "../components/Row";
import { errorText } from "../errors";
import { useI18n, type I18n } from "../i18n";
import { useData } from "../useData";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** "07:00" as the viewer's clock reads it ("7:00 AM", "07:00"). */
export function clock(hhmm: string, lang: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)));
}

function cadence(s: ScheduleView, { t, lang }: I18n): string {
  const days = (s.daysOfWeek ?? []).map((d) => t(`schedules.day.${DAY_KEYS[d]}`)).join(", ");
  return t("schedules.cadence", { days, time: clock(s.timeOfDay ?? "00:00", lang), n: s.repeatWeeks ?? 1 });
}

export function Schedules() {
  const i18n = useI18n();
  const { t, day, weekday, time, dateTime } = i18n;
  const { data, error, reload } = useData(api.schedules);
  const [problem, setProblem] = useState<string | null>(null);

  async function act(run: () => Promise<unknown>) {
    setProblem(null);
    try {
      await run();
    } catch (e) {
      setProblem(errorText(t, e instanceof ApiError ? e.code : "network"));
    }
    await reload();
  }

  const hasBanks = (data?.connections.length ?? 0) > 0;
  const schedules = data?.schedules ?? [];
  const today = data?.week[0]?.date;

  return (
    <>
      <PageIntro
        eyebrow={t("schedules.eyebrow")}
        title={t("schedules.title")}
        description={t("schedules.desc")}
        actions={
          hasBanks ? (
            <IconButton href="/schedules/new" tone="primary" label={t("schedules.new")}>
              <FiPlus aria-hidden="true" />
            </IconButton>
          ) : (
            data && <span className="muted small">{t("schedules.needConnections")}</span>
          )
        }
      />
      {error && <Notice tone="error">{errorText(t, error)}</Notice>}
      {problem && (
        <Notice tone="error" onDismiss={() => setProblem(null)} dismissLabel={t("shell.dismiss")}>
          {problem}
        </Notice>
      )}

      {data && schedules.length === 0 && (
        <EmptyState title={t("schedules.none")} description={t("schedules.newDesc")}>
          {hasBanks && (
            <a className="primary" href="/schedules/new">
              <FiPlus aria-hidden="true" />
              {t("schedules.new")}
            </a>
          )}
        </EmptyState>
      )}

      {data && schedules.length > 0 && (
        <div className="stack">
          <Panel title={t("schedules.week.title")} description={t("schedules.week.desc")}>
            <ol className="week">
              {data.week.map((d) => (
                <li key={d.date} className={`week-day${d.date === today ? " today" : ""}`}>
                  <span className="week-date">
                    <b>{weekday(d.date)}</b>
                    <span>{d.date === today ? t("schedules.week.today") : day(d.date)}</span>
                  </span>
                  {d.runs.length ? (
                    <ul className="week-runs">
                      {d.runs.map((r) => (
                        <li key={`${r.scheduleId}-${r.at}`} className="week-run" title={dateTime(r.at)}>
                          <b>{time(r.at)}</b>
                          <span>{r.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="week-empty">{t("schedules.week.none")}</span>
                  )}
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={t("schedules.list.title")}>
            <ul className="row-list">
              {schedules.map((s) => {
                const name = s.name || s.connectionNames.join(", ");
                return (
                  <li key={s.id} className={`row${!s.isLegacy && !s.enabled ? " muted-row" : ""}`}>
                    <span className="row-main">
                      <span className="row-title">
                        {name}
                        {s.isLegacy ? <Chip tone="warn">{t("schedules.legacy.chip")}</Chip> : <Chip tone={s.enabled ? "ok" : ""}>{s.enabled ? t("schedules.statusActive") : t("schedules.statusPaused")}</Chip>}
                      </span>
                      {s.isLegacy ? (
                        <span className="row-secondary">
                          {t("schedules.legacy.interval", { hours: s.intervalHours ?? 0 })} · {t("schedules.legacy.warning")} {t("schedules.legacy.hint")}
                        </span>
                      ) : (
                        <>
                          <span className="row-secondary">{cadence(s, i18n)}</span>
                          <span className="row-secondary">
                            {s.connectionNames.join(", ")}
                            {s.enabled && s.nextRunAt && ` · ${t("schedules.next", { when: dateTime(s.nextRunAt) })}`}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="row-actions">
                      {!s.isLegacy && (
                        <IconButton label={`${s.enabled ? t("schedules.disable") : t("schedules.enable")}: ${name}`} onClick={() => void act(() => api.toggleSchedule(s.id))}>
                          {s.enabled ? <FiToggleRight aria-hidden="true" /> : <FiToggleLeft aria-hidden="true" />}
                        </IconButton>
                      )}
                      <EditLink href={`/schedules/${s.id}/edit`} name={name} />
                      <ConfirmButton label={`${t("common.delete")}: ${name}`} question={t("schedules.deleteConfirm")} onConfirm={() => void act(() => api.deleteSchedule(s.id))} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
