// Where a bank's OAuth flow sends the browser back: re-open the same Link
// session with the stored token, finish the exchange, then go to Connections.

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Notice, PageIntro } from "../components/layout";
import { errorText } from "../errors";
import { useI18n } from "../i18n";
import { openLink, TOKEN_KEY } from "../plaid";
import { navigate } from "../router";

export function OAuthReturn() {
  const { t } = useI18n();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Strict mode runs effects twice in dev; Link must open once.
    if (started.current) return;
    started.current = true;
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(TOKEN_KEY);
    } catch {}
    if (!token) {
      setProblem(t("oauth.expired"));
      return;
    }
    openLink(token, { receivedRedirectUri: location.href })
      .then(async (publicToken) => {
        if (publicToken) await api.exchange(publicToken);
        navigate("/connections", { replace: true });
      })
      .catch((e: unknown) => setProblem(e instanceof ApiError ? errorText(t, e.code) : t("home.plaidExited", { msg: (e as Error).message })));
  }, [t]);

  return (
    <>
      <PageIntro eyebrow={t("connections.eyebrow")} title={t("oauth.title")} description={t("oauth.description")} />
      {problem && (
        <Notice tone="error">
          <span>{problem}</span>
          <a href="/connections">{t("oauth.back")}</a>
        </Notice>
      )}
    </>
  );
}
