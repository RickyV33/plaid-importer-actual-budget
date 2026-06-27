## 1. i18n

- [ ] 1.1 Confirm `home.manageAccounts` reads well as an icon `aria-label`/`title` in `src/i18n/en.ts` and `src/i18n/es.ts`; adjust wording if needed
- [ ] 1.2 Confirm catalog parity test passes (`src/i18n/i18n.test.ts`)

## 2. Connections view

- [ ] 2.1 In `src/views/connections.eta`, change `.manage-accounts-btn` from a text button to an `.icon-btn` using `fa-list-check`, with `aria-label`/`title` from `home.manageAccounts`
- [ ] 2.2 Keep the unlink `.remove-btn` as an icon with `fa-link-slash`, sitting beside the manage-accounts icon
- [ ] 2.3 Verify the existing click handlers still bind (selector/class preserved) and both flows are unchanged
- [ ] 2.4 Adjust `public/style.css` only if needed (reuse `.icon-btn` / `.row-actions`)

## 3. Verify

- [ ] 3.1 Run `npm test` in the dev container and confirm green
- [ ] 3.2 Manually verify: manage-accounts shows as a labeled icon, opens Plaid account selection; unlink icon still works; actions hover-reveal consistently with other pages
- [ ] 3.3 Per-change `mental-model.html` delta created for this change
