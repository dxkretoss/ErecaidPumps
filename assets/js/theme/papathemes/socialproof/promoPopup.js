/**
 * Papathemes Social Proof — Promo popup definition builder.
 *
 * Timer-based sibling to exitIntentPopup. Fires `delay` seconds after page
 * load, and optionally auto-hides after `duration` seconds. Frequency cap
 * persisted in localStorage under `papathemes-promo-shown`.
 *
 * The modal DOM is duplicated from exitIntentPopup (rather than importing a
 * shared builder) so each popup remains self-contained — easier to evolve
 * independently (e.g., the promo popup may later add imagery or a form).
 */

import { createStorage } from './storage';
import { installFocusTrap, copyToClipboard } from './popupUtils';
import { appendDemoNote } from './demoNote';

const STORAGE_KEY = 'papathemes-promo-shown';

function buildPromoModal(config, onClose) {
    const wrap = document.createElement('div');
    wrap.className = 'papathemes-socialproof-popup papathemes-socialproof-popup--promo';

    const overlay = document.createElement('div');
    overlay.className = 'papathemes-socialproof-popup__overlay';
    overlay.addEventListener('click', onClose);
    wrap.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'papathemes-socialproof-popup__modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'papathemes-promo-title');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'papathemes-socialproof-popup__close';
    closeBtn.setAttribute('aria-label', config.lang.close || 'Close');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', onClose);
    modal.appendChild(closeBtn);

    const title = document.createElement('h2');
    title.id = 'papathemes-promo-title';
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

    // Theme-editor demo preview — append a small secondary notice inside
    // the modal. Only fires when getSettings() filled promo from
    // DEMO_OVERRIDES (never present on merchant-configured promo).
    if (config.__demo === true) {
        appendDemoNote(modal);
    }

    wrap.appendChild(modal);
    return { wrap, modal };
}

export function buildPromoPopupDef(promoConfig, lang) {
    const storage = createStorage('local');
    const timing = promoConfig.timing || {};
    // Use explicit numeric checks so `0` is not coerced to the default —
    // 0 is a valid, meaningful value (show immediately / no cooldown).
    const delay = Number.isFinite(timing.delay) ? timing.delay : 5;
    const duration = Number.isFinite(timing.duration) ? timing.duration : 0;
    const freqDays = Number.isFinite(timing.freqDays) ? timing.freqDays : 0;

    return {
        type: 'promo',
        priority: 2,
        delay,
        isExitIntent: false,

        canShow() {
            if (!promoConfig.enabled) return false;
            if (!promoConfig.title || !promoConfig.description) return false;
            const shownAt = parseInt(storage.get(STORAGE_KEY) || '0', 10);
            if (freqDays > 0 && shownAt > 0) {
                const elapsedMs = Date.now() - shownAt;
                if (elapsedMs < freqDays * 86400000) return false;
            }
            return true;
        },

        show(managerOnClose) {
            // All internal close triggers (overlay click, X button, Esc key,
            // auto-hide timer) call `requestClose`. When this popup is shown
            // via PopupManager, `requestClose` routes through the manager's
            // wrapped close path (so body scroll is unlocked, `activePopup`
            // is cleared, and `markShown` runs). When shown standalone,
            // `requestClose` falls back to the local teardown.
            let cleanup;
            const requestClose = () => {
                if (typeof managerOnClose === 'function') {
                    managerOnClose();
                    return;
                }
                if (cleanup) cleanup();
            };
            const { wrap, modal } = buildPromoModal(
                { ...promoConfig, lang },
                requestClose,
            );
            document.body.appendChild(wrap);
            const detach = installFocusTrap(modal, requestClose);
            let autoTimer = null;
            cleanup = () => {
                if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
                detach();
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
            };
            if (duration > 0) {
                autoTimer = setTimeout(requestClose, duration * 1000);
            }
            return cleanup;
        },

        markShown() {
            storage.set(STORAGE_KEY, String(Date.now()));
        },
    };
}
