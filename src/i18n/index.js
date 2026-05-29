import { request } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { LEAGUE_CLIENT_ENDPOINTS } from "../league-client-endpoints.js";
import enUS from "./en-US.json";
import esMX from "./es-MX.json";
import koKR from "./ko-KR.json";
import ptBR from "./pt-BR.json";
import trTR from "./tr-TR.json";
import viVN from "./vi-VN.json";
import zhCN from "./zh-CN.json";

const DEFAULT_LOCALE = "en-US";
const TRANSLATIONS = Object.freeze({
    "en-US": enUS,
    "es-MX": esMX,
    "ko-KR": koKR,
    "pt-BR": ptBR,
    "tr-TR": trTR,
    "vi-VN": viVN,
    "vn-VN": viVN,
    "zh-CN": zhCN
});

let locale = DEFAULT_LOCALE;
let hasLoadedRegionLocale = false;

/**
 * @returns {string}
 */
function detectClientLocale() {
    if (typeof document !== "undefined") {
        return document.body?.dataset?.locale || document.documentElement?.lang || "";
    }

    if (typeof navigator !== "undefined") {
        return navigator.language || "";
    }

    return "";
}

/**
 * @returns {Promise<string>}
 */
async function requestClientLocale() {
    try {
        const response = await request("GET", LEAGUE_CLIENT_ENDPOINTS.regionLocale);

        if (!response.ok) {
            return "";
        }

        const data = await response.json();
        return typeof data?.locale === "string" ? data.locale : "";
    } catch {
        return "";
    }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function resolveLocale(value) {
    const requestedLocale = String(value || "").replace("_", "-");
    const exactLocale = Object.keys(TRANSLATIONS).find(supportedLocale =>
        supportedLocale.toLowerCase() === requestedLocale.toLowerCase()
    );

    if (exactLocale) {
        return exactLocale;
    }

    const language = requestedLocale.split("-")[0]?.toLowerCase();
    const languageLocale = Object.keys(TRANSLATIONS).find(supportedLocale =>
        supportedLocale.toLowerCase().startsWith(`${language}-`)
    );

    return languageLocale || DEFAULT_LOCALE;
}

/**
 * @param {unknown} nextLocale
 * @returns {string}
 */
function applyLocale(nextLocale) {
    locale = resolveLocale(nextLocale);
    return locale;
}

/**
 * @param {Record<string, unknown>} dictionary
 * @param {string} key
 * @returns {unknown}
 */
function getTranslationValue(dictionary, key) {
    return key.split(".").reduce((value, segment) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
        }

        return value[segment];
    }, dictionary);
}

/**
 * @param {string} template
 * @param {Record<string, unknown>} values
 * @returns {string}
 */
function interpolate(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    );
}

/**
 * @returns {string}
 */
export function getLocale() {
    if (!hasLoadedRegionLocale) {
        applyLocale(detectClientLocale());
    }

    return locale;
}

/**
 * @returns {Promise<string>}
 */
export async function waitForLocale() {
    const clientLocale = await requestClientLocale();
    if (clientLocale) {
        hasLoadedRegionLocale = true;
        return applyLocale(clientLocale);
    }

    return getLocale();
}

/**
 * @param {string} key
 * @param {Record<string, unknown>} [values]
 * @returns {string}
 */
export function t(key, values = {}) {
    const activeLocale = getLocale();
    const activeValue = getTranslationValue(TRANSLATIONS[activeLocale], key);
    const fallbackValue = getTranslationValue(TRANSLATIONS[DEFAULT_LOCALE], key);
    const template = typeof activeValue === "string"
        ? activeValue
        : typeof fallbackValue === "string"
            ? fallbackValue
            : key;

    return interpolate(template, values);
}

/**
 * @param {unknown[]} items
 * @returns {string}
 */
export function formatList(items) {
    const values = items.map(item => String(item));

    if (values.length === 0) {
        return "";
    }

    if (values.length === 1) {
        return values[0];
    }

    if (values.length === 2) {
        return t("list.two", { first: values[0], second: values[1] });
    }

    return t("list.many", {
        items: values.slice(0, -1).join(", "),
        last: values[values.length - 1]
    });
}
