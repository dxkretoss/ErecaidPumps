import { isInThemeEditor, onPageBuilderEditMode } from '../../../../theme/papathemes/socialproof/editorMode';

describe('isInThemeEditor()', () => {
    afterEach(() => {
        // Clean up any previewSdk mock installed by a test.
        try { delete window.previewSdk; } catch (e) { /* noop */ }
    });

    it('returns false when window.previewSdk is missing', () => {
        expect(isInThemeEditor()).toBe(false);
    });

    it('returns false when window.previewSdk exists but themeEditor is missing', () => {
        window.previewSdk = {};
        expect(isInThemeEditor()).toBe(false);
    });

    it('returns false when window.previewSdk.themeEditor is falsy', () => {
        window.previewSdk = { themeEditor: null };
        expect(isInThemeEditor()).toBe(false);
        window.previewSdk = { themeEditor: undefined };
        expect(isInThemeEditor()).toBe(false);
        window.previewSdk = { themeEditor: false };
        expect(isInThemeEditor()).toBe(false);
    });

    it('returns true when window.previewSdk.themeEditor is truthy (object)', () => {
        window.previewSdk = { themeEditor: {} };
        expect(isInThemeEditor()).toBe(true);
    });

    it('returns true when window.previewSdk.themeEditor is truthy (non-empty)', () => {
        window.previewSdk = { themeEditor: { id: 'editor-abc' } };
        expect(isInThemeEditor()).toBe(true);
    });

    it('returns false when accessing window.previewSdk throws', () => {
        Object.defineProperty(window, 'previewSdk', {
            configurable: true,
            get() { throw new Error('cross-origin or getter error'); },
        });
        expect(isInThemeEditor()).toBe(false);
    });
});

describe('onPageBuilderEditMode()', () => {
    let cleanup = null;

    afterEach(() => {
        if (typeof cleanup === 'function') cleanup();
        cleanup = null;
    });

    function dispatch(data) {
        window.dispatchEvent(new MessageEvent('message', { data }));
    }

    const toggle = (editMode) => ({ action: 'toggle-edit-mode', initiator: 'PAGE_BUILDER', editMode });

    it('calls the handler with false when Page Builder enters Preview', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        dispatch(toggle(false));
        expect(handler).toHaveBeenCalledWith(false);
    });

    it('calls the handler with true when Page Builder enters Design', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        dispatch(toggle(true));
        expect(handler).toHaveBeenCalledWith(true);
    });

    it('parses a JSON string payload (flex-banners widget style)', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        dispatch(JSON.stringify(toggle(false)));
        expect(handler).toHaveBeenCalledWith(false);
    });

    it('ignores messages from a different initiator', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        dispatch({ action: 'toggle-edit-mode', initiator: 'SOMETHING_ELSE', editMode: false });
        expect(handler).not.toHaveBeenCalled();
    });

    it('ignores messages with a different action', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        dispatch({ action: 'sdk-loaded', initiator: 'PAGE_BUILDER' });
        expect(handler).not.toHaveBeenCalled();
    });

    it('does not throw on a non-JSON string payload', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        expect(() => dispatch('not-json{')).not.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    it('does not throw on a null/undefined payload', () => {
        const handler = jest.fn();
        cleanup = onPageBuilderEditMode(handler);
        expect(() => dispatch(null)).not.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    it('removes the listener on cleanup', () => {
        const handler = jest.fn();
        const off = onPageBuilderEditMode(handler);
        off();
        dispatch(toggle(false));
        expect(handler).not.toHaveBeenCalled();
    });
});
