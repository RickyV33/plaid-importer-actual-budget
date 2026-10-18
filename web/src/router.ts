// Client routing over the History API, on the shared page table (src/pages.ts).
// Same-origin links that land on an app page switch pages without a reload.

import { useEffect, useState } from "react";
import { matchPage, type PageMatch } from "../../src/pages";

const listeners = new Set<() => void>();

export function navigate(to: string, { replace = false } = {}): void {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  scrollTo(0, 0);
  listeners.forEach((l) => l());
}

/** Whether a click on this link should be handled in the app rather than by the browser. */
export function inAppHref(href: string, origin: string, opts: { target?: string; download?: boolean; modified?: boolean }): string | null {
  if (opts.modified || opts.download || (opts.target && opts.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !matchPage(url.pathname)) return null;
  return url.pathname + url.search;
}

export type Route = PageMatch & { path: string; search: URLSearchParams };

function current(): Route | null {
  const m = matchPage(location.pathname);
  return m ? { ...m, path: location.pathname, search: new URLSearchParams(location.search) } : null;
}

/** The current page; re-renders on navigation and back/forward. */
export function useRoute(): Route | null {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => setRoute(current());
    listeners.add(on);
    addEventListener("popstate", on);
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest("a");
      if (!a) return;
      const to = inAppHref(a.getAttribute("href") ?? "", location.origin, {
        target: a.target,
        download: a.hasAttribute("download"),
        modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
      });
      if (!to) return;
      e.preventDefault();
      navigate(to);
    };
    document.addEventListener("click", click);
    return () => {
      listeners.delete(on);
      removeEventListener("popstate", on);
      document.removeEventListener("click", click);
    };
  }, []);
  return route;
}
