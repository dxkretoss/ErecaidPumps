/**
 * Shared backorder helpers used by both ProductDetails and ProductDetailsBase.
 * Extracted to prevent logic drift between the two classes, which do not share
 * an inheritance chain in this theme.
 */

/**
 * Per-product backorder keys. They are always sourced from the product's own DOM
 * scope, never inherited: a page-level context is shared by every product instance
 * on the page (quick-view, also-bought/FBT, cart edit), so inheriting would show
 * one product's stock on another.
 */
const PRODUCT_SCOPED_KEYS = [
    'availableOnHand',
    'availableForBackorder',
    'availableToSell',
    'unlimitedBackorder',
    'showQuantityOnBackorder',
    'showBackorderAvailabilityPrompt',
    'backorderAvailabilityPrompt',
    'showBackorderMessage',
    'backorderMessageId',
    'backorderedQty',
    'canPurchaseSelection',
];

export function findByBackorderMessageIdOrDefault(messages, id) {
    const assignedMessage = messages.find(m => m.id === id);
    const defaultMessage = messages.find(m => m.is_default);

    return assignedMessage ?? defaultMessage;
}

/**
 * Read a product's own backorder settings from its DOM scope. The marker attribute
 * is resolved upwards first (ProductDetails narrows $scope to an inner element when
 * Also Bought is on) and downwards second (quick-view passes the modal wrapper).
 *
 * @param {Object} $scope jQuery scope of the product instance
 * @returns {Object} Context overlay; empty when the scope carries no marker.
 */
export function readBackorderContextFromScope($scope) {
    if (!$scope || !$scope.length) return {};

    const $root = $scope.is('[data-product-backorder-scope]')
        ? $scope
        : $scope.closest('[data-product-backorder-scope]')
            .add($scope.find('[data-product-backorder-scope]'))
            .first();

    if (!$root.length) return {};

    const readString = name => {
        const value = $root.attr(name);
        return value === undefined || value === '' ? undefined : value;
    };
    const readInt = name => {
        const value = parseInt($root.attr(name), 10);
        return Number.isNaN(value) ? undefined : value;
    };
    const readBool = name => {
        const value = readString(name);
        return value === undefined ? undefined : value === 'true';
    };

    const overlay = {
        availableOnHand: readInt('data-product-available-on-hand'),
        availableForBackorder: readInt('data-product-available-for-backorder'),
        availableToSell: readInt('data-product-available-to-sell'),
        unlimitedBackorder: readBool('data-product-unlimited-backorder'),
        showQuantityOnBackorder: readBool('data-product-show-quantity-on-backorder'),
        showBackorderAvailabilityPrompt: readBool('data-product-show-backorder-availability-prompt'),
        backorderAvailabilityPrompt: readString('data-product-backorder-availability-prompt'),
        showBackorderMessage: readBool('data-product-show-backorder-message'),
        backorderMessageId: readInt('data-product-backorder-message-id'),
    };

    // Drop undefined so an absent attribute stays unset rather than overwriting with undefined.
    Object.keys(overlay).forEach(key => {
        if (overlay[key] === undefined) delete overlay[key];
    });

    return overlay;
}

/**
 * Build a per-instance context: the shared page context with every per-product key
 * cleared, then overlaid with what this product's DOM scope declares. Cloning also
 * keeps updateBackorderContext() from writing one instance's stock into another's.
 *
 * @param {Object} pageContext Context handed to the ProductDetails instance
 * @param {Object} $scope jQuery scope of the product instance
 * @returns {Object} A new context object
 */
export function createProductBackorderContext(pageContext, $scope) {
    const context = { ...pageContext };

    PRODUCT_SCOPED_KEYS.forEach(key => { delete context[key]; });

    return { ...context, ...readBackorderContextFromScope($scope) };
}

/**
 * Resolve how many units can still be sold, honouring unlimited backorder.
 *
 * @param {Object} context Per-instance context
 * @returns {Number} Available to sell, Infinity when backorder is unlimited
 */
function getAvailableToSell(context) {
    return context.unlimitedBackorder === true
        ? Infinity
        : parseInt(context.availableToSell, 10) || 0;
}

function getAvailableForBackorder(context) {
    return context.unlimitedBackorder === true
        ? Infinity
        : parseInt(context.availableForBackorder, 10) || 0;
}

export function updateQtyBackorderedMessage(context, getViewModel, $scope, qty, passedViewModel) {
    const viewModel = passedViewModel || getViewModel($scope);

    if (!viewModel.$backordered.length) return;

    const contextOnHand = parseInt(context.availableOnHand, 10);
    const stockFromDom = parseInt(viewModel.stock.$input.text(), 10);
    let onHand = 0;

    if (!Number.isNaN(contextOnHand)) {
        onHand = contextOnHand;
    } else if (!Number.isNaN(stockFromDom)) {
        onHand = stockFromDom;
    }

    // A quantity the product cannot sell is not a backorder promise — it is an error, and
    // updateAddToCartForQty states it. Reporting "N will be backordered" next to "the maximum
    // purchasable quantity is M" reads as two contradictory answers to the same question.
    const availableToSell = getAvailableToSell(context);
    const exceedsSellLimit = availableToSell > 0 && qty > availableToSell;

    // eslint-disable-next-line no-param-reassign
    context.backorderedQty = exceedsSellLimit
        ? 0
        : Math.max(0, Math.min(qty - onHand, getAvailableForBackorder(context)));

    if (context.showQuantityOnBackorder !== false && context.backorderedQty > 0) {
        const message = context.quantityBackorderedMessage
            ? context.quantityBackorderedMessage.replace('__QTY__', context.backorderedQty)
            : `${context.backorderedQty} will be backordered`;
        viewModel.$backorderedQtyMessage.text(message);
    } else {
        viewModel.$backorderedQtyMessage.text('');
    }
}

export function updateBackorderMessage(context, getViewModel, $scope, passedViewModel) {
    const viewModel = passedViewModel || getViewModel($scope);

    if (!viewModel.$backordered.length) return;

    // Keyed off the backordered quantity, not the rendered quantity message: the
    // merchant can hide the quantity line and still want the backorder message.
    if (!context.backorderedQty || context.backorderedQty <= 0) {
        viewModel.$backorderMessage.text('');
        return;
    }

    const { showBackorderMessage, backorderMessages, backorderMessageId } = context;

    if (showBackorderMessage && Array.isArray(backorderMessages)) {
        const messageObj = findByBackorderMessageIdOrDefault(backorderMessages, backorderMessageId);
        if (messageObj && messageObj.message) {
            viewModel.$backorderMessage.text(messageObj.message);
            return;
        }
    }

    viewModel.$backorderMessage.text('');
}

export function toggleBackorderedContainer(viewModel) {
    const hasContent = viewModel.$backorderedQtyMessage.text().trim() !== ''
        || viewModel.$backorderMessage.text().trim() !== '';

    if (hasContent) {
        viewModel.$backordered.show();
    } else {
        viewModel.$backordered.hide();
    }
}

export function updateBackorderContext(context, data) {
    if (typeof data.available_on_hand === 'number') {
        // eslint-disable-next-line no-param-reassign
        context.availableOnHand = data.available_on_hand;
    } else if (typeof data.stock === 'number') {
        // eslint-disable-next-line no-param-reassign
        context.availableOnHand = data.stock;
    }
    if (typeof data.available_for_backorder === 'number') {
        // eslint-disable-next-line no-param-reassign
        context.availableForBackorder = data.available_for_backorder;
    }
    if (typeof data.available_to_sell === 'number') {
        // eslint-disable-next-line no-param-reassign
        context.availableToSell = data.available_to_sell;
    }
    if (typeof data.show_backorder_availability_prompt === 'boolean') {
        // eslint-disable-next-line no-param-reassign
        context.showBackorderAvailabilityPrompt = data.show_backorder_availability_prompt;
    }
    if (typeof data.backorder_availability_prompt === 'string') {
        // eslint-disable-next-line no-param-reassign
        context.backorderAvailabilityPrompt = data.backorder_availability_prompt;
    }
    if (typeof data.unlimited_backorder === 'boolean') {
        // eslint-disable-next-line no-param-reassign
        context.unlimitedBackorder = data.unlimited_backorder;
    }
    // eslint-disable-next-line no-param-reassign
    context.backorderMessageId = data.backorder_message_id ?? null;
}

export function updateBackorderPrompt(context, getViewModel, $scope, passedViewModel) {
    const viewModel = passedViewModel || getViewModel($scope);

    if (!viewModel.$backorderPrompt.length) return;

    const showPrompt = context.showBackorderAvailabilityPrompt;
    const promptText = context.backorderAvailabilityPrompt;

    if (showPrompt && getAvailableToSell(context) > 0 && getAvailableForBackorder(context) > 0 && promptText) {
        viewModel.$backorderPrompt.text(`(${promptText})`).show();
    } else {
        viewModel.$backorderPrompt.hide();
    }
}

function showQtyLimitMessage(viewModel, $variantMessage, message) {
    viewModel.$addToCart.prop('disabled', true);
    $('.alertBox-message', $variantMessage).text(message);
    $variantMessage.attr('data-qty-limit', 'true').show();
}

function clearQtyLimitMessage(context, viewModel, $variantMessage, reEnable) {
    const hadQtyLimit = $variantMessage.attr('data-qty-limit') === 'true';
    // The server's verdict for the current selection wins. The quantity stepper is
    // optional in this theme (`show_quantity_input`), so an absent stepper must not
    // read as "nothing disabled it" and hand back an enabled button.
    const blockedBySelection = context.canPurchaseSelection === false
        || viewModel.$increments.prop('disabled') === true;

    // Re-enable when the main sell-limit is known (legacy behaviour) or when we are
    // clearing a qty-limit message we set ourselves — otherwise a button disabled by
    // a picklist limit would stay disabled once the qty drops back into range while
    // the main available-to-sell is unknown.
    if ((reEnable || hadQtyLimit) && !blockedBySelection) {
        viewModel.$addToCart.prop('disabled', false);
    }

    if (hadQtyLimit) {
        $variantMessage.removeAttr('data-qty-limit').hide();
        $('.alertBox-message', $variantMessage).text('');
    }
}

/**
 * Block add-to-cart and state the limit when the requested quantity exceeds what
 * the product — or one of its selected pick-list options — can still sell.
 *
 * @param {Object} context Per-instance context
 * @param {Object} viewModel Product view model
 * @param {Object} $scope jQuery scope of the product instance
 * @param {Number} qty Requested quantity
 * @param {Object} picklistBackorder PicklistBackorder instance, may be null
 */
export function updateAddToCartForQty(context, viewModel, $scope, qty, picklistBackorder) {
    const $variantMessage = $('.productAttributes-message', $scope);
    const availableToSell = getAvailableToSell(context);

    // The main product's sell-limit takes priority over any picklist limit.
    if (availableToSell > 0 && qty > availableToSell) {
        const template = context.quantityMaxMessage || 'The maximum purchasable quantity is __QTY__';
        showQtyLimitMessage(viewModel, $variantMessage, template.replace('__QTY__', availableToSell));
        return;
    }

    // A selected picklist item may exhaust its own available-to-sell before the
    // main product does. Surface its limit and block add-to-cart in that case.
    const picklistLimit = picklistBackorder && picklistBackorder.getSellLimitViolation(qty);

    if (picklistLimit) {
        const template = context.quantityMaxPicklistMessage
            || 'The maximum purchasable quantity for __NAME__ is __QTY__';
        const message = template
            .replace('__NAME__', picklistLimit.name)
            .replace('__QTY__', picklistLimit.availableToSell);
        showQtyLimitMessage(viewModel, $variantMessage, message);
        return;
    }

    // No sell-limit exceeded. Preserve the legacy behaviour of not touching the
    // add-to-cart state when the main sell-limit is unknown (handled by the
    // out-of-stock logic), but still clear a stale qty-limit message.
    clearQtyLimitMessage(context, viewModel, $variantMessage, availableToSell > 0);
}

/**
 * Whether the selection can still be sold. A backorderable product has no on-hand
 * stock yet is purchasable, so `instock` alone would wrongly mark it sold out.
 *
 * @param {Object} context Per-instance context
 * @param {Object} data Product attribute data from an option-change response
 * @returns {Boolean}
 */
export function canSellFromData(context, data) {
    const dataAvailableToSell = typeof data.available_to_sell === 'number'
        ? data.available_to_sell
        : getAvailableToSell(context);

    return Boolean(data.instock) || dataAvailableToSell > 0;
}

/**
 * Show or hide the server-rendered sold-out alert. A non-purchasable selection's
 * "currently unavailable" message (e.g. an out-of-stock pick-list option) is kept
 * visible; it is only cleared once the selection is actually purchasable.
 *
 * @param {Object} $scope jQuery scope of the product instance
 * @param {Boolean} canSell Whether the selection can still be sold
 * @param {Boolean} purchasable Server verdict for the current selection
 */
export function recordPurchasableSelection(context, data, canSell) {
    // eslint-disable-next-line no-param-reassign
    context.canPurchaseSelection = Boolean(data.purchasable) && canSell;
}

export function toggleSoldOutAlert($scope, canSell, purchasable = true) {
    const $soldOut = $('[data-product-oos-alert]', $scope);
    const $variantMessage = $('.productAttributes-message', $scope);

    if (canSell) {
        $soldOut.hide();
        if (purchasable) {
            $variantMessage.hide();
        }
    } else if ($soldOut.length) {
        $soldOut.show();
    }
}

/**
 * Hide a "ship today" shipping countdown when the requested quantity exceeds
 * ship-ready stock — the smallest known of on-hand / to-sell / stock, ignoring
 * unknown signals. The surplus is backordered, so the order cannot ship on the
 * promised schedule.
 *
 * `available_on_hand` is absent from the storefront context and arrives only with
 * the option-change response, so this runs from the qty/option flow rather than
 * from the countdown module itself. A module that re-shows its element on a timer
 * via an inline style is overridden by the `.is-hidden` rule in _productView.scss.
 *
 * No countdown ships with this theme today; the hook is a no-op until a merchant
 * or add-on renders `[data-shipping-countdown]` on the product page.
 *
 * @param {Object} context Per-instance context
 * @param {Object} $scope jQuery scope of the product instance
 * @param {Number} qty Requested quantity
 */
export function updateShippingCountdownVisibility(context, $scope, qty) {
    const $countdown = $('[data-shipping-countdown]', $scope);

    if (!$countdown.length) return;

    const signals = [
        context.availableOnHand,
        context.availableToSell,
        $('[data-product-stock]', $scope).first().text(),
    ]
        .map(value => parseInt(value, 10))
        .filter(value => !Number.isNaN(value));

    const requested = parseInt(qty, 10) || 0;
    const limit = signals.length ? Math.min(...signals) : null;

    $countdown.toggleClass('is-hidden', limit !== null && requested > limit);
}

export function backorderViewModelSelectors($scope) {
    return {
        $backordered: $('[data-product-backordered]', $scope),
        $backorderedQtyMessage: $('[data-qty-backordered-message]', $scope),
        $backorderMessage: $('[data-backorder-message]', $scope),
        $backorderPrompt: $('[data-backorder-prompt]', $scope),
    };
}
