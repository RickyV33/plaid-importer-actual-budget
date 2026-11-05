import type { FastifyReply, FastifyRequest } from "fastify";

/** Check the configured origin, never attacker-controlled Host/forwarded headers. */
export function originGuard(appUrl: string) {
  const expected = new URL(appUrl).origin;
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    if (req.headers.origin !== expected || req.headers["sec-fetch-site"] === "cross-site") {
      reply.code(403).send({ error: "invalid_origin" });
    }
  };
}
