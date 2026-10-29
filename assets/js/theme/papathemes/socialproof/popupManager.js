/**
 * Papathemes Social Proof — Popup Manager.
 *
 * Coordinates multiple popup types (exit-intent, promo, newsletter) so they
 * never stack on top of each other. Popups are registered as definition
 * objects; the manager owns timing, conflict detection, and lifecycle.
 *
 * Definition contract:
 *   {
 *     type:          string,           // label, e.g. 'exit' / 'promo' / 'newsletter'
 *     priority:      number,           // lower = higher priority (fired first)
 *     delay:         number,           // seconds before first show attempt (timer-based popups only)
 *     isExitIntent:  boolean,          // if true, uses installTrigger() instead of setTimeout
 *     canShow():     boolean,          // called before every show — freq caps, scope checks, etc.
 *     installTrigger(fire): cleanup,   // (exit only) attach event listeners that call fire()
 *     show(managerOnClose): closeFn,   // render the popup. The popup SHOULD route its own
 *                                      //   close handlers (X, overlay, Esc, auto-timer) through
 *                                      //   `managerOnClose` so the manager's scroll-unlock +
 *                                      //   markShown + activePopup cleanup runs. If the popup
 *                                      //   calls its returned closeFn directly (e.g., when
 *                                      //   invoked outside a manager), full DOM teardown still
 *                                      //   happens but manager bookkeeping is skipped.
 *     markShown():   void,             // called after a successful show — usually persists a timestamp
 *   }
 *
 * Conflict detection keeps the popup from racing against the site's own modal
 * system (e.g. cart drawer, mobile menu, Foundation Reveal via .has-activeModal).
 */

/* eslint-disable no-param-reassign */
// `popup._close` is set on the definition object so that `closeActive()` and
// re-entrancy are safe without the manager tracking close functions in a
// separate Map. The mutation is intentional, not accidental parameter
// shadowing.
import { lockBodyScroll, unlockBodyScroll } from './popupUtils';

export class PopupManager {
    constructor() {
        this.popups = [];
        this.activePopup = null;
        this.timers = [];
        this.exitCleanups = [];
        // Popups whose first tryShow() was blocked by a conflict
        // (another modal open, cart dropdown expanded, etc.). We retry
        // them periodically so a timer-based promo/newsletter that
        // happened to fire while the user had the cart drawer open is
        // NOT permanently skipped — it waits until the overlay clears.
        this._pending = new Set();
        this._retryTimer = null;
    }

    register(def) {
        if (def && typeof def === 'object' && typeof def.show === 'function') {
            this.popups.push(def);
        }
    }

    hasConflictingOverlay() {
        // Selectors below target Supermarket's actual overlay systems:
        //   - .has-activeModal is added by Modal wrapper in theme/global/modal.js
        //     whenever a Foundation Reveal modal is open (Quick View, bulk
        //     pricing, cart reconfigure, newsletter's own modal, etc.).
        //   - .has-activeNavPages is added by mobile-menu-toggle.js when the
        //     hamburger menu is expanded on mobile.
        //   - .is-open.f-open-dropdown is the class pair that StencilDropDown
        //     (theme/global/stencil-dropdown.js) puts on any open dropdown —
        //     cart preview, quick search, currency selector, account menu.
        //     Popping a discount/exit modal while one of these is open
        //     would cover the dropdown and confuse the user, so we defer.
        if (document.body.classList.contains('has-activeModal')) return true;
        if (document.body.classList.contains('has-activeNavPages')) return true;
        if (document.querySelector('.is-open.f-open-dropdown')) return true;
        return false;
    }

    tryShow(popup) {
        // Popup-side veto (frequency cap, scope check) is final — do
        // NOT retry in this case, the popup genuinely should not show
        // right now (e.g., already shown within cooldown window).
        if (typeof popup.canShow === 'function' && !popup.canShow()) {
            this._pending.delete(popup);
            return;
        }
        // Manager-side conflict (another modal / dropdown / nav open)
        // is transient — queue for retry once the overlay clears.
        if (this.activePopup || this.hasConflictingOverlay()) {
            this._enqueuePending(popup);
            return;
        }

        // Got this far — no conflict. Show it, and remove from pending
        // queue if it was waiting.
        this._pending.delete(popup);
        this.activePopup = popup;
        lockBodyScroll();

        // Build the manager-owned close callback BEFORE calling show() so the
        // popup can route its internal close handlers (overlay/X/Esc/auto-timer,
        // Foundation modal 'closed' event, etc.) through it. Re-entrant calls
        // are guarded so teardown only runs once.
        //
        // markShown() is deliberately NOT called here — see below for why.
        let close;
        let closing = false;
        const managerOnClose = () => {
            if (closing) return;
            closing = true;
            try { if (typeof close === 'function') close(); } catch (e) { /* noop */ }
            unlockBodyScroll();
            this.activePopup = null;
        };

        try {
            close = popup.show(managerOnClose);
        } catch (e) {
            // If show() blows up, don't wedge the manager — clear active flag and bail.
            unlockBodyScroll();
            this.activePopup = null;
            // eslint-disable-next-line no-console
            console.warn('[papathemes-socialproof] popup show() failed', e);
            return;
        }

        // Stored on the popup itself (not the manager) so closeActive() /
        // re-entrancy is safe.
        popup._close = managerOnClose;

        // Mark as shown immediately after a successful show — NOT in the
        // close path. Rationale: a shopper who navigates to another page
        // (Cmd+click a link, back-button, hit checkout) does not
        // necessarily close the popup via X/overlay/Esc, so a close-path
        // markShown leaves the frequency cookie/localStorage unset and
        // the popup re-appears on the next page. This also matches
        // legacy newsletter behavior, which writes NL_POPUP_LAST right
        // BEFORE showing the modal.
        if (typeof popup.markShown === 'function') {
            try { popup.markShown(); } catch (e) { /* noop */ }
        }

        // Suppress any remaining popups for the rest of the page's
        // lifetime — only ONE popup per page visit, matching the PR
        // documentation ("closing exit should not cause promo to auto-
        // appear"). Without this step, a lower-priority timer popup
        // (promo/newsletter) whose setTimeout fired while the active
        // popup was showing would be queued in `_pending` and then
        // retried the moment the active popup closes, producing a
        // "popup chain" the shopper never consented to.
        this._suppressRemaining();
    }

    /**
     * Cancel every pending trigger on the manager so that whatever
     * popup just showed is the last one this page sees. Cancels
     * timer-based triggers, detaches exit-intent listeners, clears the
     * retry queue, and stops the retry loop. Called after a successful
     * show in tryShow().
     */
    _suppressRemaining() {
        this.timers.forEach(clearTimeout);
        this.timers = [];
        this.exitCleanups.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
        this.exitCleanups = [];
        this._pending.clear();
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
    }

    closeActive() {
        if (!this.activePopup) return;
        if (typeof this.activePopup._close === 'function') this.activePopup._close();
    }

    /**
     * Queue a popup whose tryShow was blocked by a transient conflict
     * (another modal / dropdown / nav open). Starts a retry loop that
     * re-attempts every 1 second until the queue empties or the loop
     * runs for MAX_RETRY_MS without progress.
     */
    _enqueuePending(popup) {
        this._pending.add(popup);
        if (this._retryTimer) return;

        const RETRY_INTERVAL_MS = 1000;
        // Cap the retry horizon — if the conflict persists for 2 minutes
        // the user is clearly using the overlay intentionally, and
        // popping a modal on top would be intrusive anyway.
        const MAX_RETRY_MS = 120000;
        const startedAt = Date.now();

        const tick = () => {
            this._retryTimer = null;
            if (!this._pending.size) return;
            if (Date.now() - startedAt > MAX_RETRY_MS) {
                this._pending.clear();
                return;
            }
            // Walk pending in priority order (popups array is already
            // sorted from start()). Attempt each; if one fires it will
            // occupy activePopup and subsequent attempts in the same
            // tick short-circuit. Unfired ones remain pending for the
            // next tick. `for...of + if` replaces `continue` to keep
            // airbnb-eslint happy.
            for (const p of this.popups) {
                if (this._pending.has(p)) {
                    this.tryShow(p);
                    if (this.activePopup) break;
                    // If tryShow succeeded without activePopup (popup.canShow
                    // returned false) it removed itself from pending already.
                }
            }
            if (this._pending.size) {
                this._retryTimer = setTimeout(tick, RETRY_INTERVAL_MS);
            }
        };
        this._retryTimer = setTimeout(tick, RETRY_INTERVAL_MS);
    }

    start() {
        this.popups.sort((a, b) => a.priority - b.priority);

        // Timer-based popups: fire after `delay` seconds.
        this.popups.forEach((popup) => {
            if (popup.isExitIntent) return;
            const delayMs = (popup.delay || 0) * 1000;
            const timer = setTimeout(() => this.tryShow(popup), delayMs);
            this.timers.push(timer);
        });

        // Exit-intent popups manage their own trigger (mouseleave + mobile inactivity).
        this.popups
            .filter((p) => p.isExitIntent && typeof p.installTrigger === 'function')
            .forEach((popup) => {
                const cleanup = popup.installTrigger(() => this.tryShow(popup));
                if (typeof cleanup === 'function') this.exitCleanups.push(cleanup);
            });
    }

    destroy() {
        this.timers.forEach(clearTimeout);
        this.timers = [];
        this.exitCleanups.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
        this.exitCleanups = [];
        // Cancel the pending-retry loop so timers do not leak into the
        // next InstantLoad-initialized manager instance.
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
        this._pending.clear();
        this.closeActive();
    }
}
