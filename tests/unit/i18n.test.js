import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCALES, LOCALE_NAMES, getTranslations } from "../../i18n.js";

test("locale resolution: exact, language prefix, English fallback", () => {
    assert.equal(getTranslations("de-AT"), LOCALES.de);
    assert.equal(getTranslations("de"), LOCALES.de);
    assert.equal(getTranslations("fr-FR"), LOCALES.en);
    assert.equal(getTranslations(), LOCALES.en);
});

// Every language must provide every key English has, with the same kind
// (string vs. function), including nested operator labels.
function shape(obj, prefix = "") {
    return Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? shape(v, `${prefix}${k}.`) : [`${prefix}${k}:${typeof v}`]
    ).sort();
}

for (const lang of Object.keys(LOCALES)) {
    test(`bundle "${lang}" has the same keys as "en"`, () => {
        assert.deepEqual(shape(LOCALES[lang]), shape(LOCALES.en));
    });
}

test("LOCALE_NAMES only lists locales with a bundle", () => {
    for (const code of Object.keys(LOCALE_NAMES)) {
        assert.ok(LOCALES[code.split("-")[0]], code);
    }
});
