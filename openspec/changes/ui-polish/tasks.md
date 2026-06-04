## 1. Tabs

- [x] 1.1 In `src/views/home.eta`, wrap the Connections and Profiles sections in a simple tab structure (two tab buttons near the top + two panels).
- [x] 1.2 Add client-side tab switching (show/hide panels, remember the active tab e.g. via `location.hash` or `sessionStorage`).
- [x] 1.3 Style tabs in `public/style.css`.

## 2. Select-all

- [x] 2.1 Add a profile-scoped "select all" control (and keep/replace the connections-list select-all) that toggles all relevant account checkboxes, scoped so it never crosses groups.

## 3. Custom checkbox

- [x] 3.1 Add a larger, higher-contrast custom checkbox style in `public/style.css` and apply it to the sync-selection and pending checkboxes.

## 4. Pending tooltip

- [x] 4.1 Restore the "show pending" tooltip (the on/off explanation copy that existed before the profiles rewrite) on the pending checkbox/label in `home.eta`, and keep the title text in sync when toggled.

## 5. Column alignment

- [x] 5.1 Render "Mapped to" and "show pending" in consistent aligned columns across all rows (reserve the pending slot when unmapped) via `public/style.css`.

## 6. Settings secret reveal

- [x] 6.1 In `src/views/settings.eta`, render the current registration secret as a password-type field (obfuscated) with an eye-toggle button that shows/hides the value client-side.

## 7. Spacing

- [x] 7.1 Add padding below the "New profile" button / general spacing pass on the profiles header in `public/style.css`.

## 8. Verify

- [ ] 8.1 Manually verify (needs your eyes in a browser): tabs switch; select-all is scoped; checkboxes are clearly visible; pending tooltip shows; columns align across mapped/unmapped rows; secret hides/reveals; spacing looks right.
