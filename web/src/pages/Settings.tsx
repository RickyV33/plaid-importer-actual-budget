// Admin settings: who may register, how often a bank may be pulled, how much
// history a new link asks for, and every user's profiles.

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FiCheck, FiEye, FiEyeOff } from "react-icons/fi";
import { api, ApiError, type SettingsView } from "../api";
import { Notice, PageIntro, Panel } from "../components/layout";
import { ConfirmButton, IconButton } from "../components/Row";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { useData } from "../useData";

export function Settings() {
  const { t } = useI18n();
  const { data, error, set, reload } = useData(api.settings);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /** Saves one panel; the server answers with the settings as they now stand. */
  async function save(write: () => Promise<SettingsView>): Promise<boolean> {
    setNotice(null);
    try {
      set(await write());
      setNotice({ tone: "ok", text: t("settings.saved") });
      return true;
    } catch (e) {
      setNotice({ tone: "error", text: errorText(t, e instanceof ApiError ? e.code : "network", { min: data?.minHistoryDays ?? 0, max: data?.maxHistoryDays ?? 0 }) });
      return false;
    }
  }

  return (
    <>
      <PageIntro eyebrow={t("settings.eyebrow")} title={t("settings.title")} description={t("settings.lede")} />
      {error && <Notice tone="error">{errorText(t, error)}</Notice>}
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)} dismissLabel={t("shell.dismiss")}>
          {notice.text}
        </Notice>
      )}
      {data && (
        <div className="stack">
          <Secret settings={data} save={save} />
          <div className="two-col">
            <SyncLimit settings={data} save={save} />
            <InitialHistory settings={data} save={save} />
          </div>
          <AllProfiles settings={data} onDeleted={() => void reload()} onError={(text) => setNotice({ tone: "error", text })} />
        </div>
      )}
    </>
  );
}

type PanelProps = { settings: SettingsView; save: (write: () => Promise<SettingsView>) => Promise<boolean> };

function SaveButton() {
  const { t } = useI18n();
  return (
    <button type="submit" className="secondary">
      <FiCheck aria-hidden="true" />
      {t("common.save")}
    </button>
  );
}

function SettingsForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <SaveButton />
    </form>
  );
}

function Secret({ settings, save }: PanelProps) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const [next, setNext] = useState("");
  return (
    <Panel title={t("settings.regSecret")} description={t("settings.regSecretHelp")}>
      {settings.currentSecret ? (
        <label className="spaced">
          {t("settings.currentSecret")}
          <span className="input-row">
            <input type={shown ? "text" : "password"} value={settings.currentSecret} readOnly onFocus={(e) => e.target.select()} className="mono" />
            <IconButton label={t("settings.showHide")} onClick={() => setShown(!shown)}>
              {shown ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
            </IconButton>
          </span>
        </label>
      ) : (
        <Notice tone="warn">{t("settings.noSecret")}</Notice>
      )}
      <SettingsForm onSubmit={() => void save(() => api.setRegistrationSecret(next)).then((ok) => ok && setNext(""))}>
        <label>
          {settings.currentSecret ? t("settings.changeSecret") : t("settings.setSecret")}
          <input value={next} onChange={(e) => setNext(e.target.value)} autoComplete="off" required />
        </label>
      </SettingsForm>
    </Panel>
  );
}

function SyncLimit({ settings, save }: PanelProps) {
  const { t } = useI18n();
  const [max, setMax] = useState(settings.syncMax);
  const [hours, setHours] = useState(settings.syncWindowHours);
  useEffect(() => {
    setMax(settings.syncMax);
    setHours(settings.syncWindowHours);
  }, [settings.syncMax, settings.syncWindowHours]);
  return (
    <Panel title={t("settings.syncLimit")} description={t("settings.syncLimitHelp")}>
      <SettingsForm onSubmit={() => void save(() => api.setSyncLimit(max, hours))}>
        <div className="field-row">
          <label>
            {t("settings.syncMax")}
            <input type="number" min={0} step={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <label>
            {t("settings.syncWindow")}
            <input type="number" min={0} step={1} value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
        </div>
      </SettingsForm>
    </Panel>
  );
}

function InitialHistory({ settings, save }: PanelProps) {
  const { t } = useI18n();
  const [days, setDays] = useState(String(settings.initialHistoryDays));
  useEffect(() => setDays(String(settings.initialHistoryDays)), [settings.initialHistoryDays]);
  const range = { min: settings.minHistoryDays, max: settings.maxHistoryDays };
  return (
    <Panel title={t("settings.initialHistory")} description={t("settings.initialHistoryHelp")}>
      <SettingsForm onSubmit={() => void save(() => api.setInitialHistory(days))}>
        <label>
          {t("settings.initialHistoryDays", range)}
          <input type="number" min={range.min} max={range.max} step={1} value={days} onChange={(e) => setDays(e.target.value)} required />
          <span className="field-hint">
            {t("settings.initialHistoryScope")} {t("settings.initialHistoryBilling")}
          </span>
        </label>
      </SettingsForm>
    </Panel>
  );
}

function AllProfiles({ settings, onDeleted, onError }: { settings: SettingsView; onDeleted: () => void; onError: (text: string) => void }) {
  const { t } = useI18n();
  return (
    <Panel title={t("settings.allProfiles")} description={t("settings.allProfilesHelp")}>
      {settings.allProfiles.length === 0 ? (
        <p className="muted small">{t("settings.noProfiles")}</p>
      ) : (
        <ul className="row-list">
          {settings.allProfiles.map((p) => (
            <li key={p.id} className="row">
              <span className="row-main">
                <span className="row-title">
                  {p.name} <span className="chip">{p.owner}</span>
                </span>
                <span className="row-secondary mono">
                  {p.serverUrl} · {p.budgetId}
                </span>
              </span>
              <span className="row-actions">
                <ConfirmButton
                  label={`${t("common.delete")}: ${p.name}`}
                  question={t("settings.deleteProfileConfirm")}
                  onConfirm={() =>
                    void api.adminDeleteProfile(p.id).then(onDeleted, (e: unknown) => onError(errorText(t, e instanceof ApiError ? e.code : "network")))
                  }
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
