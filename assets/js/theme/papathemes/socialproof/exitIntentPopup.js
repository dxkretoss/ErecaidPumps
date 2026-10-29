/**
 * Papathemes Social Proof — Exit Intent popup definition builder.
 *
 * Returns a popup definition for the PopupManager. Triggers:
 *   - Desktop: `mouseleave` on the documentElement with clientY <= 0
 *     (cursor moving toward the tab bar / URL bar).
 *   - Mobile:  inactivity timer that resets on any user activity
 *     (touchstart / scroll / click / keydown). Pointer-type detection via
 *     `matchMedia('(pointer: fine)')` — coarse pointers treated as mobile.
 *
 * Frequency cap persisted in localStorage under `papathemes-exit-shown`
 * (epoch-ms of last show). `freqDays = 0` disables the cap.
 */

import { createStorage } from './storage';
import { installFocusTrap, copyToClipboard } from './popupUtils';
import { appendDemoNote } from './demoNote';

const STORAGE_KEY = 'papathemes-exit-shown';

function installExitTrigger(fire, mobileDelayMs) {
    const isDesktop = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    const cleanups = [];
    let fired = false;

    // Run every registered cleanup exactly once. Each cleanup is wrapped in
    // try/catch so a throw in one does not leave the rest attached.
    const cleanupAll = () => {
        while (cleanups.length) {
            const fn = cleanups.shift();
            try { fn(); } catch (e) { /* noop */ }
        }
    };

    // Fire once, then proactively detach every listener / clear the mobile
    // inactivity timer. Previously only a `fired` flag was flipped, which
    // left scroll/touch/click listeners (passive: true, but still wake the
    // event loop) and the mobile setTimeout running for the rest of the
    // page's lifetime.
    const once = () => {
        if (fired) return;
        fired = true;
        cleanupAll();
        fire();
    };

    if (isDesktop) {
        const onLeave = (e) => {
            if (e.clientY <= 0) once();
        };
        document.documentElement.addEventListener('mouseleave', onLeave);
        cleanups.push(() => document.documentElement.removeEventListener('mouseleave', onLeave));
    } else {
        let timer = setTimeout(once, mobileDelayMs);
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(once, mobileDelayMs);
        };
        const events = ['touchstart', 'scroll', 'click', 'keydown'];
        events.forEach((ev) => {
            document.addEventListener(ev, reset, { passive: true });
            cleanups.push(() => document.removeEventListener(ev, reset));
        });
        cleanups.push(() => clearTimeout(timer));
    }

    // Returned by PopupManager.start() for teardown in manager.destroy() —
    // also called if the popup needs to be cancelled before firing.
    return cleanupAll;
}

function buildDiscountModal(config, onClose) {
    const wrap = document.createElement('div');
    wrap.className = 'papathemes-socialproof-popup papathemes-socialproof-popup--exit';

    const overlay = document.createElement('div');
    overlay.className = 'papathemes-socialproof-popup__overlay';
    overlay.addEventListener('click', onClose);
    wrap.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'papathemes-socialproof-popup__modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'papathemes-exit-title');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'papathemes-socialproof-popup__close';
    closeBtn.setAttribute('aria-label', config.lang.close || 'Close');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', onClose);
    modal.appendChild(closeBtn);

    const title = document.createElement('h2');
    title.id = 'papathemes-exit-title';
    title.className = 'papathemes-socialproof-popup__title';
    title.textContent = config.title;
    modal.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'papathemes-socialproof-popup__description';
    desc.textContent = config.description;
    modal.appendChild(desc);

    if (config.coupon) {
        const codeWrap = document.createElement('div');
        codeWrap.className = 'papathemes-socialproof-popup__code';
        const code = document.createElement('code');
        code.textContent = config.coupon;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'papathemes-socialproof-popup__copy button button--primary button--small';
        copyBtn.textContent = config.lang.copyCode;
        copyBtn.addEventListener('click', async () => {
            const ok = await copyToClipboard(config.coupon);
            if (ok) {
                copyBtn.textContent = config.lang.copied;
                setTimeout(() => { copyBtn.textContent = config.lang.copyCode; }, 2000);
            }
        });
        codeWrap.appendChild(code);
        codeWrap.appendChild(copyBtn);
        modal.appendChild(codeWrap);
    }

    if (config.buttonText) {
        const btn = document.createElement('a');
        btn.href = config.buttonUrl || '/';
        btn.className = 'papathemes-socialproof-popup__cta button button--primary';
        btn.textContent = config.buttonText;
        // "Claim Discount":
        //   - Cart has items → copy coupon to clipboard + go to /checkout
        //     (coupon is ready to paste at checkout).
        //   - Cart empty → close popup and stay on current page
        //     (nothing to check out; navigating to checkout would be confusing).
        // Cart quantity is read from localStorage ('cart-quantity') — the same
        // key written by cart-preview.js on every cart-quantity-update event,
        // so it is always current without an extra API call.
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const cartQty = Number(localStorage.getItem('cart-quantity') || 0);
            if (cartQty > 0) {
                if (config.coupon) {
                    try { await copyToClipboard(config.coupon); } catch (_) { /* noop */ }
                }
                // Countdown 3→2→1 on button text before redirecting so the
                // shopper sees the coupon was copied and knows a redirect is coming.
                btn.disabled = true;
                let seconds = 3;
                const tick = () => {
                    btn.textContent = config.lang.redirectingIn
                        ? config.lang.redirectingIn.replace('__N__', seconds)
                        : `${config.lang.copied || 'Copied!'} Redirecting in ${seconds}...`;
                    if (seconds <= 0) {
                        onClose();
                        window.location.href = '/checkout';
                        return;
                    }
                    seconds -= 1;
                    setTimeout(tick, 1000);
                };
                tick();
            } else {
                onClose();
            }
        });
        modal.appendChild(btn);
    }

    const noThanks = document.createElement('button');
    noThanks.type = 'button';
    noThanks.className = 'papathemes-socialproof-popup__no-thanks';
    noThanks.textContent = config.lang.noThanks;
    noThanks.addEventListener('click', onClose);
    modal.appendChild(noThanks);

    // Theme-editor demo preview — append a small secondary notice inside
    // the modal. Only fires when getSettings() filled exit from
    // DEMO_OVERRIDES (never present on merchant-configured exit).
    if (config.__demo === true) {
        appendDemoNote(modal);
    }

    wrap.appendChild(modal);
    return { wrap, modal };
}

export function buildExitIntentPopupDef(exitConfig, lang) {
    const storage = createStorage('local');
    // Explicit numeric check so merchants can set mobileDelay: 0 for
    // testing (fire immediately) without the `||` coercing it back to 45.
    const mobileDelayMs = (Number.isFinite(exitConfig.mobileDelay) ? exitConfig.mobileDelay : 45) * 1000;
    const freqDays = Number.isFinite(exitConfig.freqDays) ? exitConfig.freqDays : 0;
    // Only `discount` is implemented today. Warn if a merchant set a
    // reserved-for-future mode so the mismatch is visible in DevTools
    // instead of silently rendering a discount popup.
    if (exitConfig.mode && exitConfig.mode !== 'discount') {
        // eslint-disable-next-line no-console
        console.warn(`[papathemes-socialproof] exit.mode="${exitConfig.mode}" is not yet implemented; falling back to "discount" markup.`);
    }

    return {
        type: 'exit',
        priority: 1,
        delay: 0,
        isExitIntent: true,

        canShow() {
            if (!exitConfig.enabled) return false;
            if (!exitConfig.title || !exitConfig.description) return false;
            const shownAt = parseInt(storage.get(STORAGE_KEY) || '0', 10);
            if (freqDays > 0 && shownAt > 0) {
                const elapsedMs = Date.now() - shownAt;
                if (elapsedMs < freqDays * 86400000) return false;
            }
            return true;
        },

        installTrigger(fire) {
            return installExitTrigger(fire, mobileDelayMs);
        },

        show(managerOnClose) {
            // `requestClose` is what all internal close handlers (overlay click,
            // X button, Esc key) invoke. When this popup is shown via
            // PopupManager, `requestClose` routes through the manager's wrapped
            // close path (unlock body scroll, clear `activePopup`, run
            // `markShown`). When shown standalone, `requestClose` falls back to
            // the local teardown.
            let cleanup;
            const requestClose = () => {
                if (typeof managerOnClose === 'function') {
                    managerOnClose();
                    return;
                }
                if (cleanup) cleanup();
            };
            const { wrap, modal } = buildDiscountModal(
                { ...exitConfig, lang },
                requestClose,
            );
            document.body.appendChild(wrap);
            const detach = installFocusTrap(modal, requestClose);
            cleanup = () => {
                detach();
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
            };
            return cleanup;
        },

        markShown() {
            storage.set(STORAGE_KEY, String(Date.now()));
        },
    };
}
