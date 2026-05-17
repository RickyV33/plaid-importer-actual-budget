import bcrypt from "bcrypt";

import { config } from "../config.js";

let passwordHash: string | undefined;

export async function initCredentials(): Promise<void> {
  passwordHash = await bcrypt.hash(config.APP_PASSWORD, 12);
}

export async function verify(username: string, password: string): Promise<boolean> {
  if (passwordHash === undefined) {
    throw new Error("credentials not initialized");
  }
  if (username !== config.APP_USER) {
    await bcrypt.compare(password, passwordHash);
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
