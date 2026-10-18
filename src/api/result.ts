// What a write returns: success with its payload, or an HTTP status and the
// catalog key of the error message to show.

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

export const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
