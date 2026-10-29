/**
 * @jest-environment jsdom
 */

// Modal + cart API are mocked so we can drive the add-to-cart flow synchronously
// and assert the side effects the "added to cart" preview modal depends on.
jest.mock('@bigcommerce/stencil-utils', () => ({
    api: {
        cart: {
            itemAdd: jest.fn(),
            getContent: jest.fn(),
        },
    },
}));
jest.mock('../../theme/global/modal', () => ({
    __esModule: true,
    default: jest.fn(),
    ModalEvents: { open: 'open', close: 'close', closed: 'closed' },
}));
jest.mock('../../theme/global/sweet-alert', () => ({
    __esModule: true,
    default: { fire: jest.fn() },
}));

import $ from 'jquery';
import utils from '@bigcommerce/stencil-utils';
import modalFactory from '../../theme/global/modal';
import ajaxAddToCart from '../../emthemes-modez/ajax-addtocart';

const CART_ITEM_HASH = 'abc123';
const PRODUCT_ID = '123';

function makeModal() {
    return {
        $modal: $('<div id="previewModal"></div>'),
        $content: $('<div></div>'),
        open: jest.fn(),
        updateContent: jest.fn(),
        onModalOpen: jest.fn(),
        onModalClose: jest.fn(),
    };
}

function makeContext(overrides = {}) {
    return {
        themeSettings: { add_to_cart_popup: 'modal', redirect_cart: false },
        urls: { cart: '/cart.php' },
        ...overrides,
    };
}

/** Drive a full add-to-cart click through both mocked API callbacks. */
function clickAddToCart() {
    $('#addToCartBtn').trigger('click');

    const [, itemAddCb] = utils.api.cart.itemAdd.mock.calls[0];
    itemAddCb(null, { data: { cart_item: { hash: CART_ITEM_HASH } } });

    const [, getContentCb] = utils.api.cart.getContent.mock.calls[0];
    getContentCb(null, '<div data-cart-quantity="1"></div>');
}

describe('ajax-addtocart — cart preview modal side effects', () => {
    let modal;

    beforeEach(() => {
        jest.clearAllMocks();
        modal = makeModal();
        modalFactory.mockReturnValue([modal]);

        document.body.innerHTML = `
            <a id="addToCartBtn"
               data-emthemesmodez-cart-item-add
               href="/cart.php?action=add&product_id=${PRODUCT_ID}">Add to cart</a>
            <div class="navUser-item--cart">
                <a class="navUser-action"><span class="cart-count"></span></a>
            </div>
        `;
    });

    afterEach(() => {
        $('body').off('click');
    });

    // Regression: the cart goal bar renders a server-side skeleton inside
    // cart/preview. cartGoalBar.js only hydrates (or hides, when the feature
    // is disabled) on `supermarket:cart-updated`. Adding from a product card
    // routes through this module — not product-details.js — so without the
    // dispatch here the skeleton stays visible forever in the modal.
    it('dispatches supermarket:cart-updated after the modal content is replaced', () => {
        const onCartUpdated = jest.fn();
        document.addEventListener('supermarket:cart-updated', onCartUpdated);

        ajaxAddToCart(makeContext());
        clickAddToCart();

        document.removeEventListener('supermarket:cart-updated', onCartUpdated);

        expect(modal.updateContent).toHaveBeenCalledTimes(1);
        expect(onCartUpdated).toHaveBeenCalledTimes(1);
        expect(onCartUpdated.mock.calls[0][0].detail).toEqual({ subtotal: null });
    });

    // The dispatch sits after modal.updateContent() so listeners observe the
    // freshly injected [data-papathemes-cart-goal] element, never the stale one.
    it('dispatches only after updateContent so listeners see the new cart HTML', () => {
        const order = [];
        modal.updateContent.mockImplementation(() => order.push('updateContent'));
        const onCartUpdated = () => order.push('cart-updated');
        document.addEventListener('supermarket:cart-updated', onCartUpdated);

        ajaxAddToCart(makeContext());
        clickAddToCart();

        document.removeEventListener('supermarket:cart-updated', onCartUpdated);

        expect(order).toEqual(['updateContent', 'cart-updated']);
    });

    // BigCommerce injects inline Facebook Pixel scripts into cart/preview via
    // additional_checkout_buttons; jQuery evaluates them on .html() and throws
    // when window.fbq is absent. The DOM is already mutated at that point, so
    // the dispatch must still fire.
    it('still dispatches when updateContent throws on an inline script', () => {
        modal.updateContent.mockImplementation(() => {
            throw new ReferenceError('fbq is not defined');
        });
        const onCartUpdated = jest.fn();
        document.addEventListener('supermarket:cart-updated', onCartUpdated);

        ajaxAddToCart(makeContext());
        clickAddToCart();

        document.removeEventListener('supermarket:cart-updated', onCartUpdated);

        expect(onCartUpdated).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch when the cart API returns an error', () => {
        const onCartUpdated = jest.fn();
        document.addEventListener('supermarket:cart-updated', onCartUpdated);

        ajaxAddToCart(makeContext());
        $('#addToCartBtn').trigger('click');
        const [, itemAddCb] = utils.api.cart.itemAdd.mock.calls[0];
        itemAddCb(null, { data: { cart_item: { hash: CART_ITEM_HASH } } });
        const [, getContentCb] = utils.api.cart.getContent.mock.calls[0];
        getContentCb('Server exploded', null);

        document.removeEventListener('supermarket:cart-updated', onCartUpdated);

        expect(modal.updateContent).not.toHaveBeenCalled();
        expect(onCartUpdated).not.toHaveBeenCalled();
    });
});
