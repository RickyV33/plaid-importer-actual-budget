// Every page URL of the signed-in app, in one table: the server answers each
// with the app's shell, and the app's router uses it to pick the page. Kept
// free of server imports so the browser bundle can import it.

export const PAGES = {
  overview: "/",
  connections: "/connections",
  profiles: "/profiles",
  profileNew: "/profiles/new",
  profileEdit: "/profiles/:id/edit",
  schedules: "/schedules",
  scheduleNew: "/schedules/new",
  scheduleEdit: "/schedules/:id/edit",
  history: "/history",
  settings: "/settings",
  oauthReturn: "/link/oauth-return",
} as const;

export type PageId = keyof typeof PAGES;
export type PageMatch = { page: PageId; params: Record<string, string> };

/** The page a path (query string allowed) belongs to, or null. */
export function matchPage(path: string): PageMatch | null {
  const parts = segments(path);
  for (const [page, pattern] of Object.entries(PAGES) as [PageId, string][]) {
    const want = segments(pattern);
    if (want.length !== parts.length) continue;
    const params = matchSegments(want, parts);
    if (params) return { page, params };
  }
  return null;
}

function matchSegments(want: string[], parts: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    if (w.startsWith(":")) params[w.slice(1)] = decodeURIComponent(parts[i]!);
    else if (w !== parts[i]) return null;
  }
  return params;
}

/** The URL of a page, with its parameters filled in. */
export function pageUrl(page: PageId, params: Record<string, string | number> = {}): string {
  return PAGES[page].replace(/:(\w+)/g, (_m, name: string) => encodeURIComponent(String(params[name] ?? "")));
}

function segments(path: string): string[] {
  return (path.split("?")[0] ?? "").split("/").filter(Boolean);
}
