import { test } from "node:test";
import assert from "node:assert/strict";

import { decideRegistration } from "./auth.js";

const base = {
  username: "alice",
  password: "pw",
  submittedSecret: "",
  expectedSecret: undefined as string | undefined,
  usernameTaken: false,
};

test("first-user bootstrap: open registration, first user is admin", () => {
  const d = decideRegistration({ ...base, usersExist: false });
  assert.deepEqual(d, { ok: true, role: "admin" });
});

test("gated: once users exist, missing/wrong secret is rejected with 403", () => {
  assert.deepEqual(
    decideRegistration({ ...base, usersExist: true, expectedSecret: "letmein", submittedSecret: "" }),
    { ok: false, status: 403, error: "register.errSecret" },
  );
  assert.deepEqual(
    decideRegistration({ ...base, usersExist: true, expectedSecret: "letmein", submittedSecret: "nope" }),
    { ok: false, status: 403, error: "register.errSecret" },
  );
});

test("gated: no secret configured means nobody can register", () => {
  const d = decideRegistration({ ...base, usersExist: true, expectedSecret: undefined, submittedSecret: "anything" });
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.status, 403);
});

test("gated: correct secret creates a member", () => {
  const d = decideRegistration({
    ...base,
    usersExist: true,
    expectedSecret: "letmein",
    submittedSecret: "letmein",
  });
  assert.deepEqual(d, { ok: true, role: "member" });
});

test("missing username or password is a 400", () => {
  assert.equal(decideRegistration({ ...base, usersExist: false, username: "" }).ok, false);
  assert.equal(decideRegistration({ ...base, usersExist: false, password: "" }).ok, false);
});

test("duplicate username is a 409 (even with a valid secret)", () => {
  const d = decideRegistration({
    ...base,
    usersExist: true,
    expectedSecret: "letmein",
    submittedSecret: "letmein",
    usernameTaken: true,
  });
  assert.deepEqual(d, { ok: false, status: 409, error: "register.errTaken" });
});
