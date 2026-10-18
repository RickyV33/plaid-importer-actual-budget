// Create or edit a profile: which Actual server and budget it points at. The
// budget list loads from the server details; the Sync ID can also be typed.
// Secrets are never sent back to the page: blank password fields keep (or, on a
// new profile, fall back to) the stored ones.

import { useEffect, useState, type FormEvent } from "react";
import { FiCheck, FiDownload } from "react-icons/fi";
import { api, ApiError } from "../api";
import { Notice, PageIntro } from "../components/layout";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { navigate } from "../router";
import { useData } from "../useData";

type Budget = { syncId: string; name: string };

export function ProfileForm({ id }: { id: string | null }) {
  const { t } = useI18n();
  const form = useData(() => api.profileForm(id), [id]);
  const editing = form.data?.profile ?? null;

  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [serverPassword, setServerPassword] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [manual, setManual] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState<"idle" | "loading" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill the fields once the form data arrives.
  useEffect(() => {
    if (!form.data) return;
    const p = form.data.profile;
    setName(p?.name ?? "");
    setServerUrl(p?.serverUrl ?? form.data.defaults.serverUrl);
    setBudgetId(p?.budgetId ?? "");
    // A new profile on the configured server can list budgets right away.
    if (!p && form.data.defaults.serverUrl && form.data.defaults.hasServerPassword) void loadBudgets(form.data.defaults.serverUrl, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data]);

  async function loadBudgets(url = serverUrl, password = serverPassword) {
    if (!url) return;
    setBudgetStatus("loading");
    try {
      setBudgets((await api.budgets(url, password)).budgets);
      setBudgetStatus("idle");
    } catch {
      setBudgetStatus("error");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    const body = { name, serverUrl, budgetId, serverPassword, encryptionPassword };
    try {
      if (editing) await api.updateProfile(editing.id, body);
      else await api.createProfile(body);
      navigate("/profiles");
    } catch (err) {
      setProblem(errorText(t, err instanceof ApiError ? err.code : "network"));
      setSaving(false);
    }
  }

  const title = id === null ? t("profile.newTitle") : t("profile.editTitle");
  if (form.error) return <Notice tone="error">{errorText(t, form.error)}</Notice>;
  if (!form.data) return null;

  // The stored budget stays selectable before the list loads (and if it's missing from it).
  const options: Budget[] = budgets ?? [];
  const showCurrent = budgetId && !options.some((b) => b.syncId === budgetId);

  return (
    <>
      <PageIntro eyebrow={t("profiles.eyebrow")} title={title} description={t("profiles.formLede")} />
      <section className="panel form-panel">
        {problem && <Notice tone="error">{problem}</Notice>}
        <form onSubmit={submit}>
          <label>
            {t("profile.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>

          <fieldset>
            <legend>{t("profile.serverDetails")}</legend>
            <div className="field-row">
              <label>
                {t("profile.serverUrl")}
                <input type="url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://budget.example.com" required spellCheck={false} />
              </label>
              <label>
                {t("profile.serverPassword")}
                <input
                  type="password"
                  value={serverPassword}
                  onChange={(e) => setServerPassword(e.target.value)}
                  onBlur={() => !editing && serverUrl && serverPassword && void loadBudgets()}
                  autoComplete="off"
                  required={!editing && !form.data.defaults.hasServerPassword}
                />
                {editing ? (
                  <span className="field-hint">{t("profile.keepBlank")}</span>
                ) : (
                  form.data.defaults.hasServerPassword && <span className="field-hint">{t("profile.serverPwDefault")}</span>
                )}
              </label>
            </div>
          </fieldset>

          <label>
            {t("profile.budgetId")}
            {manual ? (
              <input value={budgetId} onChange={(e) => setBudgetId(e.target.value)} required spellCheck={false} className="mono" />
            ) : (
              <span className="input-row">
                <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)} required>
                  <option value="">{budgets ? t("profile.chooseBudget") : t("profile.loadBudgetsFirst")}</option>
                  {showCurrent && <option value={budgetId}>{budgetId}</option>}
                  {options.map((b) => (
                    <option key={b.syncId} value={b.syncId}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="secondary" onClick={() => void loadBudgets()} disabled={!serverUrl || budgetStatus === "loading"}>
                  <FiDownload aria-hidden="true" />
                  {t("profile.loadBudgets")}
                </button>
              </span>
            )}
            <span className="field-hint">
              {budgetStatus === "loading" && t("profile.budgetsLoading")}
              {budgetStatus === "error" && t("profile.budgetsError")}{" "}
              <button type="button" className="text-button" onClick={() => setManual(!manual)}>
                {manual ? t("profiles.pickFromList") : t("profile.enterManually")}
              </button>
            </span>
          </label>

          <label>
            {t("profile.encPassword")}
            <input type="password" value={encryptionPassword} onChange={(e) => setEncryptionPassword(e.target.value)} autoComplete="off" />
            <span className="field-hint">{editing ? t("profile.encHelpEdit") : t("profile.encHelp")}</span>
          </label>

          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              <FiCheck aria-hidden="true" />
              {editing ? t("common.save") : t("profile.create")}
            </button>
            <a className="secondary" href="/profiles">
              {t("common.cancel")}
            </a>
          </div>
        </form>
      </section>
    </>
  );
}
