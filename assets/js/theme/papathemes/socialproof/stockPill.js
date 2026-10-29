/* eslint-disable no-param-reassign */
// We intentionally mutate the pill DOM node's attributes, classList,
// and inline style inside the forEach/MutationObserver callbacks. `pill`
// is the DOM target we're hydrating — not a candidate for confusing
// parameter shadowing. Same convention used in urgency.js and
// cartGoalBar.js.
/**
 * Papathemes Social Proof — Stock pill low-stock indicator.
 *
 * Reads `data-stock-level` + `data-low-threshold` on each
 * [data-papathemes-stock-pill] wrapper and:
 *   - Toggles the `is-low-stock` class on the wrapper when the level is
 *     in the half-open interval (0, threshold].
 *   - Mirrors the stock count onto the visible
 *     [data-papathemes-stock-display] span so the user sees the value.
 *   - Hides the whole pill when stock_level is 0 (or not a positive
 *     integer) so the row does not show "Current Stock: 0" noise.
 *
 * Why mirror instead of just using `[data-product-stock]` directly:
 *   product-details.js addClass/removeClass('u-hiddenVisually') on the
 *   `.form-field--stock` wrapper we need to keep for its updates. If the
 *   visible stock text lived inside that wrapper, BC's variant-change
 *   code would hide it out from under us. The visible span is a
 *   sibling, and a MutationObserver reads fresh values out of the
 *   hidden BC span and writes them to ours.
 */

const PILL_SELECTOR = '[data-papathemes-stock-pill]';
const BC_STOCK_SELECTOR = '[data-product-stock]';
const DISPLAY_SELECTOR = '[data-papathemes-stock-display]';
const LOW_CLASS = 'is-low-stock';
// Dataset key used to mark a pill whose MutationObserver is already
// attached. Prevents duplicate observers when initStockPill runs again
// (InstantLoad navigation, Quick View re-open) while the DOM node is
// the same instance.
const INIT_ATTR = 'papathemesStockPillObserved';

/**
 * Apply is-low-stock class and show/hide the pill based on the current
 * data-stock-level attribute.
 *
 * @param {HTMLElement} pill
 */
function applyPillState(pill) {
    const level = parseInt(pill.getAttribute('data-stock-level'), 10);
    const threshold = parseInt(pill.getAttribute('data-low-threshold'), 10);

    // Hide the pill when we have no actionable stock value. 0 or NaN
    // both qualify: 0 means out of stock (show no pill), NaN means the
    // product does not track inventory (nothing meaningful to show).
    if (!Number.isFinite(level) || level <= 0) {
        pill.style.display = 'none';
        pill.classList.remove(LOW_CLASS);
        return;
    }

    pill.style.display = '';

    if (Number.isFinite(threshold) && level <= threshold) {
        pill.classList.add(LOW_CLASS);
    } else {
        pill.classList.remove(LOW_CLASS);
    }
}

/**
 * Pull the numeric stock value out of BC's `[data-product-stock]` span.
 * Returns the parsed int, or null if the text is not a plain integer
 * (which happens when BC's JS has written "undefined" / "null" into it
 * for non-tracked products).
 *
 * @param {HTMLElement} valueEl
 * @returns {number|null}
 */
function readBcStock(valueEl) {
    if (!valueEl) return null;
    const raw = (valueEl.textContent || '').trim();
    if (!/^-?\d+$/.test(raw)) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * Mirror the hidden BC stock value onto the visible display span and
 * the wrapper's data-stock-level attribute, then refresh pill state.
 *
 * @param {HTMLElement} pill
 */
function syncFromBc(pill) {
    const bcValue = pill.querySelector(BC_STOCK_SELECTOR);
    const display = pill.querySelector(DISPLAY_SELECTOR);
    const level = readBcStock(bcValue);
    if (level !== null) {
        // BC wrote a real number — reflect it on the wrapper + display.
        pill.setAttribute('data-stock-level', String(level));
        if (display) display.textContent = String(level);
    } else {
        // BC wrote "undefined" / "null" / empty — that is BigCommerce's
        // signal that the current variant does NOT track inventory. To
        // match product-details.js's behavior (it adds u-hiddenVisually
        // in the same case), clear our own level so applyPillState
        // below hides the pill instead of keeping stale numeric UI.
        pill.setAttribute('data-stock-level', '');
        if (display) display.textContent = '';
    }
    applyPillState(pill);
}

/**
 * Initialize every stock pill in scope. Returns a destroy function that
 * disconnects all MutationObservers attached in this call.
 *
 *   - Sync initial state from the server-rendered markup.
 *   - Watch the hidden BC span for text changes (fired by
 *     product-details.js on variant switches) and keep the visible UI
 *     in sync.
 *   - Skip pills that were already observed (idempotent — safe to call
 *     again on InstantLoad navigation or Quick View re-open; the
 *     previous observer on that pill stays).
 *
 * @param {HTMLElement|Document} [scope=document]
 * @returns {() => void} destroy function
 */
export function initStockPill(scope = document) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return () => {};
    const observers = [];
    const pills = scope.querySelectorAll(PILL_SELECTOR);
    pills.forEach((pill) => {
        syncFromBc(pill);

        // Skip if this same DOM node already has our observer attached —
        // prevents N observers piling up on Quick View re-opens.
        if (pill.dataset[INIT_ATTR]) return;

        const bcValue = pill.querySelector(BC_STOCK_SELECTOR);
        if (!bcValue || typeof MutationObserver !== 'function') return;

        // Capture `observer` in the callback so it can disconnect itself
        // when the pill leaves the DOM (e.g. Quick View modal closed).
        // Otherwise MutationObserver keeps a strong reference to the
        // detached node + its subtree — repeated Quick View opens leak
        // memory proportional to open count until next navigation.
        //
        // `const` is safe here because MutationObserver's callback only
        // runs after the constructor returns (the temporal dead zone
        // ends before the first mutation fires).
        const observer = new MutationObserver(() => {
            if (!pill.isConnected) {
                try { observer.disconnect(); } catch (e) { /* noop */ }
                if (pill.dataset) delete pill.dataset[INIT_ATTR];
                return;
            }
            syncFromBc(pill);
        });
        observer.observe(bcValue, {
            childList: true,
            characterData: true,
            subtree: true,
        });
        pill.dataset[INIT_ATTR] = '1';
        // Track for the returned destroy() so InstantLoad re-init can
        // explicitly disconnect ALL observers in one pass (the self-
        // disconnect above only fires if the observer callback runs —
        // which requires a mutation on a still-connected node).
        observers.push({ observer, pill });
    });

    return () => {
        observers.forEach(({ observer, pill }) => {
            try { observer.disconnect(); } catch (e) { /* noop */ }
            if (pill && pill.dataset) delete pill.dataset[INIT_ATTR];
        });
        observers.length = 0;
    };
}
