/**
 * @jest-environment jsdom
 */

// Every feature module is mocked so initSocialProof runs in isolation and
// we can assert which initializers fire under each settings combination.
// The focus is the decoupling of the stock pill from the urgency flag:
// stock display is a native BigCommerce feature and must initialize
// regardless of whether the merchant opted into the urgency social-proof.
jest.mock('../../../../theme/papathemes/socialproof/settings', () => ({ getSettings: jest.fn() }));
jest.mock('../../../../theme/papathemes/socialproof/urgency', () => ({ initUrgency: jest.fn(() => jest.fn()) }));
jest.mock('../../../../theme/papathemes/socialproof/stockPill', () => ({ initStockPill: jest.fn(() => jest.fn()) }));
jest.mock('../../../../theme/papathemes/socialproof/cartGoalBar', () => ({ initCartGoalBar: jest.fn(() => jest.fn()) }));
jest.mock('../../../../theme/papathemes/socialproof/recentSales', () => ({ initRecentSales: jest.fn(() => jest.fn()) }));
jest.mock('../../../../theme/papathemes/socialproof/popupManager', () => ({
    PopupManager: jest.fn().mockImplementation(() => ({
        register: jest.fn(),
        start: jest.fn(),
        destroy: jest.fn(),
    })),
}));
jest.mock('../../../../theme/papathemes/socialproof/exitIntentPopup', () => ({ buildExitIntentPopupDef: jest.fn(() => ({})) }));
jest.mock('../../../../theme/papathemes/socialproof/promoPopup', () => ({ buildPromoPopupDef: jest.fn(() => ({})) }));
jest.mock('../../../../emthemes-modez/newsletter-popup', () => ({ newsletterPopupDef: jest.fn(() => ({})) }));
// isInThemeEditor mirrors the real previewSdk.themeEditor probe so tests drive
// it via window.previewSdk; onPageBuilderEditMode captures the handler so a
// test can simulate a Design/Preview toggle.
jest.mock('../../../../theme/papathemes/socialproof/editorMode', () => ({
    isInThemeEditor: jest.fn(() => Boolean(global.previewSdk && global.previewSdk.themeEditor)),
    onPageBuilderEditMode: jest.fn(() => jest.fn()),
}));

import initSocialProof from '../../../../theme/papathemes/socialproof/index';
import { getSettings } from '../../../../theme/papathemes/socialproof/settings';
import { initStockPill } from '../../../../theme/papathemes/socialproof/stockPill';
import { initUrgency } from '../../../../theme/papathemes/socialproof/urgency';
import { initCartGoalBar } from '../../../../theme/papathemes/socialproof/cartGoalBar';
import { initRecentSales } from '../../../../theme/papathemes/socialproof/recentSales';
import { PopupManager } from '../../../../theme/papathemes/socialproof/popupManager';
import { onPageBuilderEditMode } from '../../../../theme/papathemes/socialproof/editorMode';

function makeSettings(overrides = {}) {
    return {
        urgency: { enabled: false },
        cartGoal: { enabled: false, items: [] },
        recentSales: { enabled: false },
        promo: { enabled: false },
        exit: { enabled: false },
        ...overrides,
    };
}

function clearBody() {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
}

describe('initSocialProof — stock pill / urgency wiring', () => {
    let destroy = null;

    afterEach(() => {
        if (typeof destroy === 'function') {
            try { destroy(); } catch (e) { /* noop */ }
        }
        destroy = null;
        clearBody();
    });

    it('initializes the stock pill on the page even when urgency is disabled', () => {
        getSettings.mockReturnValue(makeSettings({ urgency: { enabled: false } }));
        destroy = initSocialProof({});
        expect(initStockPill).toHaveBeenCalledWith(document);
    });

    it('does NOT initialize urgency when it is disabled', () => {
        getSettings.mockReturnValue(makeSettings({ urgency: { enabled: false } }));
        destroy = initSocialProof({});
        expect(initUrgency).not.toHaveBeenCalled();
    });

    it('initializes both stock pill and urgency when urgency is enabled', () => {
        getSettings.mockReturnValue(makeSettings({ urgency: { enabled: true } }));
        destroy = initSocialProof({});
        expect(initStockPill).toHaveBeenCalledWith(document);
        expect(initUrgency).toHaveBeenCalled();
    });

    it('re-initializes the stock pill inside Quick View even when urgency is disabled', () => {
        getSettings.mockReturnValue(makeSettings({ urgency: { enabled: false } }));
        destroy = initSocialProof({});
        initStockPill.mockClear(); // ignore the initial document-scope call

        const wrapper = document.createElement('div');
        const pill = document.createElement('div');
        pill.setAttribute('data-papathemes-stock-pill', '');
        wrapper.appendChild(pill);
        document.body.appendChild(wrapper);

        // Foundation Reveal fires this when a Quick View modal opens.
        window.jQuery(wrapper).trigger('opened.fndtn.reveal');

        expect(initStockPill).toHaveBeenCalledWith(wrapper);
    });
});

describe('initSocialProof — suppression while merchant is editing', () => {
    let destroy = null;

    afterEach(() => {
        if (typeof destroy === 'function') {
            try { destroy(); } catch (e) { /* noop */ }
        }
        destroy = null;
        try { delete window.previewSdk; } catch (e) { /* noop */ }
        clearBody();
    });

    it('does NOT init PopupManager or recent sales while editing (previewSdk.themeEditor present)', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(PopupManager).not.toHaveBeenCalled();
        expect(initRecentSales).not.toHaveBeenCalled();
    });

    it('still inits the stock pill while editing', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(initStockPill).toHaveBeenCalledWith(document);
    });

    it('still inits the inline cart-goal bar while editing', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(initCartGoalBar).toHaveBeenCalled();
    });

    it('still inits inline urgency while editing when urgency is enabled', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings({ urgency: { enabled: true } }));
        destroy = initSocialProof({});

        expect(initUrgency).toHaveBeenCalled();
    });

    it('destroy() does not throw while editing (popup/recentSales blocks skipped)', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(() => {
            destroy();
            destroy = null;
        }).not.toThrow();
    });

    it('inits PopupManager and recent sales in the admin Preview (previewSdk without themeEditor)', () => {
        window.previewSdk = {}; // Preview button: previewSdk present, themeEditor absent
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(PopupManager).toHaveBeenCalled();
        expect(initRecentSales).toHaveBeenCalled();
    });

    it('inits PopupManager and recent sales on the live storefront (no previewSdk)', () => {
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(PopupManager).toHaveBeenCalled();
        expect(initRecentSales).toHaveBeenCalled();
    });
});

describe('initSocialProof — Page Builder Design/Preview toggle', () => {
    let destroy = null;

    /** Return the handler initSocialProof registered with onPageBuilderEditMode. */
    function editModeHandler() {
        const calls = onPageBuilderEditMode.mock.calls;
        return calls.length ? calls[calls.length - 1][0] : null;
    }

    beforeEach(() => {
        window.previewSdk = { themeEditor: { id: 'x' } };
    });

    afterEach(() => {
        if (typeof destroy === 'function') {
            try { destroy(); } catch (e) { /* noop */ }
        }
        destroy = null;
        try { delete window.previewSdk; } catch (e) { /* noop */ }
        clearBody();
    });

    it('registers a Page Builder edit-mode listener while editing', () => {
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        expect(onPageBuilderEditMode).toHaveBeenCalledWith(expect.any(Function));
        expect(PopupManager).not.toHaveBeenCalled();
    });

    it('starts PopupManager and recent sales when switching to Preview (editMode false)', () => {
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        editModeHandler()(false);

        expect(PopupManager).toHaveBeenCalledTimes(1);
        expect(initRecentSales).toHaveBeenCalledTimes(1);
    });

    it('destroys PopupManager when switching back to Design (editMode true)', () => {
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        const handler = editModeHandler();
        handler(false);
        const managerInstance = PopupManager.mock.results[0].value;
        handler(true);

        expect(managerInstance.destroy).toHaveBeenCalled();
    });

    it('does not start popups twice across repeated Preview toggles', () => {
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        const handler = editModeHandler();
        handler(false);
        handler(false);

        expect(PopupManager).toHaveBeenCalledTimes(1);
    });

    it('start/stop is idempotent across many Design/Preview switches', () => {
        getSettings.mockReturnValue(makeSettings());
        destroy = initSocialProof({});

        const handler = editModeHandler();
        handler(false); // start #1
        handler(true); // stop #1
        handler(false); // start #2
        handler(true); // stop #2

        expect(PopupManager).toHaveBeenCalledTimes(2);
        expect(PopupManager.mock.results[0].value.destroy).toHaveBeenCalled();
        expect(PopupManager.mock.results[1].value.destroy).toHaveBeenCalled();
    });

    it('cleans up recent sales exactly once when stopped before its async init resolves', async () => {
        getSettings.mockReturnValue(makeSettings());

        // initRecentSales resolves to a cleanup spy, but only after we trigger it.
        const recentSalesCleanup = jest.fn();
        let resolveInit;
        const pending = new Promise((resolve) => { resolveInit = resolve; });
        initRecentSales.mockReturnValueOnce(pending);

        destroy = initSocialProof({});

        const handler = editModeHandler();
        handler(false); // Preview → startPopups → initRecentSales begins (promise pending)
        handler(true); // Design → stopPopups BEFORE the promise resolves

        // Now the async init finishes — cleanup must run immediately because
        // stop already happened (stoppedBeforeReady branch), not be dropped.
        resolveInit(recentSalesCleanup);
        await pending;
        await Promise.resolve();

        expect(recentSalesCleanup).toHaveBeenCalledTimes(1);
    });
});

describe('initSocialProof — destroy() and active-flag integrity', () => {
    let destroy = null;

    afterEach(() => {
        if (typeof destroy === 'function') {
            try { destroy(); } catch (e) { /* noop */ }
        }
        destroy = null;
        try { delete window.previewSdk; } catch (e) { /* noop */ }
        clearBody();
    });

    it('removes the Page Builder edit-mode listener on destroy (no leak across re-init)', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        const stopListening = jest.fn();
        onPageBuilderEditMode.mockReturnValueOnce(stopListening);
        getSettings.mockReturnValue(makeSettings());

        destroy = initSocialProof({});
        destroy();
        destroy = null;

        expect(stopListening).toHaveBeenCalledTimes(1);
    });

    it('sets the active flag true after a clean init and false after destroy (non-editor)', () => {
        getSettings.mockReturnValue(makeSettings());

        destroy = initSocialProof({});
        expect(window.__papathemesSocialproofActive).toBe(true);

        destroy();
        destroy = null;
        expect(window.__papathemesSocialproofActive).toBe(false);
    });

    it('sets the active flag true after a clean init and false after destroy (editor)', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings());

        destroy = initSocialProof({});
        expect(window.__papathemesSocialproofActive).toBe(true);

        destroy();
        destroy = null;
        expect(window.__papathemesSocialproofActive).toBe(false);
    });

    it('double-stop is a no-op: toggling to Design twice never constructs PopupManager', () => {
        window.previewSdk = { themeEditor: { id: 'x' } };
        getSettings.mockReturnValue(makeSettings());

        destroy = initSocialProof({});

        const calls = onPageBuilderEditMode.mock.calls;
        const handler = calls[calls.length - 1][0];
        expect(() => {
            handler(true); // stop before any start → no-op
            handler(true); // stop again → still no-op
        }).not.toThrow();

        expect(PopupManager).not.toHaveBeenCalled();
    });
});
