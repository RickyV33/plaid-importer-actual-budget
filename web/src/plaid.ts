// Plaid Link: loads Plaid's script once and opens Link with a token. The token
// is kept in sessionStorage so the OAuth return page can re-open the same
// session after the bank redirects back.

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
export const TOKEN_KEY = "plaidLinkToken";

type PlaidError = { error_message?: string; display_message?: string; error_code?: string } | null;
type Handler = { open: () => void; destroy?: () => void };
type PlaidGlobal = {
  create: (opts: {
    token: string;
    receivedRedirectUri?: string;
    onSuccess: (publicToken: string) => void;
    onExit: (err: PlaidError) => void;
  }) => Handler;
};

let loading: Promise<PlaidGlobal> | null = null;

function loadPlaid(): Promise<PlaidGlobal> {
  const existing = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve((window as unknown as { Plaid: PlaidGlobal }).Plaid);
    s.onerror = () => {
      loading = null;
      reject(new Error("plaid_script_failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** The message Plaid gives for an exit, if it was an error. */
export function plaidExitMessage(err: PlaidError): string | null {
  if (!err) return null;
  return err.display_message || err.error_message || err.error_code || "unknown";
}

/**
 * Opens Link. Resolves with the public token on success, or null when the
 * viewer closes it; rejects with Plaid's message when Link exits with an error.
 */
export async function openLink(token: string, opts: { receivedRedirectUri?: string } = {}): Promise<string | null> {
  const plaid = await loadPlaid();
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage, an OAuth bank can't hand the session back; others still work.
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {}
    };
    plaid
      .create({
        token,
        ...(opts.receivedRedirectUri ? { receivedRedirectUri: opts.receivedRedirectUri } : {}),
        onSuccess: (publicToken) => {
          done();
          resolve(publicToken);
        },
        onExit: (err) => {
          done();
          const msg = plaidExitMessage(err);
          if (msg) reject(new Error(msg));
          else resolve(null);
        },
      })
      .open();
  });
}
