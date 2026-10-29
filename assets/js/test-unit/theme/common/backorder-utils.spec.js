import {
    updateQtyBackorderedMessage,
    updateBackorderMessage,
    toggleBackorderedContainer,
    updateBackorderContext,
    updateBackorderPrompt,
    updateAddToCartForQty,
    findByBackorderMessageIdOrDefault,
    readBackorderContextFromScope,
    createProductBackorderContext,
    canSellFromData,
    toggleSoldOutAlert,
    updateShippingCountdownVisibility,
} from '../../../theme/common/utils/backorder-utils';

// Minimal jQuery-like mock for DOM operations
function makeMockEl(initialText = '') {
    let _text = initialText;
    let _visible = true;
    return {
        length: 1,
        text: jest.fn(function(val) {
            if (val === undefined) return _text;
            _text = val;
            return this;
        }),
        show: jest.fn(function() { _visible = true; return this; }),
        hide: jest.fn(function() { _visible = false; return this; }),
        _getText: () => _text,
        _isVisible: () => _visible,
    };
}

function makeViewModel(overrides = {}) {
    return {
        $backordered: makeMockEl(),
        $backorderedQtyMessage: makeMockEl(),
        $backorderMessage: makeMockEl(),
        $backorderPrompt: makeMockEl(),
        stock: { $input: makeMockEl('0') },
        ...overrides,
    };
}

// ─── updateBackorderContext ───────────────────────────────────────────────────

describe('updateBackorderContext', () => {
    let context;
    beforeEach(() => { context = {}; });

    it('copies available_on_hand from data', () => {
        updateBackorderContext(context, { available_on_hand: 5 });
        expect(context.availableOnHand).toBe(5);
    });

    it('treats available_on_hand=0 as valid (not skipped)', () => {
        updateBackorderContext(context, { available_on_hand: 0 });
        expect(context.availableOnHand).toBe(0);
    });

    it('falls back to stock when available_on_hand absent', () => {
        updateBackorderContext(context, { stock: 3 });
        expect(context.availableOnHand).toBe(3);
    });

    it('copies available_for_backorder', () => {
        updateBackorderContext(context, { available_for_backorder: 10 });
        expect(context.availableForBackorder).toBe(10);
    });

    it('copies available_to_sell', () => {
        updateBackorderContext(context, { available_to_sell: 20 });
        expect(context.availableToSell).toBe(20);
    });

    it('copies unlimited_backorder', () => {
        updateBackorderContext(context, { unlimited_backorder: true });
        expect(context.unlimitedBackorder).toBe(true);
    });

    it('copies show_backorder_availability_prompt', () => {
        updateBackorderContext(context, { show_backorder_availability_prompt: true });
        expect(context.showBackorderAvailabilityPrompt).toBe(true);
    });

    it('copies backorder_availability_prompt string', () => {
        updateBackorderContext(context, { backorder_availability_prompt: 'Ships in 2 weeks' });
        expect(context.backorderAvailabilityPrompt).toBe('Ships in 2 weeks');
    });

    it('sets backorderMessageId to null when absent', () => {
        updateBackorderContext(context, {});
        expect(context.backorderMessageId).toBeNull();
    });

    it('sets backorderMessageId from data', () => {
        updateBackorderContext(context, { backorder_message_id: 42 });
        expect(context.backorderMessageId).toBe(42);
    });

    it('does not overwrite existing values when fields absent', () => {
        context.availableOnHand = 7;
        updateBackorderContext(context, {});
        expect(context.availableOnHand).toBe(7);
    });
});

// ─── findByBackorderMessageIdOrDefault ───────────────────────────────────────

describe('findByBackorderMessageIdOrDefault', () => {
    const messages = [
        { id: 1, message: 'Dispatches within 2 weeks' },
        { id: 2, message: 'Store default', is_default: true },
    ];

    it('returns the message assigned to the id', () => {
        expect(findByBackorderMessageIdOrDefault(messages, 1).message).toBe('Dispatches within 2 weeks');
    });

    it('falls back to the store default when the id has no message', () => {
        expect(findByBackorderMessageIdOrDefault(messages, 99).message).toBe('Store default');
    });

    it('falls back to the store default when the id is null', () => {
        expect(findByBackorderMessageIdOrDefault(messages, null).message).toBe('Store default');
    });

    it('returns undefined when neither an assigned nor a default message exists', () => {
        expect(findByBackorderMessageIdOrDefault([{ id: 1, message: 'x' }], 99)).toBeUndefined();
    });
});

// ─── readBackorderContextFromScope / createProductBackorderContext ───────────

describe('readBackorderContextFromScope', () => {
    afterEach(() => { $('body').empty(); });

    function mount(attrs = '') {
        $('body').append(`
            <div class="wrapper">
                <div class="productView" data-product-backorder-scope ${attrs}>
                    <div class="inner"></div>
                </div>
            </div>
        `);
    }

    it('returns an empty overlay when the scope carries no marker', () => {
        $('body').append('<div class="bare"></div>');
        expect(readBackorderContextFromScope($('.bare'))).toEqual({});
    });

    it('reads the marker on the scope itself', () => {
        mount('data-product-available-to-sell="12"');
        expect(readBackorderContextFromScope($('.productView')).availableToSell).toBe(12);
    });

    it('resolves the marker from an ancestor (scope narrowed to an inner element)', () => {
        mount('data-product-available-on-hand="4"');
        expect(readBackorderContextFromScope($('.inner')).availableOnHand).toBe(4);
    });

    it('resolves the marker from a descendant (quick-view passes the modal wrapper)', () => {
        mount('data-product-available-on-hand="7"');
        expect(readBackorderContextFromScope($('.wrapper')).availableOnHand).toBe(7);
    });

    it('parses booleans and strings', () => {
        mount('data-product-unlimited-backorder="true" data-product-show-quantity-on-backorder="false" '
            + 'data-product-backorder-availability-prompt="Ships in 2 weeks"');
        const overlay = readBackorderContextFromScope($('.productView'));
        expect(overlay.unlimitedBackorder).toBe(true);
        expect(overlay.showQuantityOnBackorder).toBe(false);
        expect(overlay.backorderAvailabilityPrompt).toBe('Ships in 2 weeks');
    });

    it('omits keys whose attribute is empty, so they stay unset', () => {
        mount('data-product-available-to-sell="" data-product-show-backorder-message=""');
        const overlay = readBackorderContextFromScope($('.productView'));
        expect('availableToSell' in overlay).toBe(false);
        expect('showBackorderMessage' in overlay).toBe(false);
    });
});

describe('createProductBackorderContext', () => {
    afterEach(() => { $('body').empty(); });

    it('never inherits another product\'s stock from the shared page context', () => {
        $('body').append('<div class="bare"></div>');
        const pageContext = { availableToSell: 99, availableOnHand: 99, quantityBackorderedMessage: '__QTY__ backordered' };

        const context = createProductBackorderContext(pageContext, $('.bare'));

        expect(context.availableToSell).toBeUndefined();
        expect(context.availableOnHand).toBeUndefined();
        // Store-wide values survive
        expect(context.quantityBackorderedMessage).toBe('__QTY__ backordered');
    });

    it('overlays the scope\'s own values', () => {
        $('body').append('<div class="productView" data-product-backorder-scope data-product-available-to-sell="3"></div>');

        expect(createProductBackorderContext({ availableToSell: 99 }, $('.productView')).availableToSell).toBe(3);
    });

    it('returns a new object so one instance cannot mutate another\'s context', () => {
        $('body').append('<div class="bare"></div>');
        const pageContext = {};

        const context = createProductBackorderContext(pageContext, $('.bare'));
        context.availableOnHand = 5;

        expect(pageContext.availableOnHand).toBeUndefined();
    });
});

// ─── toggleBackorderedContainer ──────────────────────────────────────────────

describe('toggleBackorderedContainer', () => {
    it('shows $backordered when qty message is non-empty', () => {
        const vm = makeViewModel();
        vm.$backorderedQtyMessage.text('3 will be backordered');
        toggleBackorderedContainer(vm);
        expect(vm.$backordered.show).toHaveBeenCalled();
    });

    it('shows $backordered when only the backorder message is present', () => {
        const vm = makeViewModel();
        vm.$backorderMessage.text('Dispatches within 2 weeks');
        toggleBackorderedContainer(vm);
        expect(vm.$backordered.show).toHaveBeenCalled();
    });

    it('hides $backordered when both messages are empty', () => {
        const vm = makeViewModel();
        vm.$backorderedQtyMessage.text('');
        toggleBackorderedContainer(vm);
        expect(vm.$backordered.hide).toHaveBeenCalled();
    });
});

// ─── updateQtyBackorderedMessage ─────────────────────────────────────────────

describe('updateQtyBackorderedMessage', () => {
    let context, vm;
    const getViewModel = () => vm;

    beforeEach(() => {
        vm = makeViewModel();
        context = {
            availableOnHand: 2,
            availableForBackorder: 5,
            availableToSell: 10,
            quantityBackorderedMessage: '__QTY__ will be backordered',
        };
    });

    it('sets backordered qty message when qty exceeds on-hand', () => {
        updateQtyBackorderedMessage(context, getViewModel, null, 4, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('2 will be backordered');
    });

    it('clears message when qty is within on-hand stock', () => {
        updateQtyBackorderedMessage(context, getViewModel, null, 1, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('');
    });

    it('handles on-hand=0 (full backorder product)', () => {
        context.availableOnHand = 0;
        updateQtyBackorderedMessage(context, getViewModel, null, 3, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('3 will be backordered');
    });

    it('records the backordered quantity on the context', () => {
        updateQtyBackorderedMessage(context, getViewModel, null, 4, vm);
        expect(context.backorderedQty).toBe(2);
    });

    it('clears message when showQuantityOnBackorder is false', () => {
        context.showQuantityOnBackorder = false;
        updateQtyBackorderedMessage(context, getViewModel, null, 5, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('');
    });

    it('still records the backordered quantity when the message is hidden', () => {
        context.showQuantityOnBackorder = false;
        updateQtyBackorderedMessage(context, getViewModel, null, 5, vm);
        expect(context.backorderedQty).toBe(3);
    });

    it('caps backordered qty at available_for_backorder', () => {
        context.availableForBackorder = 3;
        updateQtyBackorderedMessage(context, getViewModel, null, 10, vm);
        // backordered = min(10-2, 3) = 3
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('3 will be backordered');
    });

    it('does not cap at available_for_backorder when backorder is unlimited', () => {
        context.availableForBackorder = 3;
        context.unlimitedBackorder = true;
        updateQtyBackorderedMessage(context, getViewModel, null, 10, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('8 will be backordered');
    });

    it('promises no backorder for a qty the product cannot sell — that case is an error, not a backorder', () => {
        updateQtyBackorderedMessage(context, getViewModel, null, 15, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('');
        expect(context.backorderedQty).toBe(0);
    });

    it('still reports a backorder at exactly the sell limit', () => {
        updateQtyBackorderedMessage(context, getViewModel, null, 10, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('5 will be backordered');
    });

    it('ignores the sell limit when backorder is unlimited', () => {
        context.unlimitedBackorder = true;
        updateQtyBackorderedMessage(context, getViewModel, null, 99, vm);
        expect(context.backorderedQty).toBe(97);
    });

    it('uses fallback message when quantityBackorderedMessage absent', () => {
        delete context.quantityBackorderedMessage;
        updateQtyBackorderedMessage(context, getViewModel, null, 4, vm);
        expect(vm.$backorderedQtyMessage.text).toHaveBeenCalledWith('2 will be backordered');
    });

    it('skips update when $backordered.length is 0', () => {
        vm.$backordered.length = 0;
        updateQtyBackorderedMessage(context, getViewModel, null, 4, vm);
        expect(vm.$backorderedQtyMessage.text).not.toHaveBeenCalled();
    });
});

// ─── updateBackorderMessage ───────────────────────────────────────────────────

describe('updateBackorderMessage', () => {
    let context, vm;
    const getViewModel = () => vm;

    beforeEach(() => {
        vm = makeViewModel();
        context = {
            backorderedQty: 2,
            showBackorderMessage: true,
            backorderMessageId: 1,
            backorderMessages: [
                { id: 1, message: 'Dispatches within 2 weeks' },
                { id: 2, message: 'Contact us for ETA' },
            ],
        };
    });

    it('sets the assigned message when units are backordered', () => {
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).toHaveBeenCalledWith('Dispatches within 2 weeks');
    });

    it('shows the message even when the quantity line is hidden', () => {
        context.showQuantityOnBackorder = false;
        vm.$backorderedQtyMessage.text('');
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).toHaveBeenCalledWith('Dispatches within 2 weeks');
    });

    it('clears message when nothing is backordered', () => {
        context.backorderedQty = 0;
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).toHaveBeenCalledWith('');
    });

    it('clears message when showBackorderMessage is false', () => {
        context.showBackorderMessage = false;
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).toHaveBeenCalledWith('');
    });

    it('falls back to the store default message for an unassigned SKU', () => {
        context.backorderMessageId = 99;
        context.backorderMessages.push({ id: 3, message: 'Store default', is_default: true });
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).toHaveBeenCalledWith('Store default');
    });

    it('clears message when no assigned and no default message exists', () => {
        context.backorderMessageId = 99;
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).toHaveBeenCalledWith('');
    });

    it('skips update when $backordered.length is 0', () => {
        vm.$backordered.length = 0;
        updateBackorderMessage(context, getViewModel, null, vm);
        expect(vm.$backorderMessage.text).not.toHaveBeenCalled();
    });
});

// ─── updateBackorderPrompt ────────────────────────────────────────────────────

describe('updateBackorderPrompt', () => {
    let context, vm;
    const getViewModel = () => vm;

    beforeEach(() => {
        vm = makeViewModel();
        context = {
            showBackorderAvailabilityPrompt: true,
            availableToSell: 5,
            availableForBackorder: 3,
            backorderAvailabilityPrompt: 'Ships in 2 weeks',
        };
    });

    it('shows prompt when all conditions met', () => {
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.text).toHaveBeenCalledWith('(Ships in 2 weeks)');
        expect(vm.$backorderPrompt.show).toHaveBeenCalled();
    });

    it('hides prompt when showBackorderAvailabilityPrompt is false', () => {
        context.showBackorderAvailabilityPrompt = false;
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.hide).toHaveBeenCalled();
    });

    it('hides prompt when availableToSell is 0', () => {
        context.availableToSell = 0;
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.hide).toHaveBeenCalled();
    });

    it('hides prompt when availableForBackorder is 0', () => {
        context.availableForBackorder = 0;
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.hide).toHaveBeenCalled();
    });

    it('shows prompt on zero counts when backorder is unlimited', () => {
        context.availableToSell = 0;
        context.availableForBackorder = 0;
        context.unlimitedBackorder = true;
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.show).toHaveBeenCalled();
    });

    it('hides prompt when promptText is empty', () => {
        context.backorderAvailabilityPrompt = '';
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.hide).toHaveBeenCalled();
    });

    it('skips update when $backorderPrompt.length is 0', () => {
        vm.$backorderPrompt.length = 0;
        updateBackorderPrompt(context, getViewModel, null, vm);
        expect(vm.$backorderPrompt.text).not.toHaveBeenCalled();
        expect(vm.$backorderPrompt.show).not.toHaveBeenCalled();
    });
});

// ─── updateAddToCartForQty ────────────────────────────────────────────────────

describe('updateAddToCartForQty', () => {
    let $scope, viewModel;

    beforeEach(() => {
        $('body').append(`
            <div class="scope">
                <div class="alertBox productAttributes-message" style="display:none">
                    <p class="alertBox-message"></p>
                </div>
                <input class="increments" type="tel">
                <input class="addToCart" type="submit">
            </div>
        `);
        $scope = $('.scope');
        viewModel = {
            $addToCart: $('.addToCart', $scope),
            $increments: $('.increments', $scope),
        };
    });

    afterEach(() => { $('body').empty(); });

    const context = () => ({
        availableToSell: 5,
        quantityMaxMessage: 'The maximum purchasable quantity is __QTY__',
        quantityMaxPicklistMessage: 'The maximum purchasable quantity for __NAME__ is __QTY__',
    });

    it('blocks add-to-cart and states the limit when qty exceeds available-to-sell', () => {
        updateAddToCartForQty(context(), viewModel, $scope, 6, null);

        expect(viewModel.$addToCart.prop('disabled')).toBe(true);
        expect($('.alertBox-message', $scope).text()).toBe('The maximum purchasable quantity is 5');
        expect($('.productAttributes-message', $scope).attr('data-qty-limit')).toBe('true');
    });

    it('clears its own message and re-enables add-to-cart when the qty drops back into range', () => {
        const ctx = context();
        updateAddToCartForQty(ctx, viewModel, $scope, 6, null);
        updateAddToCartForQty(ctx, viewModel, $scope, 4, null);

        expect(viewModel.$addToCart.prop('disabled')).toBe(false);
        expect($('.productAttributes-message', $scope).attr('data-qty-limit')).toBeUndefined();
        expect($('.alertBox-message', $scope).text()).toBe('');
    });

    it('leaves an out-of-stock button disabled when clearing the message', () => {
        const ctx = context();
        viewModel.$increments.prop('disabled', true);
        updateAddToCartForQty(ctx, viewModel, $scope, 6, null);
        updateAddToCartForQty(ctx, viewModel, $scope, 4, null);

        expect(viewModel.$addToCart.prop('disabled')).toBe(true);
    });

    it('never blocks on the main product when backorder is unlimited', () => {
        const ctx = { ...context(), unlimitedBackorder: true };
        updateAddToCartForQty(ctx, viewModel, $scope, 9999, null);

        expect(viewModel.$addToCart.prop('disabled')).toBe(false);
    });

    it('surfaces a picklist option limit when the main product still has stock', () => {
        const picklistBackorder = {
            getSellLimitViolation: () => ({ name: 'RAM', availableToSell: 2 }),
        };
        updateAddToCartForQty(context(), viewModel, $scope, 3, picklistBackorder);

        expect(viewModel.$addToCart.prop('disabled')).toBe(true);
        expect($('.alertBox-message', $scope).text()).toBe('The maximum purchasable quantity for RAM is 2');
    });

    it('prefers the main product limit over a picklist limit', () => {
        const picklistBackorder = {
            getSellLimitViolation: () => ({ name: 'RAM', availableToSell: 2 }),
        };
        updateAddToCartForQty(context(), viewModel, $scope, 6, picklistBackorder);

        expect($('.alertBox-message', $scope).text()).toBe('The maximum purchasable quantity is 5');
    });

    it('leaves the button disabled for a non-purchasable selection with no quantity stepper', () => {
        // show_quantity_input off: $increments is empty, so the server's verdict is the only guard
        const ctx = { ...context(), canPurchaseSelection: false };
        viewModel.$increments = $('.nothing', $scope);
        viewModel.$addToCart.prop('disabled', true);

        updateAddToCartForQty(ctx, viewModel, $scope, 1, null);

        expect(viewModel.$addToCart.prop('disabled')).toBe(true);
    });

    it('re-enables the button once the selection is purchasable again', () => {
        const ctx = { ...context(), canPurchaseSelection: true };
        viewModel.$increments = $('.nothing', $scope);
        viewModel.$addToCart.prop('disabled', true);

        updateAddToCartForQty(ctx, viewModel, $scope, 1, null);

        expect(viewModel.$addToCart.prop('disabled')).toBe(false);
    });

    it('does not touch a message it did not set', () => {
        $('.alertBox-message', $scope).text('This product is currently unavailable');
        $('.productAttributes-message', $scope).show();

        updateAddToCartForQty(context(), viewModel, $scope, 1, null);

        expect($('.alertBox-message', $scope).text()).toBe('This product is currently unavailable');
    });
});

// ─── canSellFromData ─────────────────────────────────────────────────────────

describe('canSellFromData', () => {
    it('is true when the server reports in stock', () => {
        expect(canSellFromData({}, { instock: true })).toBe(true);
    });

    it('is true for a backorderable selection with no on-hand stock', () => {
        expect(canSellFromData({}, { instock: false, available_to_sell: 4 })).toBe(true);
    });

    it('falls back to the context when the response omits available_to_sell', () => {
        expect(canSellFromData({ availableToSell: 4 }, { instock: false })).toBe(true);
    });

    it('is false when nothing can be sold', () => {
        expect(canSellFromData({ availableToSell: 0 }, { instock: false, available_to_sell: 0 })).toBe(false);
    });
});

// ─── toggleSoldOutAlert ──────────────────────────────────────────────────────

describe('toggleSoldOutAlert', () => {
    let $scope;

    beforeEach(() => {
        $('body').append(`
            <div class="scope">
                <div class="alertBox productAttributes-message"><p class="alertBox-message">currently unavailable</p></div>
                <div data-product-oos-alert><p>Sold Out</p></div>
            </div>
        `);
        $scope = $('.scope');
    });

    afterEach(() => { $('body').empty(); });

    it('hides the sold-out alert when the selection can be sold', () => {
        toggleSoldOutAlert($scope, true, true);
        expect($('[data-product-oos-alert]', $scope).css('display')).toBe('none');
    });

    it('keeps a non-purchasable selection\'s server message visible', () => {
        toggleSoldOutAlert($scope, true, false);
        expect($('.productAttributes-message', $scope).css('display')).not.toBe('none');
    });

    it('clears the variant message once the selection is purchasable', () => {
        toggleSoldOutAlert($scope, true, false);
        toggleSoldOutAlert($scope, true, true);
        expect($('.productAttributes-message', $scope).css('display')).toBe('none');
    });

    it('shows the sold-out alert when nothing can be sold', () => {
        $('[data-product-oos-alert]', $scope).hide();
        toggleSoldOutAlert($scope, false, true);
        expect($('[data-product-oos-alert]', $scope).css('display')).not.toBe('none');
    });
});

// ─── updateShippingCountdownVisibility ───────────────────────────────────────

describe('updateShippingCountdownVisibility', () => {
    let $scope;

    beforeEach(() => {
        $('body').append(`
            <div class="scope">
                <span data-product-stock>4</span>
                <div data-shipping-countdown>Order in the next 2h</div>
            </div>
        `);
        $scope = $('.scope');
    });

    afterEach(() => { $('body').empty(); });

    const isHidden = () => $('[data-shipping-countdown]', $scope).hasClass('is-hidden');

    it('hides the countdown when the qty exceeds ship-ready stock', () => {
        updateShippingCountdownVisibility({ availableOnHand: 3 }, $scope, 4);
        expect(isHidden()).toBe(true);
    });

    it('shows it again once the qty drops back to what can ship', () => {
        const context = { availableOnHand: 3 };
        updateShippingCountdownVisibility(context, $scope, 4);
        updateShippingCountdownVisibility(context, $scope, 3);
        expect(isHidden()).toBe(false);
    });

    it('uses the smallest known signal', () => {
        // available_to_sell counts backorderable units, so on-hand is the real ship-ready limit
        updateShippingCountdownVisibility({ availableOnHand: 2, availableToSell: 20 }, $scope, 3);
        expect(isHidden()).toBe(true);
    });

    it('falls back to the rendered stock figure when the context knows nothing', () => {
        updateShippingCountdownVisibility({}, $scope, 5);
        expect(isHidden()).toBe(true);
    });

    it('leaves the countdown alone when no stock signal is known', () => {
        $('[data-product-stock]', $scope).text('');
        updateShippingCountdownVisibility({}, $scope, 99);
        expect(isHidden()).toBe(false);
    });

    it('is a no-op when the theme renders no countdown', () => {
        $('[data-shipping-countdown]', $scope).remove();
        expect(() => updateShippingCountdownVisibility({ availableOnHand: 1 }, $scope, 9)).not.toThrow();
    });
});
