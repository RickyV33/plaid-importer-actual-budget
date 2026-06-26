ALTER TABLE plaid_accounts ADD COLUMN persistent_account_id TEXT;

CREATE INDEX idx_plaid_accounts_persistent
  ON plaid_accounts(item_id, persistent_account_id);
