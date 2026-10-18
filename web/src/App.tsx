// Shell: header tools, tab strip, banners, and page switching.

import { AnimatePresence, m } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { FiLogOut, FiMoon, FiSun } from "react-icons/fi";
import type { PageId } from "../../src/pages";
import { api, type BannerView } from "./api";
import { Notice } from "./components/layout";
import { LANGS, useI18n } from "./i18n";
import { Connections } from "./pages/Connections";
import { History } from "./pages/History";
import { OAuthReturn } from "./pages/OAuthReturn";
import { Overview } from "./pages/Overview";
import { ProfileForm } from "./pages/ProfileForm";
import { Profiles } from "./pages/Profiles";
import { ScheduleForm } from "./pages/ScheduleForm";
import { Schedules } from "./pages/Schedules";
import { Settings } from "./pages/Settings";
import { useRoute, type Route } from "./router";
import { ShellContext } from "./shell";
import { useTheme } from "./theme";
import { useData } from "./useData";

const TABS: { id: string; href: string; section: PageId[]; adminOnly?: boolean }[] = [
  { id: "overview", href: "/", section: ["overview"] },
  { id: "connections", href: "/connections", section: ["connections", "oauthReturn"] },
  { id: "profiles", href: "/profiles", section: ["profiles", "profileNew", "profileEdit"] },
  { id: "schedules", href: "/schedules", section: ["schedules", "scheduleNew", "scheduleEdit"] },
  { id: "history", href: "/history", section: ["history"] },
  { id: "settings", href: "/settings", section: ["settings"], adminOnly: true },
];

function page(route: Route): ReactNode {
  const id = route.params.id ?? null;
  switch (route.page) {
    case "overview":
      return <Overview />;
    case "connections":
      return <Connections />;
    case "oauthReturn":
      return <OAuthReturn />;
    case "profiles":
      return <Profiles />;
    case "profileNew":
    case "profileEdit":
      return <ProfileForm id={id} />;
    case "schedules":
      return <Schedules />;
    case "scheduleNew":
    case "scheduleEdit":
      return <ScheduleForm id={id} />;
    case "history":
      return <History offset={Number(route.search.get("offset") ?? 0) || 0} />;
    case "settings":
      return <Settings />;
  }
}

export function App() {
  const route = useRoute();
  const me = useData(api.me);
  const banners = useData(api.banners);
  const shell = useMemo(() => ({ me: me.data, refreshBanners: () => void banners.reload() }), [me.data, banners.reload]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="shell">
        <Header version={me.data?.version ?? ""} />
        <Tabs current={route?.page ?? null} isAdmin={me.data?.isAdmin ?? false} />
        <Banners banners={banners.data?.banners ?? []} onDismiss={(key) => banners.set({ banners: (banners.data?.banners ?? []).filter((b) => b.key !== key) })} />
        <main>
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={route ? route.path + route.search.toString() : "none"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {route && page(route)}
            </m.div>
          </AnimatePresence>
        </main>
      </div>
    </ShellContext.Provider>
  );
}

function Header({ version }: { version: string }) {
  const { t, lang, setLang } = useI18n();
  const [theme, toggleTheme] = useTheme();
  return (
    <header className="site-head">
      <div className="site-title">
        <h1>
          <a href="/">{t("shell.appName")}</a>
        </h1>
        <span className="site-sub">{t("shell.appSub")}</span>
        {/* Version only: locale-neutral, outside the link. */}
        <span className="app-version">{version}</span>
      </div>
      <div className="site-tools">
        <button type="button" className="pill-button" onClick={toggleTheme} aria-pressed={theme === "dark"}>
          {theme === "dark" ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
          {theme === "dark" ? t("theme.light") : t("theme.dark")}
        </button>
        <label className="lang-select">
          <span className="visually-hidden">{t("lang.label")}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`lang.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <form method="post" action="/logout">
          <button type="submit" className="pill-button">
            <FiLogOut aria-hidden="true" />
            {t("shell.signOut")}
          </button>
        </form>
      </div>
    </header>
  );
}

function Tabs({ current, isAdmin }: { current: PageId | null; isAdmin: boolean }) {
  const { t } = useI18n();
  return (
    <nav className="tabs" aria-label={t("nav.label")}>
      {TABS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => {
        const active = current !== null && tab.section.includes(current);
        return (
          <a key={tab.id} href={tab.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {t(`nav.${tab.id}`)}
          </a>
        );
      })}
    </nav>
  );
}

function Banners({ banners, onDismiss }: { banners: BannerView[]; onDismiss: (key: string) => void }) {
  const { t } = useI18n();
  if (!banners.length) return null;
  return (
    <div className="banners">
      {banners.map((b) => (
        <Notice
          key={b.key}
          tone={b.type === "info" ? "info" : b.type}
          dismissLabel={t("shell.dismiss")}
          onDismiss={() => {
            void api.dismissBanner(b.key).catch(() => {});
            onDismiss(b.key);
          }}
        >
          <span>{t(b.message, { ...b.vars, name: b.vars?.name || t("health.unknownBank") })}</span>
          {b.href && b.link && <a href={b.href}>{t(b.link)}</a>}
        </Notice>
      ))}
    </div>
  );
}
