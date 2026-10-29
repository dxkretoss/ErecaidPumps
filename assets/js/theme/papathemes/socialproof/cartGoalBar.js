/* eslint-disable no-param-reassign */
// `el` inside the forEach is the DOM container we're hydrating — mutating
// its style/attributes is the intended behavior, not accidental parameter
// shadowing. Matches the pattern used throughout Supermarket's theme code.
/**
 * Papathemes Social Proof — Cart Shipping Goal Bar.
 *
 * Renders a multi-tier progress bar inside cart summary + mini cart. Each tier
 * has an amount, optional icon, and label (e.g. "$50 for Free Shipping").
 * Bar fills proportionally to subtotal; markers switch to "active" once
 * their threshold is reached.
 *
 * Config lives on `settings.cartGoal` (see settings.js DEFAULTS). Off by
 * default — merchants enable and supply `items` via Script Manager / theme
 * settings. Respects `hideForGuests` for logged-out shoppers.
 *
 * Subtotal updates flow in via the `supermarket:cart-updated` CustomEvent
 * dispatched from cart-preview.js and cart.js after AJAX cart mutations.
 *
 * DOM structure (built with createElement for XSS safety):
 *   .papathemes-socialproof-cart-goal
 *     p.__text (optional <strong> for highlighted remaining amount)
 *     div.__bar
 *       div.__track > div.__fill (width: fillPct%)
 *       span.__marker (left: pct%) × N   (has .is-active when reached)
 *     div.__labels
 *       span.__label (has .is-active when reached)
 *         svg.__icon (optional)
 *         span (label text)
 *
 * Sprite IDs reference icons in assets/icons/papathemes-socialproof/ —
 * Gruntfile's `svgstore` generates `icon-<filename>` IDs, and the files
 * are prefixed `papathemes-cart-goal-*` to avoid collisions with top-level
 * icons like `gift.svg` / `star.svg` in assets/icons/.
 */

import { appendDemoNote } from './demoNote';

const SELECTOR = '[data-papathemes-cart-goal]';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const VALID_ICONS = new Set(['shipping', 'discount', 'gift', 'check', 'bag', 'star']);
const ICON_ID_PREFIX = 'icon-papathemes-cart-goal-';
const ACTIVE_CLASS = 'is-active';

function formatCurrency(amount, currencyCode) {
    try {
        // Let Intl resolve the correct fraction digits for each currency.
        // Forcing `maximumFractionDigits: 2` formatted zero-decimal
        // currencies (JPY, KRW, VND, CLP...) with spurious decimals —
        // "¥1,234.00" instead of "¥1,234". Intl.NumberFormat with
        // style:currency already picks the canonical fraction digits
        // from the Unicode CLDR (e.g. JPY → 0, USD → 2, BHD → 3).
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currencyCode || 'USD',
        }).format(amount);
    } catch (e) {
        // Fallback only triggers on unknown currency codes; using
        // toFixed(2) is fine here because the caller already failed
        // to produce a valid locale format.
        const safe = Number.isFinite(amount) ? amount : 0;
        return `$${ safe.toFixed(2)}`;
    }
}

function resolveCurrencyCode(container, config) {
    if (config && config.currency) return config.currency;
    if (container && container.dataset && container.dataset.currencyCode) {
        return container.dataset.currencyCode;
    }
    if (typeof document !== 'undefined') {
        const fallback = document.querySelector('[data-currency-code]');
        if (fallback && fallback.dataset && fallback.dataset.currencyCode) {
            return fallback.dataset.currencyCode;
        }
    }
    return 'USD';
}

export function parseGoalItemsFromConfig(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const amount = parseFloat(entry.amount);
            const label = typeof entry.label === 'string' ? entry.label.trim() : '';
            const icon = VALID_ICONS.has(entry.icon) ? entry.icon : null;
            if (!Number.isFinite(amount) || amount <= 0 || !label) return null;
            return { amount, icon, label };
        })
        .filter(Boolean)
        .sort((a, b) => a.amount - b.amount);
}

export function computeGoalBarState(goals, subtotal) {
    if (!Array.isArray(goals) || !goals.length) {
        return {
            allMet: false, fillPct: 0, nextGoal: null, maxGoal: 0,
        };
    }
    const sub = Number.isFinite(subtotal) ? subtotal : 0;
    const maxGoal = goals[goals.length - 1].amount;
    const nextGoal = goals.find((g) => sub < g.amount) || null;
    const allMet = nextGoal === null;
    const fillPct = maxGoal > 0 ? Math.min((sub / maxGoal) * 100, 100) : 0;
    return {
        allMet, fillPct, nextGoal, maxGoal,
    };
}

function createIconSVG(iconKey) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'papathemes-socialproof-cart-goal__icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    const spriteId = `#${ ICON_ID_PREFIX }${iconKey}`;
    use.setAttributeNS(XLINK_NS, 'xlink:href', spriteId);
    use.setAttribute('href', spriteId);
    svg.appendChild(use);
    return svg;
}

function readLang(el) {
    return {
        remaining: (el && el.dataset && el.dataset.langRemaining)
            || '__AMOUNT__ away from __LABEL__!',
        allMet: (el && el.dataset && el.dataset.langAllMet)
            || "You've unlocked all rewards!",
    };
}

function buildGoalBarDOM(container, goals, subtotal, state, config) {
    const lang = readLang(container);
    const currencyCode = resolveCurrencyCode(container, config);

    container.textContent = '';
    container.removeAttribute('aria-busy');
    container.classList.toggle('papathemes-socialproof-cart-goal--all-met', state.allMet);

    // Message line
    const textEl = document.createElement('p');
    textEl.className = 'papathemes-socialproof-cart-goal__text';
    if (state.allMet) {
        textEl.textContent = lang.allMet;
    } else {
        const remaining = formatCurrency(state.nextGoal.amount - subtotal, currencyCode);
        // Interpolate __AMOUNT__ as a highlighted <strong>, __LABEL__ as plain text.
        // Use a sentinel to split safely without relying on innerHTML.
        const SENTINEL = '\u0001';
        const msg = lang.remaining
            .replace('__AMOUNT__', SENTINEL)
            .replace('__LABEL__', state.nextGoal.label);
        const parts = msg.split(SENTINEL);
        if (parts.length === 2) {
            textEl.appendChild(document.createTextNode(parts[0]));
            const strong = document.createElement('strong');
            strong.textContent = remaining;
            textEl.appendChild(strong);
            textEl.appendChild(document.createTextNode(parts[1]));
        } else {
            // No __AMOUNT__ placeholder — append amount+space prefix for readability.
            const strong = document.createElement('strong');
            strong.textContent = remaining;
            textEl.appendChild(strong);
            textEl.appendChild(document.createTextNode(` ${ parts[0]}`));
        }
    }
    container.appendChild(textEl);

    // Bar (track + fill)
    const barEl = document.createElement('div');
    barEl.className = 'papathemes-socialproof-cart-goal__bar';
    const trackEl = document.createElement('div');
    trackEl.className = 'papathemes-socialproof-cart-goal__track';
    const fillEl = document.createElement('div');
    fillEl.className = 'papathemes-socialproof-cart-goal__fill';
    fillEl.style.width = `${state.fillPct }%`;
    trackEl.appendChild(fillEl);
    barEl.appendChild(trackEl);

    // Markers on track
    goals.forEach((goal) => {
        const met = subtotal >= goal.amount;
        const pct = state.maxGoal > 0 ? (goal.amount / state.maxGoal) * 100 : 0;
        const marker = document.createElement('span');
        marker.className = `papathemes-socialproof-cart-goal__marker${ met ? ` ${ ACTIVE_CLASS}` : ''}`;
        marker.style.left = `${pct }%`;
        if (met) marker.textContent = '\u2713';
        barEl.appendChild(marker);
    });
    container.appendChild(barEl);

    // Labels row
    const labelsEl = document.createElement('div');
    labelsEl.className = 'papathemes-socialproof-cart-goal__labels';
    goals.forEach((goal) => {
        const met = subtotal >= goal.amount;
        const lbl = document.createElement('span');
        lbl.className = `papathemes-socialproof-cart-goal__label${ met ? ` ${ ACTIVE_CLASS}` : ''}`;
        if (goal.icon) {
            lbl.appendChild(createIconSVG(goal.icon));
        }
        const text = document.createElement('span');
        text.textContent = goal.label;
        lbl.appendChild(text);
        labelsEl.appendChild(lbl);
    });
    container.appendChild(labelsEl);

    // Theme-editor demo preview — append a small secondary notice under
    // the goal bar when this config came from DEMO_OVERRIDES. Never
    // present on merchant-configured cartGoal.
    if (config && config.__demo === true) {
        appendDemoNote(container);
    }
}

export function renderCartGoalBars(config) {
    if (!config || !config.enabled) return;
    if (typeof document === 'undefined') return;

    const goals = parseGoalItemsFromConfig(config.items);
    const containers = document.querySelectorAll(SELECTOR);

    containers.forEach((el) => {
        if (!goals.length) {
            el.style.display = 'none';
            return;
        }
        if (config.hideForGuests && el.dataset.customerLoggedIn !== 'true') {
            el.style.display = 'none';
            return;
        }
        el.style.display = '';
        const subtotal = parseFloat(el.dataset.subtotal) || 0;
        const state = computeGoalBarState(goals, subtotal);
        buildGoalBarDOM(el, goals, subtotal, state, config);
    });
}

export function updateCartGoalBars(subtotal, config) {
    if (typeof document === 'undefined') return;
    if (subtotal != null && Number.isFinite(subtotal)) {
        document.querySelectorAll(SELECTOR).forEach((el) => {
            el.setAttribute('data-subtotal', String(subtotal));
        });
    }
    renderCartGoalBars(config);
}

/**
 * Initialize the cart goal bar. Returns a destroy function that detaches
 * the `supermarket:cart-updated` listener this call installed. Safe to
 * call multiple times — each call installs at most one listener, and
 * the caller (initSocialProof) runs the previous destroy() before
 * re-initializing on InstantLoad navigations.
 */
export function initCartGoalBar(config) {
    if (typeof document === 'undefined') return () => {};

    // The cart-goal-bar partial is rendered unconditionally inside cart
    // page + mini-cart-preview templates (merchants can't conditionally
    // include templates without editing theme files). Defaults have
    // `enabled: false`, so WITHOUT the hide-on-disabled pass below the
    // skeleton UI (grey bar + marker dots) would linger visibly even
    // when the feature is off. Strip the elements when disabled so the
    // cart summary collapses to its normal height.
    if (!config || !config.enabled) {
        // Hide elements already in the DOM at init time (cart page, mini-cart).
        const hideAll = () => {
            document.querySelectorAll(SELECTOR).forEach((host) => { host.style.display = 'none'; });
        };
        hideAll();
        // Also hide elements injected later via the "added to cart" modal AJAX
        // response — those arrive after init runs, so the one-shot querySelectorAll
        // above misses them. Listening to supermarket:cart-updated covers this case.
        document.addEventListener('supermarket:cart-updated', hideAll);
        return () => {
            document.removeEventListener('supermarket:cart-updated', hideAll);
        };
    }

    renderCartGoalBars(config);

    const handler = (e) => {
        const sub = (e && e.detail && typeof e.detail.subtotal === 'number' && Number.isFinite(e.detail.subtotal))
            ? e.detail.subtotal
            : null;
        updateCartGoalBars(sub, config);
    };
    document.addEventListener('supermarket:cart-updated', handler);
    return () => {
        document.removeEventListener('supermarket:cart-updated', handler);
    };
}
