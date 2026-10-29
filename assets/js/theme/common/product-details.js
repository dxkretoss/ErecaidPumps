import utils from '@bigcommerce/stencil-utils';
import 'foundation-sites/js/foundation/foundation';
import 'foundation-sites/js/foundation/foundation.reveal';
import foundation from '../global/foundation'; // Supermarket
import 'slick-carousel';
import ImageGallery from '../product/image-gallery';
import modalFactory, { defaultModal, ModalEvents, showAlertModal } from '../global/modal';
import { isEmpty, isPlainObject } from 'lodash';
import Wishlist from '../wishlist';
import bannerUtils from './utils/banner-utils';
import currencySelector from '../global/currency-selector';
import PicklistBackorder from './picklist-backorder';
import {
    updateQtyBackorderedMessage as backorderQtyMsg,
    updateBackorderMessage as backorderMsg,
    toggleBackorderedContainer as backorderToggle,
    updateBackorderContext as backorderCtx,
    updateBackorderPrompt as backorderPrompt,
    updateAddToCartForQty as backorderQtyLimit,
    updateShippingCountdownVisibility as shippingCountdownVisibility,
    createProductBackorderContext,
    canSellFromData,
    recordPurchasableSelection,
    toggleSoldOutAlert,
    backorderViewModelSelectors,
} from './utils/backorder-utils';
import AlsoBought from '../../emthemes-modez/also-bought'; // Papathemes - Supermarket

// Supermarket - OBPS Mod
/* eslint-disable */
function shake($el, settings) {
    if (typeof settings === 'undefined') {
        settings = {};
    }

    if (typeof settings.interval === 'undefined') {
        settings.interval = 100;
    }

    if (typeof settings.distance === 'undefined') {
        settings.distance = 10;
    }

    if (typeof settings.times === 'undefined') {
        settings.times = 4;
    }

    if (typeof settings.complete === 'undefined') {
        settings.complete = function () { };
    }

    $el.css('position', 'relative');

    for (let iter = 0; iter < (settings.times + 1); iter++) {
        $el.animate({ left: ((iter % 2 === 0 ? settings.distance : settings.distance * -1)) }, settings.interval);
    }

    $el.animate({ left: 0 }, settings.interval, settings.complete);
}
/* eslint-enable */

// Supermarket: Fix Price not update when a product option is checked
function supermarketSerialize($form) {
    const assoc = $form.serializeArray().reduce((_assoc, { name, value }) => {
        // eslint-disable-next-line no-param-reassign
        _assoc[name] = value;
        return _assoc;
    }, {});
    return $.param(assoc);
}

export default class ProductDetails {
    constructor($scopeArg, context, productAttributesData = {}) { // Supermarket Also Bought MOD
        // Supermarket Also Bought MOD {{{
        const $scope = context.enableAlsoBought ? $scopeArg.find('[data-also-bought-parent-scope]') : $scopeArg;
        this.$productViewScope = $scopeArg;
        // }}}


        this.$overlay = $('[data-cart-item-add] .loadingOverlay');
        this.$scope = $scope;
        // Per-instance context: per-product backorder values come from this scope's own
        // data-* attributes. The page context is shared by every instance — quick-view and
        // Also Bought products are handed the page product's context — and Also Bought even
        // mutates it in place, so a shared reference would surface the wrong product's stock.
        this.context = createProductBackorderContext(context, $scope);
        this.picklistBackorder = new PicklistBackorder($scope, this.context);

        // papathemes: need for bulk-order layout
        this.$card = context.$card;
        this.$cardBulkOrderOptions = context.$cardBulkOrderOptions;
        this.closeQuickView = context.closeQuickView;

        this.imageGallery = new ImageGallery($('[data-image-gallery]', this.$scope));
        this.imageGallery.init();
        this.listenQuantityChange();
        this.initRadioAttributes();
        foundation($(document)); // Supermarket
        this.initCustomTabs(); // Papathemes - Supermarket

        if (context.enableAlsoBought) {
            this.alsoBought = new AlsoBought(this); // Papathemes - Supermarket
        }

        Wishlist.load(this.context);
        this.getTabRequests();

        const $form = $('form[data-cart-item-add]', $scope);
        const $productOptionsElement = $('[data-product-option-change]', $form);
        const hasOptions = ($productOptionsElement.html() || '').trim().length;
        const hasDefaultOptions = $productOptionsElement.find('[data-default]').length;

        if ($form[0].checkValidity()) {
            this.updateProductDetailsData();
        } else {
            this.toggleWalletButtonsVisibility(false);
        }

        // Papathemes - Supermarket: Fix click reviews link open tab
        $('a[href*="#tab-reviews"]', $scope).on('click', (event) => {
            if (!$(event.target).is('.tab-title')) {
                $('[data-tab] a[href="#tab-reviews"]', $scope).click().scrollTop(0);
            }
        });

        $productOptionsElement.on('change', event => {
            this.productOptionsChanged(event);
            this.setProductVariant();
        });

        if (!hasOptions) {
            const simpleProductId = $('[name="product_id"]', $form).val();
            utils.api.productAttributes.optionChange(simpleProductId, $form.serialize(), (err, response) => {
                if (err || !response || !response.data) return;
                this.updateBackorderContext(response.data);
                const vm = this.getViewModel(this.$scope);
                const qty = parseInt(vm.quantity.$input.val(), 10) || 0;
                this.updateQtyBackorderedMessage(qty, vm);
                this.updateBackorderMessage(vm);
                this.updateBackorderPrompt(vm);
                this.toggleBackorderedContainer(vm);
                this.picklistBackorder.render(response.data, qty);
                this.updateAddToCartForQty(qty, vm);
            });
        }

        $form.on('submit', event => {
            this.addProductToCart(event, $form[0]);
        });

        // papathemes: need for bulk-order layout
        $form.find('#form-action-addToCartLater').on('click', (event) => {
            event.preventDefault();
            this.addProductToCartLater(event, $form[0]);
        });

        // Update product attributes. Also update the initial view in case items are oos
        // or have default variant properties that change the view
        if ((isEmpty(productAttributesData) || hasDefaultOptions) && hasOptions) {
            const $productId = $('[name="product_id"]', $form).val();

            utils.api.productAttributes.optionChange($productId, supermarketSerialize($form), 'products/bulk-discount-rates', (err, response) => {
                const attributesData = response.data || {};
                const attributesContent = response.content || {};
                this.updateProductAttributes(attributesData);
                if (hasDefaultOptions || context.forceUpdateView) { // papathemes: bulk-order layout edited
                    this.updateView(attributesData, attributesContent);
                } else {
                    this.updateDefaultAttributesForOOS(attributesData);
                }
            });
        } else {
            this.updateProductAttributes(productAttributesData);
            bannerUtils.dispatchProductBannerEvent(productAttributesData);
        }

        $productOptionsElement.show();

        this.previewModal = modalFactory('#previewModal')[0];

        // Supermarket
        if (this.previewModal) {
            this.previewModal.$modal.addClass('preview-modal').addClass(`preview-modal--${context.themeSettings.add_to_cart_popup}`);
            if (context.themeSettings.add_to_cart_popup === 'mini') {
                // unbind open/close event of the original modal
                this.previewModal.$modal.off(ModalEvents.open, this.previewModal.onModalOpen);
                this.previewModal.$modal.off(ModalEvents.close, this.previewModal.onModalClose);

                // bind open/class event for mini preview modal
                this.previewModal.onModalOpen = this.onMiniPreviewModalOpen.bind(this.previewModal);
                this.previewModal.onModalClose = this.onMiniPreviewModalClose.bind(this.previewModal);
                this.previewModal.$modal.on(ModalEvents.open, this.previewModal.onModalOpen);
                this.previewModal.$modal.on(ModalEvents.close, this.previewModal.onModalClose);
            }
        }
    }

    /**
     * https://stackoverflow.com/questions/49672992/ajax-request-fails-when-sending-formdata-including-empty-file-input-in-safari
     * Safari browser with jquery 3.3.1 has an issue uploading empty file parameters. This function removes any empty files from the form params
     * @param formData: FormData object
     * @returns FormData object
     */
    filterEmptyFilesFromForm(formData) {
        try {
            for (const [key, val] of formData) {
                if (val instanceof File && !val.name && !val.size) {
                    formData.delete(key);
                }
            }
        } catch (e) {
            console.error(e); // eslint-disable-line no-console
        }
        return formData;
    }

    setProductVariant() {
        const unsatisfiedRequiredFields = [];
        const options = [];

        this.$scope.find('[data-product-attribute]').each((index, value) => { // papathemes: fix selector don't respect the scope
            const optionLabel = value.children[0].innerText;
            const optionTitle = optionLabel.split(':')[0].trim();
            const required = optionLabel.toLowerCase().includes('required');
            const type = value.getAttribute('data-product-attribute');

            if ((type === 'input-file' || type === 'input-text' || type === 'input-number') && value.querySelector('input').value === '' && required) {
                unsatisfiedRequiredFields.push(value);
            }

            if (type === 'textarea' && value.querySelector('textarea').value === '' && required) {
                unsatisfiedRequiredFields.push(value);
            }

            if (type === 'date') {
                const isSatisfied = Array.from(value.querySelectorAll('select')).every((select) => select.selectedIndex !== 0);

                if (isSatisfied) {
                    const dateString = Array.from(value.querySelectorAll('select')).map((x) => x.value).join('-');
                    options.push(`${optionTitle}:${dateString}`);

                    return;
                }

                if (required) {
                    unsatisfiedRequiredFields.push(value);
                }
            }

            if (type === 'set-select') {
                const select = value.querySelector('select');
                const selectedIndex = select.selectedIndex;

                if (selectedIndex !== 0) {
                    options.push(`${optionTitle}:${select.options[selectedIndex].innerText}`);

                    return;
                }

                if (required) {
                    unsatisfiedRequiredFields.push(value);
                }
            }

            if (type === 'set-rectangle' || type === 'set-radio' || type === 'swatch' || type === 'input-checkbox' || type === 'product-list') {
                const checked = value.querySelector(':checked');
                if (checked) {
                    if (type === 'set-rectangle' || type === 'set-radio' || type === 'product-list') {
                        const label = checked.labels ? checked.labels[0].innerText : $(`label[for=${checked.id}]`).first().text();
                        if (label) {
                            options.push(`${optionTitle}:${label}`);
                        }
                    }

                    if (type === 'swatch') {
                        const label = checked.labels ? checked.labels[0].children[0] : $(`label[for=${checked.id}]`).children().get(0);
                        if (label) {
                            options.push(`${optionTitle}:${label.title}`);
                        }
                    }

                    if (type === 'input-checkbox') {
                        options.push(`${optionTitle}:Yes`);
                    }

                    return;
                }

                if (type === 'input-checkbox') {
                    options.push(`${optionTitle}:No`);
                }

                if (required) {
                    unsatisfiedRequiredFields.push(value);
                }
            }
        });

        let productVariant = unsatisfiedRequiredFields.length === 0 ? options.sort().join(', ') : 'unsatisfied';
        const view = $('.productView');

        if (productVariant) {
            productVariant = productVariant === 'unsatisfied' ? '' : productVariant;
            if (view.attr('data-event-type')) {
                view.attr('data-product-variant', productVariant);
            } else {
                const productName = view.find('.productView-title')[0].innerText;
                const card = $(`[data-name=${JSON.stringify(productName)}]`); // Fixed by PapaThemes
                card.attr('data-product-variant', productVariant);
            }
        }
    }

    // papathemes: need for bulk-order layout
    createSelectedOptionsHtml() {
        const $dl = $('<dl></dl>');

        this.$scope.find('[data-product-attribute]').each((index, el) => {
            const optionTitle = el.children[0]?.childNodes[0]?.nodeValue?.split(':')[0].trim();
            const type = el.getAttribute('data-product-attribute');

            if (type === 'date') {
                const isSatisfied = Array.from(el.querySelectorAll('select')).every((select) => select.selectedIndex !== 0);

                if (isSatisfied) {
                    const dateString = Array.from(el.querySelectorAll('select')).map((x) => x.value).join('-');
                    $('<dt></dt>').text(optionTitle).appendTo($dl);
                    $('<dd></dd>').text(dateString).appendTo($dl);
                }
            } else if (type === 'set-select') {
                const select = el.querySelector('select');
                const selectedIndex = select.selectedIndex;

                if (selectedIndex !== 0) {
                    $('<dt></dt>').text(optionTitle).appendTo($dl);
                    $('<dd></dd>').text(select.options[selectedIndex].innerText).appendTo($dl);
                }
            } else if (type === 'set-rectangle' || type === 'set-radio' || type === 'swatch' || type === 'input-checkbox' || type === 'product-list') {
                const checked = el.querySelector(':checked');
                if (checked) {
                    if (type === 'set-rectangle' || type === 'set-radio' || type === 'product-list' || type === 'input-checkbox') {
                        const label = checked.labels ? checked.labels[0].innerText : $(`label[for=${checked.id}]`).first().text();
                        $('<dt></dt>').text(optionTitle).appendTo($dl);
                        $('<dd></dd>').text(label).appendTo($dl);
                    }

                    if (type === 'swatch') {
                        const label = checked.labels ? checked.labels[0].children[0] : $(`label[for=${checked.id}]`).children().get(0);
                        $('<dt></dt>').text(optionTitle).appendTo($dl);
                        $('<dd></dd>').text(label.title).appendTo($dl);
                    }
                }
            } else if (type === 'input-file') {
                const input = el.querySelector('input[type="file"]');
                if (input.files.length) {
                    $('<dt></dt>').text(optionTitle).appendTo($dl);
                    $('<dd></dd>').text(input.files[0].name).appendTo($dl);
                }
            } else if (type === 'textarea') {
                const textarea = el.querySelector('textarea');
                if (textarea.value) {
                    $('<dt></dt>').text(optionTitle).appendTo($dl);
                    $('<dd></dd>').text(textarea.value).appendTo($dl);
                }
            } else {
                const input = el.querySelector('input');
                if (input.value) {
                    $('<dt></dt>').text(optionTitle).appendTo($dl);
                    $('<dd></dd>').text(input.value).appendTo($dl);
                }
            }
        });

        return $dl.children().length > 0 ? $dl.prop('outerHTML') : '';
    }

    /**
     * Since $productView can be dynamically inserted using render_with,
     * We have to retrieve the respective elements
     *
     * @param $scope
     */
    getViewModel($scope) {
        return {
            $priceWithTax: $('[data-product-price-with-tax]', $scope),
            $priceWithoutTax: $('[data-product-price-without-tax]', $scope),
            rrpWithTax: {
                $div: $('.rrp-price--withTax', $scope),
                $span: $('[data-product-rrp-with-tax]', $scope),
            },
            rrpWithoutTax: {
                $div: $('.rrp-price--withoutTax', $scope),
                $span: $('[data-product-rrp-price-without-tax]', $scope),
            },
            nonSaleWithTax: {
                $div: $('.non-sale-price--withTax', $scope),
                $span: $('[data-product-non-sale-price-with-tax]', $scope),
            },
            nonSaleWithoutTax: {
                $div: $('.non-sale-price--withoutTax', $scope),
                $span: $('[data-product-non-sale-price-without-tax]', $scope),
            },
            priceSaved: {
                $div: $('.price-section--saving', $scope),
                $span: $('[data-product-price-saved]', $scope),
            },
            priceNowLabel: {
                $span: $('.price-now-label', $scope),
            },
            priceLabel: {
                $span: $('.price-label', $scope),
            },
            $weight: $('.productView-info [data-product-weight]', $scope),
            $increments: $('.form-field--increments :input', $scope),
            $addToCart: $('#form-action-addToCart', $scope),
            $wishlistVariation: $('[data-wishlist-add] [name="variation_id"]', $scope),
            stock: {
                $container: $('.form-field--stock', $scope),
                $input: $('[data-product-stock]', $scope),
            },
            ...backorderViewModelSelectors($scope),
            sku: {
                $label: $('dt.sku-label', $scope),
                $value: $('[data-product-sku]', $scope),
            },
            upc: {
                $label: $('dt.upc-label', $scope),
                $value: $('[data-product-upc]', $scope),
            },
            mpn: {
                $label: $('dt.mpn-label', $scope),
                $value: $('[data-product-mpn]', $scope),
            },
            quantity: {
                $text: $('.incrementTotal', $scope),
                $input: $('[name=qty\\[\\]]', $scope),
            },
            $bulkPricing: $('.productView-info-bulkPricing', $scope),
            $walletButtons: $('[data-add-to-cart-wallet-buttons]', $scope),
        };
    }

    /**
     * Checks if the current window is being run inside an iframe
     * @returns {boolean}
     */
    isRunningInIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    /**
     *
     * Handle product options changes
     *
     */
    productOptionsChanged(event) {
        const $changedOption = $(event.target);
        const $form = $changedOption.parents('form');
        const productId = $('[name="product_id"]', $form).val();

        // Do not trigger an ajax request if it's a file or if the browser doesn't support FormData
        if ($changedOption.attr('type') === 'file' || window.FormData === undefined) {
            return;
        }

        // Supermarket: display selected swatch title
        if ($changedOption.data('productAttributeLabel')) {
            $changedOption
                .closest('[data-product-attribute]')
                .find('[data-option-value]')
                .html($changedOption.data('productAttributeLabel'));
        }

        utils.api.productAttributes.optionChange(productId, supermarketSerialize($form), 'products/bulk-discount-rates', (err, response) => {
            const productAttributesData = response.data || {};
            const productAttributesContent = response.content || {};
            this.updateProductAttributes(productAttributesData);
            this.updateView(productAttributesData, productAttributesContent);
            this.updateProductDetailsData();
            bannerUtils.dispatchProductBannerEvent(productAttributesData);

            document.dispatchEvent(new CustomEvent('onProductOptionsChanged', {
                bubbles: true,
                detail: {
                    content: productAttributesContent,
                    data: productAttributesData,
                },
            }));
        });
    }

    showProductImage(image) {
        if (isPlainObject(image)) {
            const zoomImageUrl = utils.tools.imageSrcset.getSrcset(
                image.data,
                { '1x': this.context.themeSettings.zoom_size },
                /*
                    Should match zoom size used for data-zoom-image in
                    components/products/product-view.html
                    Note that this will only be used as a fallback image for browsers that do not support srcset
                    Also note that getSrcset returns a simple src string when exactly one size is provided
                */
            );

            const mainImageUrl = utils.tools.imageSrcset.getSrcset(
                image.data,
                { '1x': this.context.themeSettings.product_size },
                /*
                    Should match fallback image size used for the main product image in
                    components/products/product-view.html
                    Note that this will only be used as a fallback image for browsers that do not support srcset
                    Also note that getSrcset returns a simple src string when exactly one size is provided
                */
            );

            const mainImageSrcset = this.context.themeSettings.product_image_responsive ? utils.tools.imageSrcset.getSrcset(image.data) : '';

            this.imageGallery.setAlternateImage({
                // mainImageUrl: `${mainImageUrl}?imbypass=on`,
                // zoomImageUrl: `${zoomImageUrl}?imbypass=on`,
                mainImageUrl,
                zoomImageUrl,
                mainImageSrcset,
            });
        } else {
            this.imageGallery.restoreImage();
        }
    }

    /**
     *
     * Handle action when the shopper clicks on + / - for quantity
     *
     */
    listenQuantityChange() {
        this.$scope.on('click', '[data-quantity-change] button', event => {
            event.preventDefault();
            const $target = $(event.currentTarget);
            const viewModel = this.getViewModel(this.$scope);
            const $input = viewModel.quantity.$input;
            const quantityMin = parseInt($input.data('quantityMin'), 10);
            const quantityMax = parseInt($input.data('quantityMax'), 10);

            let qty = parseInt($input.val(), 10);

            // If action is incrementing
            if ($target.data('action') === 'inc') {
                // If quantity max option is set
                if (quantityMax > 0) {
                    // Check quantity does not exceed max
                    if ((qty + 1) <= quantityMax) {
                        qty++;
                    }
                } else {
                    qty++;
                }
            } else if (qty > 1) {
                // If quantity min option is set
                if (quantityMin > 0) {
                    // Check quantity does not fall below min
                    if ((qty - 1) >= quantityMin) {
                        qty--;
                    }
                } else {
                    qty--;
                }
            }

            // update hidden input
            viewModel.quantity.$input.val(qty);
            // update text
            viewModel.quantity.$text.text(qty);

            this.updateProductDetailsData();
            this.updateQtyBackorderedMessage(qty, viewModel);
            this.updateBackorderMessage(viewModel);
            this.toggleBackorderedContainer(viewModel);
            this.updateAddToCartForQty(qty, viewModel);
            this.picklistBackorder.rerender(qty);
        });

        // --------------------------------------------------------------------
        // Giao - supermarket:
        // Fix problem when enter on quantity box won't decrease 1 unit
        // --------------------------------------------------------------------
        this.getViewModel(this.$scope).quantity.$input.on('keypress', (event) => {
            if (event.keyCode === 13) {
                event.preventDefault();
            }
        });

        // --------------------------------------------------------------------

        this.$scope.on('keyup', '.form-input--incrementTotal', () => {
            const viewModel = this.getViewModel(this.$scope);
            const qty = parseInt(viewModel.quantity.$input.val(), 10) || 0;
            this.updateProductDetailsData();
            this.updateQtyBackorderedMessage(qty, viewModel);
            this.updateBackorderMessage(viewModel);
            this.toggleBackorderedContainer(viewModel);
            this.updateAddToCartForQty(qty, viewModel);
            this.picklistBackorder.rerender(qty);
        });
    }

    /**
     *
     * Add a product to cart
     *
     */
    addProductToCart(event, form) {
        const $addToCartBtn = $('#form-action-addToCart', $(event.target));
        const originalBtnVal = $addToCartBtn.val();
        const waitMessage = $addToCartBtn.data('waitMessage');

        // Do not do AJAX if browser doesn't support FormData
        if (window.FormData === undefined) {
            return;
        }

        // Prevent default
        event.preventDefault();

        $addToCartBtn
            .val(waitMessage)
            .prop('disabled', true);

        this.$overlay.show();

        // Add item to cart
        utils.api.cart.itemAdd(this.filterEmptyFilesFromForm(new FormData(form)), async (err, response) => {
            if (response && response.data && response.data.cart_id) {
                currencySelector(response.data.cart_id);
            }
            const errorMessage = err || response.data.error;

            $addToCartBtn
                .val(originalBtnVal)
                .prop('disabled', false);

            this.$overlay.hide();

            // Guard statement
            if (errorMessage) {
                // Strip the HTML from the error message
                const tmp = document.createElement('DIV');
                tmp.innerHTML = errorMessage;

                return showAlertModal(tmp.textContent || tmp.innerText);
            }

            // Papathemes - Supermarket - wait until also-bought products added
            if (typeof this.alsoBought !== 'undefined') {
                $addToCartBtn.val(waitMessage).prop('disabled', true);
                const result = await this.alsoBought.parentProductAddedToCart();
                $addToCartBtn.val(originalBtnVal).prop('disabled', false);
                if (!result) {
                    return;
                }
            }

            // Papathemes - Supermarket: Support redirect to cart page after added to cart
            if (this.context.themeSettings.redirect_cart) {
                this.redirectTo(response.data.cart_item.cart_url || this.context.urls.cart);
                return;
            }

            // Open preview modal and update content
            if (this.previewModal) {
                // Supermarket OBPS Mod
                const modal = defaultModal();
                modal.close();
                if (this.context.themeSettings.add_to_cart_popup !== 'hide') {
                    this.previewModal.open();
                }

                if (window.ApplePaySession) {
                    this.previewModal.$modal.addClass('apple-pay-supported');
                }

                this.updateCartContent(this.previewModal, response.data.cart_item.id);
            } else {
                this.$overlay.show();
                // if no modal, redirect to the cart page
                this.redirectTo(response.data.cart_item.cart_url || this.context.urls.cart);
            }
        });
    }

    // papathemes: need for bulk-order layout
    addProductToCartLater(event, form) {
        if (form.reportValidity && !form.reportValidity()) {
            return;
        }

        if (this.$cardBulkOrderOptions) {
            const $form = this.$scope.find('form[data-cart-item-add]');
            $form.addClass('u-hiddenVisually');

            // Update price and qty of the bulk-order item
            if (this.$card) {
                const viewModel = this.getViewModel(this.$scope);
                const $cardPriceWithTax = this.$card.find('[data-product-price-with-tax]');
                const $cardPriceWithoutTax = this.$card.find('[data-product-price-without-tax]');
                const $boPriceFormatted = this.$card.find('[data-bulkorder-price-formatted]');
                const $boPriceValue = this.$card.find('[data-bulkorder-price-value]');

                if (viewModel.$priceWithTax.length > 0) {
                    const priceFormatted = viewModel.$priceWithTax.html();
                    const priceValue = viewModel.$priceWithTax.data('priceValue');

                    $cardPriceWithTax.html(priceFormatted);

                    if ($cardPriceWithTax.length > 0) {
                        $boPriceFormatted.data('bulkorderPriceFormatted', priceFormatted);

                        if (priceValue) {
                            $boPriceValue.data('bulkorderPriceValue', priceValue);
                        }
                    }
                }

                if (viewModel.$priceWithoutTax.length > 0) {
                    const priceFormatted = viewModel.$priceWithoutTax.html();
                    const priceValue = viewModel.$priceWithoutTax.data('priceValue');

                    $cardPriceWithoutTax.html(priceFormatted);

                    if ($cardPriceWithoutTax.length > 0 && $cardPriceWithTax.length === 0) {
                        $boPriceFormatted.data('bulkorderPriceFormatted', priceFormatted);

                        if (priceValue) {
                            $boPriceValue.data('bulkorderPriceValue', priceValue);
                        }
                    }
                }

                // Update card quantity box
                const qty = viewModel.quantity.$input.val() || 1;
                const minQty = viewModel.quantity.$input.data('quantityMin');
                const maxQty = viewModel.quantity.$input.data('quantityMax');
                const $cardQty = this.$card.find('[data-quantity-change] input');
                if (minQty) {
                    $cardQty.attr('data-quantity-min', minQty);
                }
                if (maxQty) {
                    $cardQty.attr('data-quantity-max', maxQty);
                }
                $cardQty.val(qty).trigger('change');
            }

            // Insert the add to cart form to the bulk-order item
            this.$cardBulkOrderOptions
                .html(this.createSelectedOptionsHtml())
                .append($form);

            // remove ID to avoid duplicate ID in the DOM
            $form.find('[id]').each((_index, el) => {
                const $el = $(el);
                $el.attr('data-last-element-id', $el.attr('id'))
                    .removeAttr('id');
            });
        }

        if (typeof this.closeQuickView === 'function') {
            this.closeQuickView();
        }
    }

    /**
     * Get cart contents
     *
     * @param {String} cartItemId
     * @param {Function} onComplete
     */
    getCartContent(cartItemId, onComplete) {
        const options = {
            template: 'cart/preview',
            params: {
                suggest: cartItemId,
            },
            config: {
                cart: {
                    suggestions: {
                        limit: 4,
                    },
                },
            },
        };

        utils.api.cart.getContent(options, onComplete);
    }

    /**
     * Redirect to url
     *
     * @param {String} url
     */
    redirectTo(url) {
        if (this.isRunningInIframe() && !window.iframeSdk) {
            window.top.location = url;
        } else {
            window.location = url;
        }
    }

    /**
     * Update cart content
     *
     * @param {Modal} modal
     * @param {String} cartItemId
     * @param {Function} onComplete
     */
    updateCartContent(modal, cartItemId, onComplete) {
        this.getCartContent(cartItemId, (err, response) => {
            if (err) {
                return;
            }

            // cart/preview HTML may contain inline <script> tags injected by
            // BigCommerce (e.g. Facebook Pixel via additional_checkout_buttons).
            // If fbq / other globals are not yet loaded, jQuery's .html() will
            // throw when it evaluates those scripts. The DOM is already mutated
            // before the throw, so wrapping in try-catch is safe — we just
            // ensure the code below (event dispatch, counter update) still runs.
            try {
                modal.updateContent(response);
            } catch (e) {
                // Ignore errors from inline scripts in the server-rendered HTML.
            }
            this.applyModalAutoClose(modal); // Supermarket

            // Notify papathemes-socialproof cart goal bar (and other listeners)
            // that the added-to-cart modal has been populated with fresh cart HTML.
            // Pass subtotal: null — the handler re-reads data-subtotal from the
            // newly-injected [data-papathemes-cart-goal] element (rendered from
            // the numeric {{cart.sub_total.value}}, locale-safe).
            try {
                document.dispatchEvent(new CustomEvent('supermarket:cart-updated', {
                    detail: { subtotal: null },
                }));
            } catch (e) {
                // Never let event dispatch break cart preview.
            }

            // Update cart counter
            const $body = $('body');
            const $cartQuantity = $('[data-cart-quantity]', modal.$content);
            const $cartCounter = $('.navUser-action .cart-count');
            const quantity = $cartQuantity.data('cartQuantity') || 0;

            $cartCounter.addClass('cart-count--positive');
            $body.trigger('cart-quantity-update', quantity);

            if (onComplete) {
                onComplete(response);
            }

            // Supermarket - OBPS Mod
            shake($('.navUser-item--cart > .navUser-action'));
        });
    }

    /**
     * Show the variant-level message box if a message is passed. The box stays hidden
     * when the message is empty, or when the product-level sold-out alert is already
     * on screen, so the shopper never reads two stacked error boxes.
     * @param  {String} message
     */
    showMessageBox(message) {
        const $variantErrorBox = $('.productAttributes-message', this.$scope); // Papathemes fix missing $scope
        const $productErrorBox = $('[data-product-oos-alert]', this.$scope)
            .filter((i, el) => el.style.display !== 'none');

        if (!message || $productErrorBox.length) {
            $variantErrorBox.hide();
            return;
        }

        $('.alertBox-message', $variantErrorBox).text(message);
        $variantErrorBox.show();
    }

    /**
     * Hide the pricing elements that will show up only when the price exists in API
     * @param viewModel
     */
    clearPricingNotFound(viewModel) {
        viewModel.rrpWithTax.$div.hide();
        viewModel.rrpWithoutTax.$div.hide();
        viewModel.nonSaleWithTax.$div.hide();
        viewModel.nonSaleWithoutTax.$div.hide();
        viewModel.priceSaved.$div.hide();
        viewModel.priceNowLabel.$span.hide();
        viewModel.priceLabel.$span.hide();
    }

    /**
     * Update the view of price, messages, SKU and stock options when a product option changes
     * @param  {Object} data Product attribute data
     */
    updatePriceView(viewModel, price) {
        this.clearPricingNotFound(viewModel);

        if (price.with_tax) {
            viewModel.priceLabel.$span.show();
            viewModel.$priceWithTax.html(price.with_tax.formatted);
            viewModel.$priceWithTax.data('priceValue', price.with_tax.value); // papathemes: need for bulk-order layout
        }

        if (price.without_tax) {
            viewModel.priceLabel.$span.show();
            viewModel.$priceWithoutTax.html(price.without_tax.formatted);
            viewModel.$priceWithoutTax.data('priceValue', price.without_tax.value); // papathemes: need for bulk-order layout
        }

        if (price.rrp_with_tax) {
            viewModel.rrpWithTax.$div.show();
            viewModel.rrpWithTax.$span.html(price.rrp_with_tax.formatted);
        }

        if (price.rrp_without_tax) {
            viewModel.rrpWithoutTax.$div.show();
            viewModel.rrpWithoutTax.$span.html(price.rrp_without_tax.formatted);
        }

        if (price.saved) {
            viewModel.priceSaved.$div.show();
            viewModel.priceSaved.$span.html(price.saved.formatted);
        }

        if (price.non_sale_price_with_tax) {
            viewModel.priceLabel.$span.hide();
            viewModel.nonSaleWithTax.$div.show();
            viewModel.priceNowLabel.$span.show();
            viewModel.nonSaleWithTax.$span.html(price.non_sale_price_with_tax.formatted);
        }

        if (price.non_sale_price_without_tax) {
            viewModel.priceLabel.$span.hide();
            viewModel.nonSaleWithoutTax.$div.show();
            viewModel.priceNowLabel.$span.show();
            viewModel.nonSaleWithoutTax.$span.html(price.non_sale_price_without_tax.formatted);
        }
    }

    /**
     * Update the view of price, messages, SKU and stock options when a product option changes
     * @param  {Object} data Product attribute data
     */
    updateView(data, content = null) {
        const viewModel = this.getViewModel(this.$scope);

        this.showMessageBox(data.stock_message || data.purchasing_message);

        if (data.price instanceof Object) {
            this.updatePriceView(viewModel, data.price);
        }

        if (data.weight instanceof Object) {
            viewModel.$weight.html(data.weight.formatted);
        }

        // Set variation_id if it exists for adding to wishlist
        if (data.variantId) {
            viewModel.$wishlistVariation.val(data.variantId);
        }

        // If SKU is available
        if (data.sku) {
            viewModel.sku.$value.text(data.sku);
            viewModel.sku.$label.show();
        } else {
            viewModel.sku.$label.hide();
            viewModel.sku.$value.text('');
        }

        // If UPC is available
        if (data.upc) {
            viewModel.upc.$value.text(data.upc);
            viewModel.upc.$label.show();
        } else {
            viewModel.upc.$label.hide();
            viewModel.upc.$value.text('');
        }

        // If MPN is available
        if (data.mpn) {
            viewModel.mpn.$value.text(data.mpn);
            viewModel.mpn.$label.show();
        } else if (viewModel.mpn.$value.data('originalMpn')) {
            viewModel.mpn.$value.text(viewModel.mpn.$value.data('originalMpn'));
            viewModel.mpn.$label.show();
        } else {
            viewModel.mpn.$label.hide();
            viewModel.mpn.$value.text('');
        }

        // if stock view is on (CP settings)
        if (viewModel.stock.$container.length && typeof data.stock === 'number') {
            // if the stock container is hidden, show
            viewModel.stock.$container.removeClass('u-hiddenVisually');

            viewModel.stock.$input.text(data.stock);
        } else {
            viewModel.stock.$container.addClass('u-hiddenVisually');
            viewModel.stock.$input.text(data.stock);
        }

        this.updateBackorderContext(data);
        this.updateBackorderPrompt(viewModel);

        const currentQty = parseInt(viewModel.quantity.$input.val(), 10) || 0;
        this.updateQtyBackorderedMessage(currentQty, viewModel);
        this.updateBackorderMessage(viewModel);
        this.toggleBackorderedContainer(viewModel);
        this.picklistBackorder.render(data, currentQty);

        this.updateDefaultAttributesForOOS(data);
        this.updateAddToCartForQty(currentQty, viewModel);
        this.updateWalletButtonsView(data);

        // If Bulk Pricing rendered HTML is available
        if (data.bulk_discount_rates && content) {
            viewModel.$bulkPricing.html(content);
        } else if (typeof (data.bulk_discount_rates) !== 'undefined') {
            viewModel.$bulkPricing.html('');
        }

        const addToCartWrapper = $('.add-to-cart-wrapper', this.$scope);

        if (addToCartWrapper.is(':hidden') && data.purchasable) {
            addToCartWrapper.show();
        }

        if (data.purchasable) {
            this.$scope.find('._addToCartVisibility').filter(':hidden').show();
        }
        // The static OOS alert is toggled from updateDefaultAttributesForOOS(), which
        // reads available_to_sell as well as instock so a backorderable selection with
        // no on-hand stock is not labelled sold out.
    }

    updateWalletButtonsView(data) {
        this.toggleWalletButtonsVisibility(data.purchasable && canSellFromData(this.context, data));
    }

    // Backorder methods — delegate to shared backorder-utils to avoid duplication with ProductDetailsBase

    updateQtyBackorderedMessage(qty, passedViewModel) {
        backorderQtyMsg(this.context, $scope => this.getViewModel($scope), this.$scope, qty, passedViewModel);
    }

    updateBackorderMessage(passedViewModel) {
        backorderMsg(this.context, $scope => this.getViewModel($scope), this.$scope, passedViewModel);
    }

    toggleBackorderedContainer(viewModel) {
        backorderToggle(viewModel);
    }

    updateBackorderContext(data) {
        backorderCtx(this.context, data);
    }

    updateBackorderPrompt(passedViewModel) {
        backorderPrompt(this.context, $scope => this.getViewModel($scope), this.$scope, passedViewModel);
    }

    updateAddToCartForQty(qty, passedViewModel) {
        const viewModel = passedViewModel || this.getViewModel(this.$scope);

        backorderQtyLimit(this.context, viewModel, this.$scope, qty, this.picklistBackorder);
        // Runs from here so the check covers the initial option change, variant change
        // and quantity change alike.
        shippingCountdownVisibility(this.context, this.$scope, qty);
    }

    toggleWalletButtonsVisibility(shouldShow) {
        const viewModel = this.getViewModel(this.$scope);

        if (shouldShow) {
            viewModel.$walletButtons.show();
        } else {
            viewModel.$walletButtons.hide();
        }
    }

    updateDefaultAttributesForOOS(data) {
        const viewModel = this.getViewModel(this.$scope);
        const canSell = canSellFromData(this.context, data);

        if (!data.purchasable || !canSell) {
            viewModel.$addToCart.prop('disabled', true);
            viewModel.$increments.prop('disabled', true);
        } else {
            viewModel.$addToCart.prop('disabled', false);
            viewModel.$increments.prop('disabled', false);
        }

        recordPurchasableSelection(this.context, data, canSell);
        toggleSoldOutAlert(this.$scope, canSell, data.purchasable);
    }

    /**
     * Hide or mark as unavailable out of stock attributes if enabled
     * @param  {Object} data Product attribute data
     */
    updateProductAttributes(data) {
        const behavior = data.out_of_stock_behavior;
        const inStockIds = data.in_stock_attributes;
        const outOfStockDefaultMessage = this.context.outOfStockDefaultMessage;
        let outOfStockMessage = data.out_of_stock_message;

        this.showProductImage(data.image);

        if (behavior !== 'hide_option' && behavior !== 'label_option') {
            return;
        }

        if (outOfStockMessage) {
            outOfStockMessage = ` (${outOfStockMessage})`;
        } else {
            outOfStockMessage = ` (${outOfStockDefaultMessage})`;
        }

        $('[data-product-attribute-value]', this.$scope).each((i, attribute) => {
            const $attribute = $(attribute);
            const attrId = parseInt($attribute.data('productAttributeValue'), 10);


            if (inStockIds.indexOf(attrId) !== -1) {
                this.enableAttribute($attribute, behavior, outOfStockMessage);
            } else {
                this.disableAttribute($attribute, behavior, outOfStockMessage);
            }
        });
    }

    updateProductDetailsData() {
        // papathemes-supermarket:
        // Stop if product is also-bought product (FBT) to prevent incorrect price from quick payment button
        if (this.$scope.closest('[data-also-bought]').length > 0) {
            return;
        }

        const $form = this.$scope.find('form[data-cart-item-add]'); // papathemes: fix selector don't respect the scope
        const formDataItems = $form.serializeArray();

        const productDetails = {};

        for (const formDataItem of formDataItems) {
            const { name, value } = formDataItem;

            if (name === 'product_id') {
                productDetails.productId = Number(value);
            }

            if (name === 'qty[]') {
                productDetails.quantity = Number(value);
            }

            if (name.match(/attribute/)) {
                const productOption = {
                    optionId: Number(name.match(/\d+/g)[0]),
                    optionValue: value,
                };

                productDetails.optionSelections = productDetails?.optionSelections
                    ? [...productDetails.optionSelections, productOption]
                    : [productOption];
            }
        }

        document.dispatchEvent(new CustomEvent('onProductUpdate', {
            bubbles: true,
            detail: { productDetails },
        }));
    }

    disableAttribute($attribute, behavior, outOfStockMessage) {
        if (this.getAttributeType($attribute) === 'set-select') {
            return this.disableSelectOptionAttribute($attribute, behavior, outOfStockMessage);
        }

        if (behavior === 'hide_option') {
            $attribute.hide();
        } else {
            $attribute.addClass('unavailable');
        }
    }

    disableSelectOptionAttribute($attribute, behavior, outOfStockMessage) {
        const $select = $attribute.parent();

        if (behavior === 'hide_option') {
            $attribute.toggleOption(false);
            // If the attribute is the selected option in a select dropdown, select the first option (MERC-639)
            if ($select.val() === $attribute.attr('value')) {
                $select[0].selectedIndex = 0;
            }
        } else {
            $attribute.html($attribute.html().replace(outOfStockMessage, '') + outOfStockMessage);
        }
    }

    enableAttribute($attribute, behavior, outOfStockMessage) {
        if (this.getAttributeType($attribute) === 'set-select') {
            return this.enableSelectOptionAttribute($attribute, behavior, outOfStockMessage);
        }

        if (behavior === 'hide_option') {
            $attribute.show();
        } else {
            $attribute.removeClass('unavailable');
        }
    }

    enableSelectOptionAttribute($attribute, behavior, outOfStockMessage) {
        if (behavior === 'hide_option') {
            $attribute.toggleOption(true);
        } else {
            $attribute.html($attribute.html().replace(outOfStockMessage, ''));
        }
    }

    getAttributeType($attribute) {
        const $parent = $attribute.closest('[data-product-attribute]');

        return $parent ? $parent.data('productAttribute') : null;
    }

    /**
     * Allow radio buttons to get deselected
     */
    initRadioAttributes() {
        $('[data-product-attribute] input[type="radio"]', this.$scope).each((i, radio) => {
            const $radio = $(radio);

            // Only bind to click once
            if ($radio.attr('data-state') !== undefined) {
                $radio.on('click', () => {
                    if ($radio.data('state') === true) {
                        $radio.prop('checked', false);
                        $radio.data('state', false);

                        $radio.trigger('change');
                    } else {
                        $radio.data('state', true);
                    }

                    this.initRadioAttributes();
                });
            }

            $radio.attr('data-state', $radio.prop('checked'));
        });
    }

    /**
     * Check for fragment identifier in URL requesting a specific tab
     */
    getTabRequests() {
        if (window.location.hash && window.location.hash.indexOf('#tab-') === 0) {
            const $activeTab = $('.tabs').has(`[href='${window.location.hash}']`);
            const $tabContent = $(`${window.location.hash}`);

            if ($activeTab.length > 0) {
                $activeTab.find('.tab')
                    .removeClass('is-active')
                    .has(`[href='${window.location.hash}']`)
                    .addClass('is-active');

                $tabContent.addClass('is-active')
                    .siblings()
                    .removeClass('is-active');
            }
        }
    }

    /**
     * Init custom tabs by parsing product description
     * (Added by Papathemes - Supermarket)
     */
    initCustomTabs() {
        const $customTabs = $('[data-custom-tab]', this.$scope);
        if ($customTabs.length === 0) {
            return;
        }

        const $tabs = $('.productView-description > .tabs', this.$scope);
        const $tabsContent = $('.productView-description > .tabs-contents', this.$scope);

        if ($tabs.length === 0 || $tabsContent.length === 0) {
            return;
        }

        $customTabs.each((i, el) => {
            const $el = $(el);
            const $title = $el.find('[data-custom-tab-title]');
            const title = $title.html();

            let expand = $title.data('expand');

            if (!expand) {
                expand = 'View All';
            }

            let close = $title.data('close');

            if (!close) {
                close = 'Close';
            }

            $title.remove();

            const content = $el.html();

            $el.remove();

            $tabs.append(`<li class="tab tab--custom tab--custom-${i}"><a class="tab-title" href="#tab-custom-${i}">${title}</a></li>`);
            $tabsContent.append(`<div class="tab-content tab-content--custom tab-content--custom-${i}" id="tab-custom-${i}" data-emthemesmodez-mobile-collapse><h2 class="page-heading">${title}</h2><div class="productView-custom-tabContent emthemesModez-mobile-collapse-content" data-emthemesmodez-mobile-collapse-content>${content}</div><a href="#" class="emthemesModez-mobile-collapse-handle" data-emthemesmodez-mobile-collapse-handle><span class="on">${expand}</span><span class="off">${close}</span></a></div>`);
        });
    }

    // Papathemes - Supermarket
    onMiniPreviewModalOpen() {
        $('body').addClass('has-activeModal--miniPreview');
    }

    // Papathemes - Supermarket
    onMiniPreviewModalClose() {
        $('body').removeClass('has-activeModal--miniPreview');
        if (typeof this.autoCloseTimer !== 'undefined' && this.autoCloseTimer) {
            window.clearInterval(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }
    }

    // Papathemes - Supermarket
    applyModalAutoClose(modal) {
        const $autoCloseEl = modal.$modal.find('[data-auto-close]');
        if ($autoCloseEl.length > 0) {
            let sec = $autoCloseEl.data('autoClose') || 5;
            const $count = $autoCloseEl.find('.count');
            $count.html(sec);

            modal.autoCloseTimer = window.setInterval(() => { // eslint-disable-line
                if (sec > 1) {
                    sec--;
                    $count.html(sec);
                } else {
                    window.clearInterval(modal.autoCloseTimer);
                    modal.autoCloseTimer = null; // eslint-disable-line
                    modal.close();
                }
            }, 1000);
        }
    }
}
