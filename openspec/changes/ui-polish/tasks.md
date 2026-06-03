## 1. Markup

- [ ] 1.1 In `src/views/home.eta`, add a profile-level "select all" checkbox in each profile group header with a `data-profile-id` attribute.
- [ ] 1.2 Always render the "show pending" control slot for each account row (visible/enabled when mapped, spaced-but-inert when unmapped) so columns are consistent.

## 2. Behavior

- [ ] 2.1 Add a client-side handler (mirroring the existing per-item select-all) that toggles all `.account-check[data-profile-id="…"]` boxes within the profile, scoped so it never crosses profile groups.

## 3. Styling

- [ ] 3.1 In `public/style.css`, give the account table fixed/aligned columns for "Mapped to" and "show pending" so they line up across all rows and institutions (right-align or fixed widths).

## 4. Verify

- [ ] 4.1 Manually verify with a profile containing both mapped and unmapped accounts that the columns align and the profile select-all toggles only that profile's accounts.
