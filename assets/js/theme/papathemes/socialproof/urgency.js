/* eslint-disable no-param-reassign */
// Mutating attributes on the `el` parameter inside forEach is intentional:
// `el` IS the DOM node we're hydrating, not a candidate for reassignment
// confusion. Matches the pattern used throughout Supermarket's theme modules.
/**
 * Papathemes Social Proof — PDP Urgency widget.
 *
 * Renders two lines of social-proof text on product pages:
 *   - "X viewing now" (with optional ±1-3 drift every 30s)
 *   - "Bought Xm/h/d ago"
 *
 * Numbers are seeded by (productId, sessionKey) so a shopper sees the same
 * values for the same product throughout their session — the PRNG is the
 * cache, not sessionStorage. Only the sessionKey itself is persisted to
 * sessionStorage (with in-memory fallback for private browsing); per-product
 * values are regenerated deterministically on each render from the same
 * (productId, sessionKey) tuple, so writing them to storage added nothing.
 *
 * Re-runs inside Quick View modal (separate DOM scope) by listening for
 * Foundation Reveal's `opened.fndtn.reveal` event — wired in index.js.
 */

import { simpleHash, seededInt, seededFloat } from './prng';
import { createStorage } from './storage';
import { appendDemoNote, insertDemoNoteAfter } from './demoNote';

const SESSION_KEY = 'papathemes-urgency-session-key';
const DRIFT_INTERVAL_MS = 30000;
const INIT_ATTR = 'data-papathemes-urgency-init';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

function getSessionKey(storage) {
    let key = storage.get(SESSION_KEY);
    if (!key) {
        key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        storage.set(SESSION_KEY, key);
    }
    return key;
}

export function pickViewCount(productId, sessionKey, min, max) {
    const seed = simpleHash(`${productId}${sessionKey}view`);
    return seededInt(seed, min, max);
}

export function pickOrderHours(productId, sessionKey, min, max) {
    const seed = simpleHash(`${productId}${sessionKey}order`);
    return seededFloat(seed, min, max);
}

export function formatTimeAgo(hours, lang) {
    // Work entirely from floor()-ed buckets so branch thresholds and
    // displayed counts use the same rounding strategy. Previous impl
    // mixed `hours < 24` (raw) with `Math.round(hours)` (rounded up
    // at .5), which produced "24h ago" for `hours=23.6` — the
    // boundary-cross Copilot flagged. "N hours/days elapsed" is
    // conventionally a floor operation (you don't say "24h ago" until
    // a full 24 hours have actually passed).
    if (hours < 1) {
        // Always show at least 1 minute — "0m ago" reads like a bug.
        const mins = Math.max(1, Math.floor(hours * 60));
        return lang.minAgo.replace('__COUNT__', mins);
    }
    const h = Math.floor(hours);
    if (h === 1) return lang.hourAgo;
    if (h < 24) return lang.hoursAgo.replace('__COUNT__', h);
    const d = Math.floor(h / 24);
    if (d === 1) return lang.dayAgo;
    return lang.daysAgo.replace('__COUNT__', d);
}

function animateCount(from, to, duration, onUpdate) {
    if (prefersReducedMotion || duration <= 0) {
        onUpdate(to);
        return () => {};
    }
    let rafId = 0;
    const start = performance.now();
    function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - (1 - progress) * (1 - progress); // ease-out quad
        const current = Math.round(from + (to - from) * eased);
        onUpdate(current);
        if (progress < 1) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
}

function readLang(el) {
    return {
        viewingNow: el.dataset.langViewingNow || '__COUNT__ viewing now',
        viewingNowSingular: el.dataset.langViewingNowSingular || '1 viewing now',
        lastOrdered: el.dataset.langLastOrdered || 'Bought __TIME__',
        minAgo: el.dataset.langMinAgo || '__COUNT__m ago',
        hourAgo: el.dataset.langHourAgo || '1h ago',
        hoursAgo: el.dataset.langHoursAgo || '__COUNT__h ago',
        dayAgo: el.dataset.langDayAgo || '1d ago',
        daysAgo: el.dataset.langDaysAgo || '__COUNT__d ago',
    };
}

function renderViewText(lang, count) {
    if (count === 1) return lang.viewingNowSingular;
    return lang.viewingNow.replace('__COUNT__', count);
}

/**
 * Initialize urgency widgets within a scope. Returns a destroy function
 * that cancels all drift intervals created by THIS call.
 *
 * Idempotent: the `[data-papathemes-urgency]:not([INIT_ATTR])` selector
 * skips elements already hydrated, so re-invocations (InstantLoad
 * navigation, Quick View re-open) do not double-init or stack timers on
 * a given element.
 *
 * @param {Object} options
 * @param {HTMLElement|Document} [options.scope=document]  Scope to search
 * @param {Object} options.config  Settings from getSettings().urgency
 * @returns {() => void} destroy function
 */
/**
 * Sanitize a [min, max] range tuple. Merchants configure ranges via
 * Script Manager, which is free-form JS — a typo or JSON-copy mishap
 * can produce `null`, a scalar, an object, or an array with the wrong
 * number of elements / non-numeric entries. Destructuring those later
 * would either throw (breaking socialproof init for the whole page) or
 * silently produce NaN seeds that cascade into "NaN viewing now" text.
 *
 * Contract: returns a valid `[min, max]` with finite integers, min<=max.
 * On bad input, returns `fallback` and logs a one-line warn so the
 * merchant can spot the misconfig in DevTools without having to dig
 * through Script Manager.
 */
function sanitizeRange(value, fallback, label) {
    if (!Array.isArray(value) || value.length !== 2) {
        // eslint-disable-next-line no-console
        console.warn(`[papathemes-socialproof] urgency.${label}: expected [min,max] array, got`, value, '— falling back to', fallback);
        return fallback;
    }
    const [a, b] = value;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        // eslint-disable-next-line no-console
        console.warn(`[papathemes-socialproof] urgency.${label}: non-numeric entries`, value, '— falling back to', fallback);
        return fallback;
    }
    // Swap when min>max rather than rejecting — merchant intent is still
    // clear ([25,3] obviously means "3 to 25") and swapping is safer than
    // dropping to defaults mid-config.
    return a <= b ? [a, b] : [b, a];
}

export function initUrgency({ scope = document, config } = {}) {
    if (!config || !config.enabled) return () => {};

    // Validate ranges up-front — failing at destructure time inside the
    // forEach below would abort the entire socialproof init (index.js
    // try/catch) and disable every other feature on the page.
    const viewRange = sanitizeRange(config.viewRange, [3, 25], 'viewRange');
    const orderRange = sanitizeRange(config.orderRange, [1, 48], 'orderRange');

    const storage = createStorage('session');
    const sessionKey = getSessionKey(storage);
    const els = scope.querySelectorAll(`[data-papathemes-urgency]:not([${ INIT_ATTR }])`);
    const driftTimers = [];

    els.forEach((el) => {
        if (el.dataset.outOfStock === 'true') {
            el.style.display = 'none';
            return;
        }
        el.setAttribute(INIT_ATTR, '1');
        const productId = el.dataset.productId;
        if (!productId) return;
        const lang = readLang(el);

        // Build skeleton structure
        el.textContent = '';
        const inner = document.createElement('div');
        inner.className = 'papathemes-socialproof-urgency__inner';

        if (config.viewCount) {
            const [viewMin, viewMax] = viewRange;
            const finalCount = pickViewCount(productId, sessionKey, viewMin, viewMax);

            const viewLine = document.createElement('span');
            viewLine.className = 'papathemes-socialproof-urgency__view';
            viewLine.setAttribute('data-urgency-text', 'view');
            inner.appendChild(viewLine);

            animateCount(0, finalCount, 800, (n) => {
                viewLine.textContent = renderViewText(lang, n);
            });

            if (config.refresh) {
                // Self-cancel if element leaves the DOM (Quick View close,
                // InstantLoad navigation that replaces page content).
                // Tracked in driftTimers too so the returned destroy()
                // can cancel them proactively on InstantLoad re-init.
                const driftTimer = setInterval(() => {
                    if (!el.isConnected) {
                        clearInterval(driftTimer);
                        return;
                    }
                    let delta = Math.floor(Math.random() * 3) + 1;
                    if (Math.random() < 0.5) delta = -delta;
                    const curr = parseInt((viewLine.textContent || '').replace(/\D/g, ''), 10) || finalCount;
                    let next = curr + delta;
                    next = Math.max(viewMin, Math.min(viewMax, next));
                    viewLine.textContent = renderViewText(lang, next);
                }, DRIFT_INTERVAL_MS);
                el._papathemesUrgencyDriftTimer = driftTimer;
                driftTimers.push(driftTimer);
            }
        }

        if (config.lastOrder) {
            const [orderMin, orderMax] = orderRange;
            const hours = pickOrderHours(productId, sessionKey, orderMin, orderMax);

            const orderLine = document.createElement('span');
            orderLine.className = 'papathemes-socialproof-urgency__order';
            orderLine.textContent = lang.lastOrdered.replace('__TIME__', formatTimeAgo(hours, lang));
            inner.appendChild(orderLine);
        }

        el.appendChild(inner);

        // Theme-editor demo preview — only when config came from DEMO_OVERRIDES.
        // Never present on merchant-configured urgency.
        //
        // The urgency `<div>` is `display: inline-block` inside a flex row
        // that also holds the stock pill. Appending the note INSIDE
        // urgency would widen the inline-block to the note's text width
        // and force the flex row to wrap (stock pill onto line 1, urgency
        // onto line 2). Insert the note AFTER the outer `.stock-row`
        // container so the row keeps its single-line layout and the note
        // stacks block-level beneath it.
        if (config.__demo === true) {
            const stockRow = el.closest ? el.closest('.papathemes-socialproof-stock-row') : null;
            if (stockRow) {
                insertDemoNoteAfter(stockRow, { align: 'left' });
            } else {
                // Fallback for DOM shapes without the stock-row wrapper
                // (e.g. if the template is ever used standalone).
                appendDemoNote(el, { align: 'left' });
            }
        }
    });

    return () => {
        driftTimers.forEach((timer) => {
            try { clearInterval(timer); } catch (e) { /* noop */ }
        });
        driftTimers.length = 0;
    };
}

/**
 * Hook for future cleanup of drift timers when elements leave DOM.
 * Kept as an API point; actual timer attached to element and GC'd with it.
 */
export function cleanupDetachedUrgency() {
    // Intentionally empty — timers are attached to DOM elements; garbage
    // collection handles cleanup when elements are removed.
}
