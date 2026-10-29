/**
 * Supermarket Page Transition
 *
 * Shows a full-page loading overlay when the user navigates to a new page.
 * The overlay is rendered via CSS pseudo-elements on <html>, toggled by:
 *   - supermarket-splash      — overlay visible (opacity 1)
 *   - supermarket-splash-in   — fade-in animation (0→1, 200ms)
 *   - supermarket-splash-out  — fade-out animation (1→0, 300ms)
 *
 * The overlay on the NEW page is handled by an inline <head> script in
 * base.html — it adds `.supermarket-splash` immediately so the overlay
 * appears on the very first frame, then fades out after DOMContentLoaded.
 *
 * This module handles the EXIT side:
 *   1. Click — show the overlay so the user sees feedback while the server
 *      responds. Uses capture phase + setTimeout(0) to cooperate with AJAX
 *      handlers (add-to-cart, quick-view, modals, faceted search).
 *   2. bfcache restore — fade out the stale overlay when the user hits Back.
 *   3. Safety net — remove the overlay if navigation is cancelled (e.g. user
 *      presses Escape) and pagehide never fires.
 *
 * ## Why capture phase + setTimeout(0)?
 *
 * The old approach called event.preventDefault() immediately, which blocked
 * AJAX handlers that registered their listeners after this module loaded
 * (e.g. via dynamic import()). The new approach:
 *   1. Capture-phase listener fires first — before every bubble handler.
 *   2. setTimeout(0) defers the decision until after ALL synchronous handlers
 *      (both capture and bubble) have run.
 *   3. Checks event.defaultPrevented in the deferred callback — if any
 *      handler cancelled the event (AJAX, modal…), the overlay is skipped.
 *   4. Never calls event.preventDefault() — the browser navigates normally.
 */

// ---------------------------------------------------------------------------
// Link Filtering
// ---------------------------------------------------------------------------

/**
 * Returns true if clicking this link should trigger the page transition overlay.
 * @param {HTMLAnchorElement} linkEl
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function shouldIntercept(linkEl, event) {
    // Skip modifier-key clicks — they open new tabs, save files, etc.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return false;
    if (!linkEl.href) return false;
    if (linkEl.hasAttribute('download')) return false;
    if (linkEl.hasAttribute('data-supermarket-no-transition')) return false;
    if (linkEl.target && linkEl.target !== '_self') return false;
    // Links inside modals should navigate normally without the overlay.
    if (linkEl.closest('.modal')) return false;
    // Faceted-search links use pushState (no real navigation) — skip them.
    if (linkEl.matches('[data-faceted-search-facet]')) return false;
    if (linkEl.closest('#facetedSearch')) return false;

    try {
        const url = new URL(linkEl.href);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
        if (url.origin !== window.location.origin) return false;
        // Same page (anchor jump or identical URL) — not a real navigation.
        if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
        if (/^\/checkout/.test(url.pathname)) return false;
    } catch (_e) {
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/** Minimum ms between two overlay activations (prevents double-firing). */
const DEBOUNCE_MS = 500;

/**
 * How long to keep the overlay after a click before forcing it away.
 * Covers cancelled navigations where pagehide never fires.
 */
const SAFETY_TIMEOUT_MS = 10000;

/**
 * Reads the fade-out duration from the CSS custom property
 * `--supermarket-splash-fade-ms` defined in base.html.
 *
 * Re-reads on every call (not cached at init) so the value stays accurate
 * if the property ever changes at runtime (e.g. theme-editor live preview).
 * The inline <head> script reads it once at parse time for its own entry-side
 * fade — that asymmetry is intentional since the value is treated as static
 * on the entry side.
 *
 * @returns {number} Duration in milliseconds.
 */
function readFadeMs() {
    try {
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue('--supermarket-splash-fade-ms')
            .trim();
        const n = parseFloat(raw);
        if (Number.isFinite(n) && n > 0) return n;
    } catch (_e) { /* ignore (jsdom, etc.) */ }
    return 300;
}

/**
 * Initializes the page-transition overlay.
 * @returns {() => void} Call to remove all listeners and cancel timers.
 */
export function initPageTransition() {
    const root = document.documentElement;
    let lastInterceptTime = 0;
    let safetyTimer = null;
    // Tracks the in-progress fade-out setTimeout (from dismissOverlay or
    // onPageShow). Cleared whenever the overlay is re-shown or destroyed so
    // a stale callback cannot remove the overlay from a new navigation.
    let fadeOutTimer = null;
    let destroyed = false;

    /**
     * Starts the fade-out animation and removes overlay classes when done.
     * Used by the safety timer when pagehide never fires (cancelled navigation).
     */
    function dismissOverlay() {
        if (destroyed) return;
        if (!root.classList.contains('supermarket-splash')) return;
        clearTimeout(safetyTimer);
        safetyTimer = null;
        const reduce = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Remove -in before adding -out: the fade-in animation uses
        // fill-mode:both which holds opacity:1 at its final state and would
        // override the opacity:0 rule on .supermarket-splash-out, preventing
        // the CSS transition from running.
        root.classList.remove('supermarket-splash-in');
        root.classList.add('supermarket-splash-out');
        clearTimeout(fadeOutTimer);
        fadeOutTimer = setTimeout(() => {
            fadeOutTimer = null;
            if (destroyed) return;
            root.classList.remove('supermarket-splash', 'supermarket-splash-out');
            root.removeAttribute('aria-busy');
        }, reduce ? 0 : readFadeMs());
        lastInterceptTime = 0;
    }

    /** @param {MouseEvent} event */
    function onClick(event) {
        const targetEl = event.target instanceof Element ? event.target : event.target.parentElement;
        if (!targetEl) return;

        const linkEl = targetEl.closest('a[href]');
        if (!linkEl || !shouldIntercept(linkEl, event)) return;

        // Defer until after all synchronous handlers have run.
        setTimeout(() => {
            if (destroyed) return;

            // An AJAX handler (add-to-cart, quick-view, modal…) cancelled the event.
            if (event.defaultPrevented) return;

            // InstantLoad is handling this navigation — skip our overlay.
            if (document.querySelector('.body.instantload-loading')) return;

            // Debounce rapid clicks.
            const now = Date.now();
            if (now - lastInterceptTime < DEBOUNCE_MS) return;
            lastInterceptTime = now;

            // Cancel any in-progress fade-out (safety timer or bfcache restore)
            // so a stale cleanup callback cannot remove this new overlay.
            clearTimeout(fadeOutTimer);
            fadeOutTimer = null;
            root.classList.remove('supermarket-splash-out');

            // If the entry-side inline script is mid-dismissal, cancel it first.
            if (typeof window.__supermarketSplashCancelDismissal === 'function') {
                window.__supermarketSplashCancelDismissal();
            }

            root.classList.add('supermarket-splash', 'supermarket-splash-in');
            root.setAttribute('aria-busy', 'true');

            // Safety net: remove overlay if pagehide never fires.
            clearTimeout(safetyTimer);
            safetyTimer = setTimeout(dismissOverlay, SAFETY_TIMEOUT_MS);
        }, 0);
    }

    /**
     * pagehide fires when the page is being unloaded or entering bfcache.
     * @param {PageTransitionEvent} event
     */
    function onPageHide(event) {
        // Navigation is proceeding — cancel all pending timers.
        clearTimeout(safetyTimer);
        safetyTimer = null;
        clearTimeout(fadeOutTimer);
        fadeOutTimer = null;

        if (event.persisted) {
            // Page is going into bfcache — remove the overlay so the cached
            // snapshot is clean. On pageshow, we only fade out a stale overlay
            // if one is still present on restore.
            root.classList.remove('supermarket-splash', 'supermarket-splash-in', 'supermarket-splash-out');
            root.removeAttribute('aria-busy');
            lastInterceptTime = 0;
        }
    }

    /** @param {PageTransitionEvent} event */
    function onPageShow(event) {
        // Restored from bfcache while the overlay was on screen — fade it out.
        if (event.persisted && root.classList.contains('supermarket-splash')) {
            // Remove -in before adding -out for the same reason as in
            // dismissOverlay: fill-mode:both on the fade-in animation holds
            // opacity:1 and would block the fade-out transition.
            root.classList.remove('supermarket-splash-in');
            root.classList.add('supermarket-splash-out');
            const reduce = window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            clearTimeout(fadeOutTimer);
            fadeOutTimer = setTimeout(() => {
                fadeOutTimer = null;
                if (destroyed) return;
                root.classList.remove('supermarket-splash', 'supermarket-splash-out');
                root.removeAttribute('aria-busy');
            }, reduce ? 0 : readFadeMs());
            lastInterceptTime = 0;
        }
    }

    // Capture-phase so our listener fires before every bubble handler,
    // giving setTimeout(0) a full view of all synchronous handlers.
    document.addEventListener('click', onClick, true);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    return function destroy() {
        destroyed = true;
        document.removeEventListener('click', onClick, true);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        clearTimeout(safetyTimer);
        clearTimeout(fadeOutTimer);
        // Clean up overlay DOM state so the UI is never left stuck in a
        // loading/busy state if teardown happens while the overlay is visible.
        root.classList.remove('supermarket-splash', 'supermarket-splash-in', 'supermarket-splash-out');
        root.removeAttribute('aria-busy');
    };
}
