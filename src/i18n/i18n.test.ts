import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveLocale, translator } from "./index.js";
import { en } from "./en.js";
import { es } from "./es.js";

test("catalogs: en and es have identical key sets", () => {
  const enKeys = Object.keys(en).sort();
  const esKeys = Object.keys(es).sort();
  const missingInEs = enKeys.filter((k) => !(k in es));
  const missingInEn = esKeys.filter((k) => !(k in en));
  assert.deepEqual(missingInEs, [], `keys missing in es: ${missingInEs.join(", ")}`);
  assert.deepEqual(missingInEn, [], `keys missing in en: ${missingInEn.join(", ")}`);
});

test("resolveLocale: picks the best supported language", () => {
  assert.equal(resolveLocale("es-ES,es;q=0.9,en;q=0.8"), "es");
  assert.equal(resolveLocale("en-US,en;q=0.9"), "en");
  assert.equal(resolveLocale("fr-FR,fr;q=0.9"), "en"); // unsupported → default
  assert.equal(resolveLocale(undefined), "en");
  assert.equal(resolveLocale(""), "en");
});

test("resolveLocale: honors quality ordering", () => {
  // English higher quality than Spanish → en wins.
  assert.equal(resolveLocale("es;q=0.3,en;q=0.9"), "en");
});

test("translator: returns localized strings with English fallback", () => {
  assert.equal(translator("es")("login.title"), "Iniciar sesión");
  assert.equal(translator("en")("login.title"), "Sign in");
  // missing key returns the key itself rather than blank
  assert.equal(translator("es")("totally.missing.key"), "totally.missing.key");
});

test("translator: interpolates params", () => {
  assert.equal(translator("en")("home.budget", { id: "abc" }), "budget abc");
  assert.equal(translator("es")("home.skippedItem", { name: "Chase", minutes: 5 }), "Chase (reintenta en ~5 min)");
});
