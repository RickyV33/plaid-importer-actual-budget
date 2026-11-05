/** Canonical endpoint identity. Credentials and ambiguous URL forms are refused. */
export function endpoint(raw: string, allowHttp = false): string {
  if (/[\\\x00-\x20\x7f]/.test(raw)) throw new Error("Invalid server URL");
  const url = new URL(raw);
  if ((url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid server URL");
  }
  return url.href.replace(/\/$/, "");
}

export function serverPasswordFor(
  serverUrl: string, supplied: string, configuredUrl: string, configuredPassword: string,
): string {
  if (supplied) return supplied;
  if (!configuredUrl) return "";
  try {
    return endpoint(serverUrl) === endpoint(configuredUrl) ? configuredPassword : "";
  } catch {
    return "";
  }
}

/** Bind a deployment session token to the operator's exact configured server. */
export function sessionTokenFor(
  serverUrl: string, configuredUrl: string, token: string, allowHttp = false,
): string | undefined {
  if (!configuredUrl || !token) return undefined;
  try {
    return endpoint(serverUrl, allowHttp) === endpoint(configuredUrl, allowHttp) ? token : undefined;
  } catch { return undefined; }
}
