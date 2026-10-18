// Create or edit a schedule: which banks, which days, what time, how often.

import { useEffect, useState, type FormEvent } from "react";
import { FiCheck } from "react-icons/fi";
import { api, ApiError } from "../api";
import { Notice, PageIntro } from "../components/layout";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { navigate } from "../router";
import { useData } from "../useData";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every zone the browser knows, with the current one guaranteed present. */
function zones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return all.includes(current) ? all : [current, ...all];
}

export function ScheduleForm({ id }: { id: string | null }) {
  const { t } = useI18n();
  const form = useData(() => api.scheduleForm(id), [id]);

  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [timezone, setTimezone] = useState(browserZone());
  const [banks, setBanks] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = form.data?.prefill;
    if (!p) return;
    setName(p.name);
    setDays(p.daysOfWeek);
    setTimeOfDay(p.timeOfDay);
    setRepeatWeeks(p.repeatWeeks);
    if (p.timezone) setTimezone(p.timezone);
    setBanks(p.checkedItemIds);
  }, [form.data]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    const body = { name, daysOfWeek: [...days].sort(), timeOfDay, repeatWeeks, timezone, plaidItemIds: banks };
    try {
      if (form.data?.scheduleId) await api.updateSchedule(form.data.scheduleId, body);
      else await api.createSchedule(body);
      navigate("/schedules");
    } catch (err) {
      setProblem(errorText(t, err instanceof ApiError ? err.code : "network"));
      setSaving(false);
    }
  }

  if (form.error) return <Notice tone="error">{errorText(t, form.error)}</Notice>;
  if (!form.data) return null;
  const editing = form.data.scheduleId !== null;

  return (
    <>
      <PageIntro eyebrow={t("schedules.eyebrow")} title={editing ? t("schedules.edit") : t("schedules.new")} description={t("schedules.newDesc")} />
      <section className="panel form-panel">
        {problem && <Notice tone="error">{problem}</Notice>}
        <form onSubmit={submit}>
          <label>
            {t("schedules.name")}
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t("schedules.namePlaceholder")} />
          </label>

          <fieldset>
            <legend>{t("schedules.connections")}</legend>
            {form.data.connections.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={banks.includes(c.id)} onChange={() => setBanks(toggle(banks, c.id))} />
                {c.name}
              </label>
            ))}
            <span className="field-hint">{t("schedules.tip")}</span>
          </fieldset>

          <fieldset>
            <legend>{t("schedules.days")}</legend>
            <div className="segmented" role="group" aria-label={t("schedules.days")}>
              {DAY_KEYS.map((key, d) => (
                <label key={key}>
                  <input type="checkbox" checked={days.includes(d)} onChange={() => setDays(toggle(days, d))} />
                  <span>{t(`schedules.day.${key}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-row">
            <label>
              {t("schedules.timeOfDay")}
              <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} required />
            </label>
            <label>
              {t("schedules.repeatLabel")}
              <span className="input-row">
                <input type="number" className="short" min={1} max={52} value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))} required />
                <span className="muted small">{t("schedules.repeatWeeksUnit")}</span>
              </span>
            </label>
          </div>

          <label>
            {t("schedules.timezone")}
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} required>
              {zones(timezone).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <span className="field-hint">{t("schedules.timezoneHelp")}</span>
          </label>

          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              <FiCheck aria-hidden="true" />
              {editing ? t("schedules.save") : t("schedules.create")}
            </button>
            <a className="secondary" href="/schedules">
              {t("common.cancel")}
            </a>
          </div>
        </form>
      </section>
    </>
  );
}
