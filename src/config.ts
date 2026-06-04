import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  APP_PORT: z.coerce.number().int().positive().default(8080),
  APP_BIND: z.string().default("0.0.0.0"),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  APP_USER: z.string().min(1),
  APP_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),

  LOGIN_RATELIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATELIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PLAID_COUNTRY_CODES: z.string().default("US"),
  PLAID_LANGUAGE: z.string().default("en"),
  PLAID_PRODUCTS: z.string().default("transactions"),
  PLAID_REDIRECT_URI: z.string().url().optional().or(z.literal("")),

  // Optional defaults the New-profile form pre-fills (blank server password on
  // the form falls back to ACTUAL_SERVER_PASSWORD). Budgets are chosen per
  // profile in the UI, so there is no server-wide budget/encryption setting.
  ACTUAL_SERVER_URL: z.string().optional().default(""),
  ACTUAL_SERVER_PASSWORD: z.string().optional().default(""),

  DATABASE_PATH: z.string().default("./data/plaid-importer.db"),
  ACTUAL_CACHE_DIR: z.string().default("./data/actual-cache"),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // SSRF guard for profile server URLs. Off by default because the Actual server
  // is usually self-hosted on the same LAN. Set to "true" only when exposing
  // registration to less-trusted users who shouldn't reach internal hosts.
  BLOCK_PRIVATE_ACTUAL_HOSTS: z.string().default("false"),
});

export type Config = z.infer<typeof schema> & {
  countryCodes: string[];
  products: string[];
  redirectUri: string | undefined;
  encryptionKeyBytes: Buffer;
  blockPrivateActualHosts: boolean;
};

function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    process.stderr.write(`Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }

  const env = parsed.data;

  const keyBytes = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
  if (keyBytes.length !== 32) {
    process.stderr.write(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${keyBytes.length}). ` +
        `Generate with: openssl rand -base64 32\n`,
    );
    process.exit(1);
  }

  const redirectUri =
    env.PLAID_REDIRECT_URI && env.PLAID_REDIRECT_URI.length > 0
      ? env.PLAID_REDIRECT_URI
      : undefined;

  return {
    ...env,
    countryCodes: env.PLAID_COUNTRY_CODES.split(",").map((s) => s.trim()).filter(Boolean),
    products: env.PLAID_PRODUCTS.split(",").map((s) => s.trim()).filter(Boolean),
    redirectUri,
    encryptionKeyBytes: keyBytes,
    blockPrivateActualHosts: env.BLOCK_PRIVATE_ACTUAL_HOSTS === "true",
  };
}

export const config = loadConfig();
