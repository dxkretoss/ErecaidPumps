/**
 * True only while actively editing in Page Builder (`window.previewSdk.themeEditor`).
 * NARROWER than theme.js's `!window.previewSdk` guard, so popups still run in admin Preview and live.
 */
export function isInThemeEditor() {
    if (typeof window === 'undefined') return false;
    try {
        return Boolean(window.previewSdk && window.previewSdk.themeEditor);
    } catch (e) {
        return false;
    }
}

/**
 * Listen for Page Builder's Design/Preview toggle inside the storefront iframe.
 * editMode true = Design (suppress popups), false = Preview (show popups).
 * @param {(editMode: boolean) => void} handler invoked with the new edit mode.
 * @returns {() => void} cleanup — removes the message listener.
 */
export function onPageBuilderEditMode(handler) {
    if (typeof window === 'undefined') return () => {};

    const onMessage = (e) => {
        // No origin check: matches BC's flex-banners widget, the parent origin
        // is not a stable hardcodable value, and nothing sensitive is gated here.
        try {
            // e.data may be a plain object or a JSON string depending on the store.
            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (
                data
                && data.initiator === 'PAGE_BUILDER'
                && data.action === 'toggle-edit-mode'
            ) {
                handler(Boolean(data.editMode));
            }
        } catch (err) {
            // ignore
        }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
}
