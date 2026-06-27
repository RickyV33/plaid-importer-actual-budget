## 1. Persistence

- [x] 1.1 Add migration `src/db/migrations/0012_schedule_name.sql` adding nullable `name TEXT` to `schedules`
- [x] 1.2 Add `name` to `ScheduleRow` in `src/db/queries.ts`
- [x] 1.3 Extend `schedules.create` and `schedules.update` to accept and persist an optional `name` (store NULL when blank), with a unit test in `src/db/queries.test.ts`

## 2. Routes

- [x] 2.1 Parse optional `name` (trimmed; blank → undefined) on `POST /schedules` and `POST /schedules/:id/edit` in `src/routes/schedules.ts`
- [x] 2.2 Pass `name` into the list view rows and the edit prefill; compute the title as name-or-connection-names fallback

## 3. i18n

- [x] 3.1 Add name field label/placeholder keys to `src/i18n/en.ts` and `src/i18n/es.ts`
- [x] 3.2 Confirm catalog parity test passes (`src/i18n/i18n.test.ts`)

## 4. Views

- [x] 4.1 Add a name text input to `partials/schedules_form.eta` (used by create and edit), pre-filled on edit
- [x] 4.2 In `src/views/schedules.eta`, render the non-legacy row as three lines: title + status badge / recurrence (days · time · repeat) / connections · next run
- [x] 4.3 Display `time_of_day` in 12-hour `h:mm AM/PM` (locale-appropriate) in the read view; leave the edit input 24-hour
- [x] 4.4 Ensure an unnamed schedule falls back to the joined connection names; legacy rows render unchanged
- [x] 4.5 Adjust `public/style.css` spacing for the multi-line row (reuse `.list-row`/`.badge`)

## 5. Verify

- [x] 5.1 Run `npm test` in the dev container and confirm green
- [ ] 5.2 Manually verify: named + unnamed schedules show correct titles, three-line layout, 12-hour time; create/edit round-trip name; legacy rows unchanged
- [ ] 5.3 Per-change `mental-model.html` delta created for this change
