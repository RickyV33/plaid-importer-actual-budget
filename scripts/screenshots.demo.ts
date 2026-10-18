// Demo view data for scripts/screenshots.ts: the same shapes the routes pass to
// each template, filled with made-up banks, budgets, and runs.

export type DemoPage = { name: string; template: string; url: string; data: Record<string, unknown> };

export function demoPages(now: number): DemoPage[] {
  const signedIn = { title: "plaid-importer", authed: true, isAdmin: true };
  void now;
  return [
    { name: "login", template: "login", url: "/login", data: { title: "plaid-importer", authed: false, next: "/" } },
    { name: "register", template: "register", url: "/register", data: { title: "plaid-importer", authed: false, usersExist: true } },
    { name: "_signed-in-shell", template: "oauth_return", url: "/connections", data: { ...signedIn } },
  ];
}
