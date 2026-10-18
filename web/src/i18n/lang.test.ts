import { test } from "node:test";
import assert from "node:assert/strict";

import { initialLang } from "./lang";

test("initialLang: a supported cookie wins over the browser", () => {
  assert.equal(initialLang("sid=x; lang=es", ["en-US"]), "es");
});

test("initialLang: else the first supported browser language, else English", () => {
  assert.equal(initialLang("lang=fr", ["fr-FR", "es-MX", "en"]), "es");
  assert.equal(initialLang("", ["de-DE"]), "en");
});
