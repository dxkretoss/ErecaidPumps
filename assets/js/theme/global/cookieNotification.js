import utils from '@bigcommerce/stencil-utils';

/** Show the cookie consent bar unless already dismissed. */
export default function () {
    const $privacyDialog = $('.cookieMessage');

    if (document.cookie.indexOf('ACCEPT_COOKIE_USAGE') === -1) {
        $privacyDialog.show();
    }

    $('body').on('click', '[data-privacy-accept]', () => {
        const date = new Date();
        date.setDate(date.getDate() + 365);
        document.cookie = `ACCEPT_COOKIE_USAGE=1;expires=${date.toGMTString()}; path=/`;

        utils.hooks.emit('cookie-privacy-accepted');
        $privacyDialog.hide();
    });
}
