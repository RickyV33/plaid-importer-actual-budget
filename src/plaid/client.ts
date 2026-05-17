import { Configuration, PlaidApi } from "plaid";

import { config } from "../config.js";

const basePath =
  config.PLAID_ENV === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";

const configuration = new Configuration({
  basePath,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": config.PLAID_CLIENT_ID,
      "PLAID-SECRET": config.PLAID_SECRET,
    },
  },
});

export const plaid = new PlaidApi(configuration);
