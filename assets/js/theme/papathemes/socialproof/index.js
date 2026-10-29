/**
 * Papathemes Social Proof — module entry point.
 * Sets `window.__papathemesSocialproofActive = true` so the legacy
 * newsletter-popup.js skips its own auto-init.
 */

import { getSettings } from './settings';
import { initUrgency } from './urgency';
import { initStockPill } from './stockPill';
import { initCartGoalBar } from './cartGoalBar';
import { initRecentSales } from './recentSales';
import { PopupManager } from './popupManager';
import { buildExitIntentPopupDef } from './exitIntentPopup';
import { buildPromoPopupDef } from './promoPopup';
import { newsletterPopupDef } from '../../../emthemes-modez/newsletter-popup';
import { isInThemeEditor, onPageBuilderEditMode } from './editorMode';

/** Read popup i18n strings from the `[data-papathemes-popup-host]` dataset. */
function readPopupLang() {
    const host = document.querySelector('[data-papathemes-popup-host]');
    const ds = (host && host.dataset) || {};
    return {
        close: ds.langClose || 'Close',
        copyCode: ds.langCopyCode || 'Copy Code',
        copied: ds.langCopied || 'Copied!',
        noThanks: ds.langNoThanks || 'No thanks',
        redirectingIn: ds.langRedirectingIn || 'Redirecting in __N__...',
    };
}

/** @type {string} jQuery event namespace, so destroy() `.off()`s only our handlers. */
const JQ_NAMESPACE = '.papathemesSocialproof';

/**
 * Initialize every socialproof feature.
 * @param {Object} context BigCommerce Stencil page context
 * @returns {() => void} destroy — call before re-init on InstantLoad nav.
 */
export default function initSocialProof(context) {
    const cleanups = [];

    // Reset before init so a throw below can't leave it stale for legacy newsletter-popup.
    if (typeof window !== 'undefined') {
        window.__papathemesSocialproofActive = false;
    }

    try {
        const settings = getSettings();

        // One-shot snapshot (BC injects themeEditor synchronously); the toggle below corrects it.
        const inEditor = isInThemeEditor();

        // Stock pill must init regardless of urgency, which is opt-in and OFF by default.
        const urgencyEnabled = !!(settings.urgency && settings.urgency.enabled);

        cleanups.push(initStockPill(document));
        if (urgencyEnabled) {
            cleanups.push(initUrgency({ scope: document, config: settings.urgency }));
        }

        // Quick View injects product-view.html into a modal — re-init on Foundation's 'opened' event.
        const $body = $('body');
        let quickViewCleanup = null;
        const runQuickViewCleanup = () => {
            if (typeof quickViewCleanup !== 'function') return;
            try { quickViewCleanup(); } catch (e) { /* noop */ }
            quickViewCleanup = null;
        };
        const onModalOpen = (e) => {
            const scope = e && e.target;
            if (!scope || !scope.querySelector) return;
            // Back-to-back opens may skip 'closed' on older Foundation.
            runQuickViewCleanup();

            const modalCleanups = [];
            if (scope.querySelector('[data-papathemes-stock-pill]')) {
                modalCleanups.push(initStockPill(scope));
            }
            if (urgencyEnabled && scope.querySelector('[data-papathemes-urgency]')) {
                modalCleanups.push(initUrgency({ scope, config: settings.urgency }));
            }
            quickViewCleanup = () => {
                while (modalCleanups.length) {
                    const fn = modalCleanups.pop();
                    try { if (typeof fn === 'function') fn(); } catch (err) { /* noop */ }
                }
            };
        };
        const onModalClose = () => runQuickViewCleanup();
        $body.off(`opened.fndtn.reveal${JQ_NAMESPACE}`);
        $body.off(`closed.fndtn.reveal${JQ_NAMESPACE}`);
        $body.on(`opened.fndtn.reveal${JQ_NAMESPACE}`, onModalOpen);
        $body.on(`closed.fndtn.reveal${JQ_NAMESPACE}`, onModalClose);
        cleanups.push(() => {
            $body.off(`opened.fndtn.reveal${JQ_NAMESPACE}`);
            $body.off(`closed.fndtn.reveal${JQ_NAMESPACE}`);
            runQuickViewCleanup();
        });

        cleanups.push(initCartGoalBar(settings.cartGoal));

        // Idempotent start/stop so Page Builder's Design/Preview toggle can cycle without leaking timers/listeners.
        let popupsRunning = false;
        let popupManager = null;
        let stopRecentSales = null;

        const startPopups = () => {
            if (popupsRunning) return;
            popupsRunning = true;

            const popupLang = readPopupLang();

            // Recent sales init is async; don't await so stopPopups() stays sync (cleanup
            // arrives via the promise, running immediately if stop happened before it resolved).
            const recentSalesP = Promise.resolve(initRecentSales(settings.recentSales, context));
            let recentSalesCleanup = null;
            let stoppedBeforeReady = false;
            recentSalesP
                .then((cleanup) => {
                    if (typeof cleanup !== 'function') return;
                    if (stoppedBeforeReady) {
                        try { cleanup(); } catch (e) { /* noop */ }
                    } else {
                        recentSalesCleanup = cleanup;
                    }
                })
                .catch((err) => {
                    // eslint-disable-next-line no-console
                    console.warn('[papathemes-socialproof] recent sales init failed', err);
                });
            stopRecentSales = () => {
                if (recentSalesCleanup) {
                    try { recentSalesCleanup(); } catch (e) { /* noop */ }
                    recentSalesCleanup = null;
                } else {
                    stoppedBeforeReady = true;
                }
            };

            popupManager = new PopupManager();
            popupManager.register(buildExitIntentPopupDef(settings.exit, popupLang));
            popupManager.register(buildPromoPopupDef(settings.promo, popupLang));
            popupManager.register(newsletterPopupDef(context));
            popupManager.start();
        };

        const stopPopups = () => {
            if (!popupsRunning) return;
            popupsRunning = false;
            if (popupManager) {
                try { popupManager.destroy(); } catch (e) { /* noop */ }
                popupManager = null;
            }
            if (stopRecentSales) {
                try { stopRecentSales(); } catch (e) { /* noop */ }
                stopRecentSales = null;
            }
        };
        cleanups.push(stopPopups);

        if (inEditor) {
            // Default to Design (suppressed) on load; only show in Preview.
            const stopListening = onPageBuilderEditMode((editMode) => {
                if (editMode === false) {
                    startPopups();
                } else {
                    stopPopups();
                }
            });
            cleanups.push(stopListening);
        } else {
            startPopups();
        }

        if (typeof window !== 'undefined') {
            window.__papathemesSocialproofActive = true;
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[papathemes-socialproof] init failed — falling back to legacy popup handling', err);
    }

    return () => {
        while (cleanups.length) {
            const fn = cleanups.pop();
            try { if (typeof fn === 'function') fn(); } catch (e) { /* noop */ }
        }
        if (typeof window !== 'undefined') {
            window.__papathemesSocialproofActive = false;
        }
    };
}
