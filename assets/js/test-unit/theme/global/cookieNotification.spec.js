/**
 * @jest-environment jsdom
 */

// stencil-utils is mocked so the default export runs in isolation and we can
// assert the consent-bar logic without the real hooks bus.
jest.mock('@bigcommerce/stencil-utils', () => ({
    hooks: { on: jest.fn(), emit: jest.fn() },
}));

import utils from '@bigcommerce/stencil-utils';
import cookieNotification from '../../../theme/global/cookieNotification';

describe('cookieNotification default export', () => {
    let showSpy;
    let hideSpy;

    beforeEach(() => {
        document.body.innerHTML = '<div class="cookieMessage" style="display:none;"><button data-privacy-accept></button></div>';
        showSpy = jest.spyOn($.fn, 'show');
        hideSpy = jest.spyOn($.fn, 'hide');
    });

    afterEach(() => {
        showSpy.mockRestore();
        hideSpy.mockRestore();
        $('body').off('click');
        document.body.innerHTML = '';
        // Clear the cookie set during accept tests so it cannot leak between cases.
        document.cookie = 'ACCEPT_COOKIE_USAGE=;expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });

    it('shows the consent bar when ACCEPT_COOKIE_USAGE is not set', () => {
        cookieNotification();
        expect(showSpy).toHaveBeenCalled();
    });

    it('does not show the consent bar when ACCEPT_COOKIE_USAGE is already set', () => {
        document.cookie = 'ACCEPT_COOKIE_USAGE=1; path=/';
        cookieNotification();
        expect(showSpy).not.toHaveBeenCalled();
    });

    it('sets the cookie, emits the hook and hides the bar when accept is clicked', () => {
        cookieNotification();
        $('[data-privacy-accept]').trigger('click');

        expect(document.cookie).toContain('ACCEPT_COOKIE_USAGE=1');
        expect(utils.hooks.emit).toHaveBeenCalledWith('cookie-privacy-accepted');
        expect(hideSpy).toHaveBeenCalled();
    });
});
