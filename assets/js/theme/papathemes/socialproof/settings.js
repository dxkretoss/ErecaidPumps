/**
 * Papathemes Social Proof — settings module.
 *
 * Merchants configure features via `window.supermarketThemeSettings` injected
 * through BigCommerce Script Manager. This module exposes the compiled-in
 * DEFAULTS and a `getSettings()` helper that deep-merges merchant overrides
 * onto the defaults.
 *
 * Safe defaults: all features OFF for production shoppers. Merchants opt-in
 * via Script Manager. Invalid merchant config falls back to defaults with
 * a console.warn.
 *
 * Theme-editor preview exception: when the storefront renders inside the
 * BigCommerce Stencil theme editor (see `editorMode.js`), features that
 * the merchant has not configured are filled in from `DEMO_OVERRIDES` so
 * merchants see a populated preview. Merchant-configured features — even
 * explicitly disabled ones — always win over demo content, and this path
 * only activates in the editor, never for real shoppers.
 */

import { isInThemeEditor } from './editorMode';
import { DEMO_OVERRIDES } from './demoSettings';

export const DEFAULTS = Object.freeze({
    urgency: {
        enabled: false,
        viewCount: true,
        viewRange: [3, 25],
        lastOrder: true,
        orderRange: [1, 48],
        refresh: true,
    },
    cartGoal: {
        enabled: false,
        items: [],
        currency: null, // null means auto-detect from page
        hideForGuests: false,
    },
    recentSales: {
        enabled: false,
        source: 'best-sellers',
        items: [],
        timing: {
            delay: 8,
            duration: 5,
            interval: 20,
            maxShows: 3,
        },
        position: 'bottom-left',
        pages: 'all',
        excludePages: ['checkout', 'order-confirmation', 'login', 'account'],
    },
    promo: {
        enabled: false,
        title: '',
        description: '',
        coupon: '',
        timing: { delay: 5, duration: 0, freqDays: 7 },
    },
    exit: {
        enabled: false,
        // Only `discount` mode is implemented today — the spec reserved
        // `newsletter` and `custom` for a future iteration. Keeping the
        // field explicit (rather than removing it) lets the exit-popup
        // builder emit a console.warn if a merchant sets a future mode
        // prematurely, while the default value documents the intent.
        mode: 'discount',
        title: '',
        description: '',
        coupon: '',
        buttonText: '',
        buttonUrl: '/',
        mobileDelay: 45,
        freqDays: 1,
    },
});

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recursively clone plain objects and arrays so the returned settings
 * tree shares no references with DEFAULTS or the merchant-supplied
 * window.supermarketThemeSettings. Without this, callers mutating the
 * returned settings (e.g. `settings.urgency.viewRange.push(99)`) would
 * silently mutate the frozen-at-top-level DEFAULTS object.
 * Primitives are returned as-is.
 */
function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (isPlainObject(value)) {
        const out = {};
        Object.keys(value).forEach((k) => { out[k] = deepClone(value[k]); });
        return out;
    }
    return value;
}

function deepMerge(target, source) {
    // Even when source is not an object we must return a cloned target,
    // never the same reference — otherwise nested objects/arrays in
    // DEFAULTS leak by reference into the returned settings tree.
    if (!isPlainObject(source)) return deepClone(target);
    const result = deepClone(target);
    Object.keys(source).forEach((key) => {
        const srcVal = source[key];
        const tgtVal = result[key];
        if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
            result[key] = deepMerge(tgtVal, srcVal);
        } else if (isPlainObject(tgtVal) && srcVal !== undefined && !isPlainObject(srcVal)) {
            // The defaults expect an object here (e.g. `urgency`, `promo`,
            // `exit` are all nested-object branches). A merchant who wrote
            // `urgency: null` or `promo: 'off'` in Script Manager would
            // otherwise wipe out the entire branch, leaving the module
            // blind to its own default sub-keys and likely throwing later
            // at `settings.urgency.enabled`. Keep the default object
            // and surface a warn so the mistake is diagnosable in
            // DevTools without breaking the page.
            // eslint-disable-next-line no-console
            console.warn(`[papathemes-socialproof] setting "${key}" expects an object; ignoring merchant value (${typeof srcVal})`);
        } else {
            // srcVal may itself be an array/object supplied by the
            // merchant — clone to prevent them mutating our settings
            // tree later by reference.
            result[key] = deepClone(srcVal);
        }
    });
    return result;
}

export function getSettings() {
    const merchant = (typeof window !== 'undefined') ? window.supermarketThemeSettings : null;

    // Non-plain-object merchant value → hard fall back to DEFAULTS. We do
    // NOT apply demo in this case: a malformed merchant config signals
    // something is wrong in Script Manager, and surfacing demo content
    // on top of that would mask the misconfiguration.
    if (merchant != null && !isPlainObject(merchant)) {
        // eslint-disable-next-line no-console
        console.warn('[papathemes-socialproof] window.supermarketThemeSettings must be a plain object; using defaults');
        return deepMerge({}, DEFAULTS);
    }

    // Strip keys whose merchant value is explicitly `undefined`. A raw
    // `{ promo: undefined }` would otherwise (a) overwrite DEFAULTS.promo
    // with undefined through the initial deepMerge — bypassing the
    // warn-and-keep-default path which only fires for non-undefined
    // non-object values — and (b) cause the per-feature demo overlay
    // below to treat the key as "set" via hasOwnProperty, suppressing
    // the demo. Treating explicit undefined as "not set" matches intent
    // and leaves `null`/`false` behavior unchanged (both still win over
    // DEFAULTS and demo, and `null` still surfaces the deepMerge warn).
    const merchantObj = {};
    if (isPlainObject(merchant)) {
        Object.keys(merchant).forEach((k) => {
            if (merchant[k] !== undefined) merchantObj[k] = merchant[k];
        });
    }
    const inEditor = isInThemeEditor();

    // Start by merging the full merchant object onto DEFAULTS. This preserves
    // any unknown top-level keys the merchant added (e.g. forward-compat
    // hooks, custom-integration config) that downstream code may read —
    // matching the historical deepMerge(DEFAULTS, merchant) behavior before
    // the editor-demo feature landed.
    const mergedSettings = deepMerge(DEFAULTS, merchantObj);
    if (!inEditor) return mergedSettings;

    // Inside the theme editor: overlay DEMO_OVERRIDES for each known
    // feature key the merchant did NOT set. Merchant values (including
    // explicit null / enabled:false) always win; unknown merchant keys
    // are already present in mergedSettings and stay untouched.
    const demoSource = {};
    Object.keys(DEFAULTS).forEach((key) => {
        if (
            !Object.prototype.hasOwnProperty.call(merchantObj, key)
            && DEMO_OVERRIDES[key] !== undefined
        ) {
            demoSource[key] = DEMO_OVERRIDES[key];
        }
    });

    return deepMerge(mergedSettings, demoSource);
}
