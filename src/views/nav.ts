// The primary pages, in tab order, and which one a request path belongs to.

export type Tab = { id: string; href: string; adminOnly?: boolean };

export const TABS: Tab[] = [
  { id: "overview", href: "/" },
  { id: "connections", href: "/connections" },
  { id: "profiles", href: "/profiles" },
  { id: "schedules", href: "/schedules" },
  { id: "history", href: "/history" },
  { id: "settings", href: "/settings", adminOnly: true },
];

/** The tab a path falls under (sub-pages like /profiles/3/edit count), or null. */
export function activeTab(path: string | undefined): string | null {
  const p = (path ?? "").split("?")[0]!;
  if (p === "/") return "overview";
  for (const tab of TABS) {
    if (tab.href !== "/" && (p === tab.href || p.startsWith(tab.href + "/"))) return tab.id;
  }
  return null;
}
