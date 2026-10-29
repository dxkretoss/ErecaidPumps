/**
 * @jest-environment jsdom
 */

// Heavy DOM/modal/API dependencies are mocked so we can assert the default
// export's editor guard in isolation: while a merchant is editing (Page Builder
// / Theme Editor) it must be a no-op (no cookie reads, no timers, no modal
// fetch); the admin Preview button and the live storefront still run.
jest.mock('@bigcommerce/stencil-utils', () => ({
    api: { getPage: jest.fn() },
}));
jest.mock('../../theme/global/modal', () => ({
    __esModule: true,
    default: jest.fn(() => [{}]),
    ModalEvents: { open: 'open', closed: 'closed' },
}));
jest.mock('js-cookie', () => ({ get: jest.fn(), set: jest.fn(), remove: jest.fn() }));

import emthemesNewsletterPopup from '../../emthemes-modez/newsletter-popup';
import Cookies from 'js-cookie';

function makeContext() {
    return {
        urls: { search: '/search.php' },
        themeSettings: { nl_popup_start: 0, nl_popup_hide: 0 },
    };
}

describe('newsletter-popup default export — editor suppression', () => {
    afterEach(() => {
        try { delete window.previewSdk; } catch (e) { /* noop */ }
    });

    it('is a no-op while editing (previewSdk.themeEditor present, does not read cookies)', () => {
        window.previewSdk = { themeEditor: {} };
        emthemesNewsletterPopup(makeContext());
        expect(Cookies.get).not.toHaveBeenCalled();
    });

    it('runs its legacy cookie logic in the admin Preview (previewSdk without themeEditor)', () => {
        window.previewSdk = {}; // Preview button: previewSdk present, themeEditor absent
        Cookies.get.mockReturnValue(undefined);
        emthemesNewsletterPopup(makeContext());
        expect(Cookies.get).toHaveBeenCalled();
    });

    it('runs its legacy cookie logic on the live storefront (no previewSdk)', () => {
        Cookies.get.mockReturnValue(undefined);
        emthemesNewsletterPopup(makeContext());
        expect(Cookies.get).toHaveBeenCalled();
    });
});
