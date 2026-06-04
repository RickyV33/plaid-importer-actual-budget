import { config } from "../config.js";
import { encrypt } from "../crypto/tokens.js";
import {
  accountMappings,
  plaidAccounts,
  profileAccountMappings,
  profileItemDelivery,
  profiles,
  users,
} from "../db/queries.js";

/**
 * Idempotent boot seed: if no profiles exist, create a "Default" profile from
 * the ACTUAL_* env vars (owned by the first admin) and fold every existing
 * account_mappings row into it. Existing item cursors are untouched, so the
 * next sync continues seamlessly into Default. No-op once any profile exists.
 */
export function seedDefaultProfile(): void {
  if (profiles.count() > 0) return;
  const admin = users.firstAdmin();
  if (!admin) return;
  if (!config.ACTUAL_SERVER_URL || !config.ACTUAL_SERVER_PASSWORD || !config.ACTUAL_SYNC_ID) {
    return;
  }

  const profileId = profiles.create({
    ownerUserId: admin.id,
    name: "Default",
    serverUrl: config.ACTUAL_SERVER_URL,
    budgetId: config.ACTUAL_SYNC_ID,
    serverPasswordEnc: encrypt(config.ACTUAL_SERVER_PASSWORD),
    encryptionPasswordEnc:
      config.ACTUAL_ENCRYPTION_PASSWORD && config.ACTUAL_ENCRYPTION_PASSWORD.length > 0
        ? encrypt(config.ACTUAL_ENCRYPTION_PASSWORD)
        : null,
  });

  const oldMappings = accountMappings.listAll();
  for (const m of oldMappings) {
    const acct = plaidAccounts.getByPlaidId(m.plaid_account_id);
    if (!acct) continue;
    profileAccountMappings.upsert({
      profileId,
      plaidAccountId: m.plaid_account_id,
      actualAccountId: m.actual_account_id,
      actualAccountName: m.actual_account_name,
    });
    if (m.pending_visible) {
      profileAccountMappings.setPendingVisible(profileId, m.plaid_account_id, true);
    }
    // Journal is empty at seed time; watermark 0 means Default receives all
    // transactions pulled from here on (continuing each item's existing cursor).
    profileItemDelivery.ensure(profileId, acct.item_id, 0);
  }

  process.stdout.write(
    `seeded Default profile (id=${profileId}); folded ${oldMappings.length} mapping(s)\n`,
  );
}
