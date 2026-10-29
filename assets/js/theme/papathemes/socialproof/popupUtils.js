/**
 * Papathemes Social Proof — shared popup utilities.
 *
 * Small, dependency-free helpers used by the modal popups (exit-intent, promo)
 * and the PopupManager. Exported individually so Webpack can tree-shake what
 * the consumers don't use.
 *
 * - `lockBodyScroll` / `unlockBodyScroll` use a body-level dataset marker so
 *   repeated calls don't double-apply or clobber existing overflow values.
 * - `installFocusTrap` keeps Tab/Shift+Tab inside the container and calls
 *   `onEscape` on Escape. Returns a detach function.
 * - `copyToClipboard` prefers the async Clipboard API and falls back to the
 *   legacy `execCommand('copy')` textarea trick so older browsers still work.
 * - `createSvgUse` returns an <svg><use href="#id"/></svg> element ready to
 *   drop in next to the sprite that is already loaded by the theme.
 */

export function lockBodyScroll() {
    if (document.body.dataset.papathemesScrollLock) return;
    // Capture whatever inline overflow was set by other theme code before
    // we clobber it, so unlockBodyScroll can restore the exact prior
    // value (instead of assuming the caller wanted empty string).
    // A separate "had" flag avoids the ambiguity where
    // papathemesScrollLockPrevOverflow === '' could mean "empty string
    // was the prior value" OR "we never set this attr".
    document.body.dataset.papathemesScrollLockPrevOverflow = document.body.style.overflow || '';
    document.body.dataset.papathemesScrollLockHadPrevOverflow = '1';
    document.body.style.overflow = 'hidden';
    document.body.dataset.papathemesScrollLock = '1';
}

export function unlockBodyScroll() {
    if (!document.body.dataset.papathemesScrollLock) return;
    if (document.body.dataset.papathemesScrollLockHadPrevOverflow) {
        document.body.style.overflow = document.body.dataset.papathemesScrollLockPrevOverflow;
    }
    delete document.body.dataset.papathemesScrollLock;
    delete document.body.dataset.papathemesScrollLockPrevOverflow;
    delete document.body.dataset.papathemesScrollLockHadPrevOverflow;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function installFocusTrap(container, onEscape) {
    const getFocusable = () => Array.from(container.querySelectorAll(FOCUSABLE));

    function onKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (typeof onEscape === 'function') onEscape();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusable = getFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    container.addEventListener('keydown', onKeydown);
    const first = getFocusable()[0];
    if (first) first.focus();

    return () => container.removeEventListener('keydown', onKeydown);
}

export async function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) { /* fallthrough to legacy path */ }
    }
    // Legacy fallback — hidden textarea + execCommand('copy').
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        return false;
    }
}

export function createSvgUse(id) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${id}`);
    svg.appendChild(use);
    return svg;
}
