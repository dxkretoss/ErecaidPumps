/**
 * @jest-environment jsdom
 */

import { shouldIntercept, initPageTransition } from '../../theme/supermarketPageTransition';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    })),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an anchor element for testing.
 * @param {string} href
 * @param {object} attrs
 * @returns {HTMLAnchorElement}
 */
function makeLink(href, attrs = {}) {
    const a = document.createElement('a');
    a.href = href;
    if (attrs.target) a.target = attrs.target;
    if (attrs.className) a.className = attrs.className;
    if (attrs.parentClass) {
        const parent = document.createElement('div');
        parent.className = attrs.parentClass;
        parent.appendChild(a);
        document.body.appendChild(parent);
    }
    if (attrs.noTransition) a.setAttribute('data-supermarket-no-transition', '');
    if (attrs.download) a.setAttribute('download', '');
    return a;
}

/**
 * Creates a mock mouse event for testing.
 * @param {object} overrides
 * @returns {object}
 */
function makeEvent(overrides = {}) {
    return {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        button: 0,
        defaultPrevented: false,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// shouldIntercept
// ---------------------------------------------------------------------------

describe('shouldIntercept', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('returns true for a normal internal link click', () => {
        const link = makeLink('http://localhost/category/');
        expect(shouldIntercept(link, makeEvent())).toBe(true);
    });

    it('returns false for an external link', () => {
        const link = makeLink('https://example.com/page');
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for same-page anchor (same pathname + search + hash)', () => {
        const link = makeLink('http://localhost/#section');
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns true for same pathname but different search with hash', () => {
        const link = makeLink('http://localhost/?q=test#top');
        expect(shouldIntercept(link, makeEvent())).toBe(true);
    });

    it('returns false for same exact URL (no hash)', () => {
        const link = makeLink('http://localhost/');
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for target="_blank"', () => {
        const link = makeLink('http://localhost/page', { target: '_blank' });
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns true for target="_self"', () => {
        const link = makeLink('http://localhost/page', { target: '_self' });
        expect(shouldIntercept(link, makeEvent())).toBe(true);
    });

    it('returns false for Ctrl+click', () => {
        const link = makeLink('http://localhost/page');
        expect(shouldIntercept(link, makeEvent({ ctrlKey: true }))).toBe(false);
    });

    it('returns false for Meta+click (Cmd)', () => {
        const link = makeLink('http://localhost/page');
        expect(shouldIntercept(link, makeEvent({ metaKey: true }))).toBe(false);
    });

    it('returns false for Shift+click', () => {
        const link = makeLink('http://localhost/page');
        expect(shouldIntercept(link, makeEvent({ shiftKey: true }))).toBe(false);
    });

    it('returns false for Alt+click (Windows/Linux save-link-as gesture)', () => {
        const link = makeLink('http://localhost/page');
        expect(shouldIntercept(link, makeEvent({ altKey: true }))).toBe(false);
    });

    it('returns false for middle-click (button=1)', () => {
        const link = makeLink('http://localhost/page');
        expect(shouldIntercept(link, makeEvent({ button: 1 }))).toBe(false);
    });

    it('returns false for data-supermarket-no-transition attribute', () => {
        const link = makeLink('http://localhost/page', { noTransition: true });
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for download attribute (file download)', () => {
        const link = makeLink('http://localhost/file.pdf', { download: true });
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for /checkout paths', () => {
        const link = makeLink('http://localhost/checkout');
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for non-http protocol hrefs', () => {
        const a = document.createElement('a');
        // eslint-disable-next-line no-script-url
        a.setAttribute('href', 'javascript:void(0)');
        expect(shouldIntercept(a, makeEvent())).toBe(false);
    });

    it('returns false for links inside a .modal', () => {
        const link = makeLink('http://localhost/page', { parentClass: 'modal' });
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for [data-faceted-search-facet] links (AJAX facet filtering)', () => {
        const link = makeLink('http://localhost/category?brand=acme');
        link.setAttribute('data-faceted-search-facet', '');
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('returns false for links inside #facetedSearch container', () => {
        const link = makeLink('http://localhost/category?price=0-50', { parentClass: '' });
        const container = document.createElement('div');
        container.id = 'facetedSearch';
        container.appendChild(link);
        document.body.appendChild(container);
        expect(shouldIntercept(link, makeEvent())).toBe(false);
    });

    it('does not check defaultPrevented (that is handled by onClick)', () => {
        const link = makeLink('http://localhost/page');
        expect(shouldIntercept(link, makeEvent({ defaultPrevented: true }))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// initPageTransition
// ---------------------------------------------------------------------------

describe('initPageTransition', () => {
    let destroy;

    beforeEach(() => {
        document.documentElement.classList.remove(
            'supermarket-splash',
            'supermarket-splash-in',
            'supermarket-splash-out',
        );
        document.body.innerHTML = '';
        jest.useFakeTimers();
    });

    afterEach(() => {
        if (typeof destroy === 'function') {
            destroy();
            destroy = null;
        }
        document.documentElement.classList.remove(
            'supermarket-splash',
            'supermarket-splash-in',
            'supermarket-splash-out',
        );
        document.body.innerHTML = '';
        jest.useRealTimers();
    });

    // ─── Core overlay behavior ───────────────────────────────────────────────

    it('shows splash with fade-in classes after setTimeout(0) fires on valid internal link click', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(event);

        // Overlay is NOT shown synchronously — deferred to setTimeout(0).
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);

        // Flush the deferred callback.
        jest.advanceTimersByTime(1);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);
        // New approach: we do NOT call event.preventDefault().
        expect(event.defaultPrevented).toBe(false);
    });

    it('does not show overlay for external links', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'https://other-site.com/page';
        document.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
    });

    // ─── AJAX handler cooperation ─────────────────────────────────────────────

    it('does not show overlay when a bubble handler on the link calls preventDefault', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        // Simulate an AJAX handler (e.g., quick-view) calling preventDefault.
        link.addEventListener('click', (e) => e.preventDefault(), { once: true });
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

        jest.advanceTimersByTime(1);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
    });

    it('does not show overlay when a document-level bubble handler (e.g. FacetedSearch) calls preventDefault — even if registered after initPageTransition', () => {
        // Key regression test: the old bubble-phase approach was vulnerable to
        // later-registered handlers. The new capture-phase + setTimeout(0) approach
        // checks defaultPrevented AFTER all handlers have run, so registration
        // order does not matter.
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/search?category=foo';
        document.body.appendChild(link);

        // Registered AFTER initPageTransition — simulates dynamic import() chunk.
        const ajaxHandler = (e) => {
            if (e.target.closest('a') === link) e.preventDefault();
        };
        document.addEventListener('click', ajaxHandler);

        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(event);

        // Flush setTimeout(0) — at this point defaultPrevented is true.
        jest.advanceTimersByTime(1);

        expect(event.defaultPrevented).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);

        document.removeEventListener('click', ajaxHandler);
    });

    // ─── InstantLoad detection ─────────────────────────────────────────────

    it('does not show overlay when InstantLoad adds .body.instantload-loading synchronously in its click handler', () => {
        // Real timing: our capture handler fires first, schedules setTimeout(0),
        // then InstantLoad's bubble handler fires synchronously and adds the class.
        // By the time setTimeout(0) runs, the class is already present.
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'body';
        document.body.appendChild(bodyDiv);

        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        // Simulate InstantLoad's bubble-phase click handler adding the class.
        link.addEventListener('click', () => { bodyDiv.classList.add('instantload-loading'); });

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

        // Class is now set; flush our deferred callback.
        jest.advanceTimersByTime(1);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);

        bodyDiv.classList.remove('instantload-loading');
    });

    // ─── Debounce ──────────────────────────────────────────────────────────

    it('debounces rapid consecutive clicks (second click within DEBOUNCE_MS does not show overlay again)', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        // First click: dispatch + flush → overlay shown.
        const e1 = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(e1);
        jest.advanceTimersByTime(1);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        // Second click within the debounce window (Date.now() still within 500ms).
        // Remove and re-add overlay to detect if it gets re-applied.
        document.documentElement.classList.remove('supermarket-splash-in');

        const e2 = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(e2);
        jest.advanceTimersByTime(1);

        // supermarket-splash-in should NOT be re-added (debounced).
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(false);
    });

    // ─── Entry-side cancel-dismissal hook ─────────────────────────────────

    it('cancels entry-side dismissal when user clicks during the fade-out window', () => {
        document.documentElement.classList.add('supermarket-splash', 'supermarket-splash-out');
        const cancelSpy = jest.fn(() => {
            document.documentElement.classList.remove('supermarket-splash-out');
        });
        window.__supermarketSplashCancelDismissal = cancelSpy;

        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(event);
        jest.advanceTimersByTime(1);

        expect(cancelSpy).toHaveBeenCalledTimes(1);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        delete window.__supermarketSplashCancelDismissal;
    });

    it('does not throw when window.__supermarketSplashCancelDismissal is absent', () => {
        expect(window.__supermarketSplashCancelDismissal).toBeUndefined();

        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        expect(() => {
            link.dispatchEvent(event);
            jest.advanceTimersByTime(1);
        }).not.toThrow();

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
    });

    // ─── destroy() ────────────────────────────────────────────────────────

    it('destroy() prevents click handler from showing the overlay', () => {
        const d = initPageTransition();
        d(); // destroy immediately

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(event);
        jest.advanceTimersByTime(1);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
        expect(event.defaultPrevented).toBe(false);
    });

    it('destroy() called after click but before setTimeout(0) fires makes the callback a no-op', () => {
        // Regression: a pending setTimeout(0) from a previous click should not
        // show the overlay after destroy() is called.
        const d = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        // Click fires capture handler → setTimeout(0) is scheduled.
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

        // destroy() BEFORE the setTimeout(0) fires.
        d();

        // Now flush the pending callback.
        jest.advanceTimersByTime(1);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
    });

    it('destroy() synchronously removes overlay classes and aria-busy if overlay is visible mid-transition', () => {
        // Regression: without DOM cleanup in destroy(), the UI would be stuck
        // in a loading/busy state if PageManager.destroy() is called while the
        // overlay is showing (e.g. SPA route teardown during navigation).
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/page/';
        document.body.appendChild(link);

        // Show the overlay.
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
        document.documentElement.setAttribute('aria-busy', 'true');

        // Tear down while overlay is visible.
        destroy();
        destroy = null;

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(false);
        expect(document.documentElement.getAttribute('aria-busy')).toBeNull();
    });

    // ─── bfcache restore (pageshow) ────────────────────────────────────────

    it('fades out stale splash on bfcache restore (pageshow persisted=true)', () => {
        destroy = initPageTransition();
        document.documentElement.classList.add('supermarket-splash');

        const event = new Event('pageshow');
        Object.defineProperty(event, 'persisted', { value: true });
        window.dispatchEvent(event);

        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        jest.advanceTimersByTime(350);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);
    });

    it('does nothing on pageshow when persisted=false', () => {
        destroy = initPageTransition();

        const event = new Event('pageshow');
        Object.defineProperty(event, 'persisted', { value: false });
        window.dispatchEvent(event);

        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);
    });

    // ─── pagehide safety net ───────────────────────────────────────────────

    it('clears the safety timer when pagehide fires (navigation proceeding)', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1); // Overlay shown, safety timer started.

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        // Simulate navigation proceeding — pagehide fires.
        const pageHideEvent = new Event('pagehide');
        Object.defineProperty(pageHideEvent, 'persisted', { value: false });
        window.dispatchEvent(pageHideEvent);

        // Advance past the safety timeout — overlay should NOT be removed
        // because pagehide cancelled the safety timer.
        jest.advanceTimersByTime(15000);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
    });

    it('removes overlay via safety timer if pagehide never fires (cancelled navigation)', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1); // Overlay shown.

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        // pagehide never fires — advance past SAFETY_TIMEOUT_MS (10000ms).
        jest.advanceTimersByTime(10001);

        // Safety timer fired: fade-out started (supermarket-splash-out added).
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(true);

        // Wait for the fade-out transition to complete (default 300ms).
        jest.advanceTimersByTime(350);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);
        expect(document.documentElement.getAttribute('aria-busy')).toBeNull();
    });

    it('removes overlay immediately on pagehide when going to bfcache (persisted=true)', () => {
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1); // Overlay shown.

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        // Page going to bfcache — overlay must be removed so cached snapshot is clean.
        const pageHideEvent = new Event('pagehide');
        Object.defineProperty(pageHideEvent, 'persisted', { value: true });
        window.dispatchEvent(pageHideEvent);

        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(false);
    });

    // ─── fadeOutTimer race conditions (Copilot comments #3 and #4) ────────

    it('new click during safety-timer fade-out cancels the stale cleanup so overlay stays visible', () => {
        // Regression: the old code had an untracked setTimeout inside
        // dismissOverlay(). If the safety timer fired and started the fade-out,
        // a subsequent click would re-show the overlay but the pending cleanup
        // would still fire and remove it mid-navigation.
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        // First click → overlay shown → safety timer started.
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);

        // Safety timer fires → fade-out starts.
        jest.advanceTimersByTime(10001);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(true);

        // Second click arrives during the fade-out window.
        // Advance time past DEBOUNCE_MS so the click is not debounced.
        jest.advanceTimersByTime(600);
        const link2 = document.createElement('a');
        link2.href = 'http://localhost/product/';
        document.body.appendChild(link2);
        link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1); // flush onClick's setTimeout(0)

        // Overlay re-shown, -out class removed.
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);

        // Now flush the original fade-out timer (300ms) — it must NOT remove the overlay.
        jest.advanceTimersByTime(350);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
    });

    it('new click during bfcache-restore fade-out cancels the stale cleanup so overlay stays visible', () => {
        // Regression: same issue as above but triggered by the onPageShow handler's
        // untracked setTimeout. A click immediately after bfcache restore (while
        // the old overlay is fading out) should not have its new overlay removed
        // by the stale bfcache cleanup callback.
        destroy = initPageTransition();

        // Simulate bfcache restore with a stale splash.
        document.documentElement.classList.add('supermarket-splash');
        const pageShowEvent = new Event('pageshow');
        Object.defineProperty(pageShowEvent, 'persisted', { value: true });
        window.dispatchEvent(pageShowEvent);

        // Fade-out started.
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(true);

        // User clicks a link before the fade-out completes.
        const link = document.createElement('a');
        link.href = 'http://localhost/product/';
        document.body.appendChild(link);
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1); // flush onClick's setTimeout(0)

        // New overlay shown, -out class removed.
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(false);

        // Flush the bfcache fade-out timer — must NOT remove the overlay.
        jest.advanceTimersByTime(350);
        expect(document.documentElement.classList.contains('supermarket-splash')).toBe(true);
    });

    // ─── CSS animation conflict: -in must be removed before -out ──────────

    it('dismissOverlay removes supermarket-splash-in before adding -out so fill-mode:both does not block the fade-out transition', () => {
        // Regression: .supermarket-splash-in uses animation fill-mode:both which
        // holds opacity:1 at its final state. If -in is still present when -out
        // is added, the animation value overrides opacity:0 from -out and the
        // CSS transition never runs.
        destroy = initPageTransition();

        const link = document.createElement('a');
        link.href = 'http://localhost/category/';
        document.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        jest.advanceTimersByTime(1); // overlay shown with both -splash and -in

        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(true);

        // Safety timer fires → dismissOverlay().
        jest.advanceTimersByTime(10001);

        // -in must be gone, -out must be present so the CSS transition can run.
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(true);
    });

    it('onPageShow removes supermarket-splash-in before adding -out on bfcache restore', () => {
        destroy = initPageTransition();

        // Simulate page cached mid-transition: both -splash and -in are present.
        document.documentElement.classList.add('supermarket-splash', 'supermarket-splash-in');

        const event = new Event('pageshow');
        Object.defineProperty(event, 'persisted', { value: true });
        window.dispatchEvent(event);

        // -in removed, -out added so the transition can fire.
        expect(document.documentElement.classList.contains('supermarket-splash-in')).toBe(false);
        expect(document.documentElement.classList.contains('supermarket-splash-out')).toBe(true);
    });
});
