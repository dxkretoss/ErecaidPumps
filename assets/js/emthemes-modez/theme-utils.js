/* eslint-disable camelcase */
import collapsibleFactory from '../theme/common/collapsible';

let remoteBannerCache;

export function autoExpandCategoryMenu(context) {
    if (context.enableVerticalCurrentCategory) {
        let $curMenuItem;

        if (context.pageType === 'product') {
            const url = $('.breadcrumbs .breadcrumb.is-active').prev().find('a').attr('href');
            if (url) {
                $curMenuItem = $('#emthemesModez-verticalCategories-sidebar').find(`a.navPages-action[href='${url}']`);
            }
        } else {
            $curMenuItem = $('[data-current-category]');
        }

        if ($curMenuItem && $curMenuItem.length > 0) {
            const collapsibles = [];

            if ($curMenuItem.attr('data-collapsible')) {
                collapsibles.push($curMenuItem);
            }

            $curMenuItem.parents('.navPage-childList, .navPage-subMenu').prev('[data-collapsible]').each((i, el) => {
                collapsibles.push(el);
            });

            $.each(collapsibleFactory(collapsibles), (i, o) => {
                o.open();
            });

            // scrollToElement('[data-current-category]', { align: 'middle' });
        }
    }
}

export function bindNavPagesCheckRightEdge(mediaQuery) {
    $('.navPages').on('mouseenter', '.navPages-item', event => {
        if (!mediaQuery || !mediaQuery.matches) {
            return;
        }

        const $hoverEl = $(event.currentTarget);

        $hoverEl.children('.navPage-subMenu').each((i, submenu) => {
            const $submenu = $(submenu);

            if ($submenu.offset().left + $submenu.width() > $(window).width()) {
                $submenu
                    .addClass('toLeft')
                    .css('left', `${$hoverEl.position().left + $hoverEl.width() - $submenu.width()}px`);
            }
        });
    });

    $('.navPages').on('mouseleave', '.navPages-item', event => {
        if (!mediaQuery || !mediaQuery.matches) {
            return;
        }

        const $hoverEl = $(event.currentTarget);

        $hoverEl.children('.navPage-subMenu').each((i, submenu) => {
            const $submenu = $(submenu);

            $submenu
                .removeClass('toLeft')
                .css('left', '');
        });
    });

    $('.navPages').on('mouseenter', '.navPage-subMenu-item, .navPage-childList-item', event => {
        if (!mediaQuery || !mediaQuery.matches) {
            return;
        }

        const $hoverEl = $(event.currentTarget);

        $hoverEl.children('.navPage-childList').each((i, submenu) => {
            const $submenu = $(submenu);
            const isParentToLeft = $submenu.parent().closest('.navPage-childList, .navPage-subMenu').hasClass('toLeft');
            if (isParentToLeft || $submenu.offset().left + $submenu.width() > $(window).width()) {
                $submenu.addClass('toLeft');
            }
        });
    });

    $('.navPages').on('mouseleave', '.navPage-subMenu-item, .navPage-childList-item', event => {
        if (!mediaQuery || !mediaQuery.matches) {
            return;
        }

        const $hoverEl = $(event.currentTarget);

        $hoverEl.children('.navPage-childList').each((i, submenu) => {
            const $submenu = $(submenu);

            $submenu.removeClass('toLeft');
        });
    });
}

export function checkTouchDevice() {
    const prefixes = ' -webkit- -moz- -o- -ms- '.split(' ');
    const mq = (query) => window.matchMedia(query).matches;

    if (('ontouchstart' in window) || window.DocumentTouch && document instanceof window.DocumentTouch) {
        return true;
    }

    // include the 'heartz' as a way to have a non matching MQ to help terminate the join
    // https://git.io/vznFH
    const query = ['(', prefixes.join('touch-enabled),('), 'heartz', ')'].join('');
    return mq(query);
}

/**
 * A failing BigCommerce endpoint can answer with a multi-KB html error page. Logging it whole
 * floods the console of every shopper who hits a network blip, so keep only the useful head.
 * @param {Object} [xhr] The jqXHR of the failed request
 * @param {Number} [limit]
 * @returns {String}
 */
export function truncateResponseText(xhr, limit = 500) {
    const body = xhr && xhr.responseText;

    if (!body) {
        return '';
    }

    const text = String(body);
    return text.length > limit ? `${text.slice(0, limit)}… (${text.length} chars)` : text;
}

const FEATURED_PROMOTIONS_UNSUPPORTED_KEY = 'papathemes-supermarket:featuredPromotions-unsupported';

/**
 * The rollout-gated slice of the product-cards query. BigCommerce is enabling
 * `featuredPromotions` store by store; a store that hasn't been reached rejects the WHOLE
 * query with `Cannot query field "featuredPromotions"`, so the widget loses every product,
 * not just the callout. Callers send it optimistically, then retry without it.
 */
export const FEATURED_PROMOTIONS_FIELD = `
                                featuredPromotions(first: 5) {
                                    edges {
                                        node {
                                            entityId
                                            text
                                            priority
                                        }
                                    }
                                }`;

/**
 * @returns {Boolean} true once this store has been seen rejecting `featuredPromotions`
 */
export function isFeaturedPromotionsUnsupported() {
    try {
        return window.sessionStorage.getItem(FEATURED_PROMOTIONS_UNSUPPORTED_KEY) === '1';
    } catch (err) {
        // Safari in private mode throws on sessionStorage — pay the one failed query per page
        return false;
    }
}

/**
 * Remember the rejection for the rest of the session so only the first query of the session
 * pays for the doomed attempt.
 */
export function markFeaturedPromotionsUnsupported() {
    try {
        window.sessionStorage.setItem(FEATURED_PROMOTIONS_UNSUPPORTED_KEY, '1');
    } catch (err) {
        // nothing to do — the retry below still keeps the widget populated
    }
}

/**
 * @param {Object} [resp] Parsed GraphQL response body
 * @returns {Boolean} true when the query was rejected because of `featuredPromotions`
 */
export function isFeaturedPromotionsFieldError(resp) {
    return Array.isArray(resp?.errors)
        && resp.errors.some(err => String(err?.message).indexOf('featuredPromotions') > -1);
}

/**
 * POST a product-cards GraphQL query, retrying once without `featuredPromotions` when the
 * store hasn't been rolled out yet.
 *
 * Resolves on every path and never rejects — the callers turn the body into cards themselves
 * and each has its own "no data" fallback. A transport failure is logged here and surfaces as
 * `resp: null`, so callers must not log it a second time.
 *
 * @param {Object} options
 * @param {String} options.graphQLToken
 * @param {Function} options.buildQuery Called with the promotions field (or ''), returns the query
 * @param {Object} options.variables
 * @param {String} options.label Caller name, used in console messages
 * @param {*} [options.detail] Extra identifier (category id, tab type…) added to those messages
 * @returns {Promise<{resp: Object|null, xhr: Object|null}>}
 */
export function postProductCardsQuery({
    graphQLToken, buildQuery, variables, label, detail,
}) {
    const detailArgs = detail === undefined ? [] : [detail];

    const send = promotionsField => new Promise(resolve => {
        $.ajax({
            url: '/graphql',
            method: 'POST',
            data: JSON.stringify({
                query: buildQuery(promotionsField),
                variables,
            }),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${graphQLToken}`,
            },
            xhrFields: {
                withCredentials: true,
            },
            success: (resp, textStatus, xhr) => resolve({ resp, xhr }),
            error: xhr => {
                console.error(`[papathemes-supermarket] ${label} GraphQL request failed`, ...detailArgs, xhr && xhr.status, truncateResponseText(xhr)); // eslint-disable-line no-console
                resolve({ resp: null, xhr });
            },
        });
    });

    const askedForPromotions = !isFeaturedPromotionsUnsupported();

    return send(askedForPromotions ? FEATURED_PROMOTIONS_FIELD : '')
        .then(result => {
            if (askedForPromotions && isFeaturedPromotionsFieldError(result.resp)) {
                markFeaturedPromotionsUnsupported();
                console.warn(`[papathemes-supermarket] ${label} GraphQL rejected featuredPromotions — retrying without promotion callouts`, ...detailArgs); // eslint-disable-line no-console
                return send('');
            }
            return result;
        })
        .catch(err => {
            console.error(`[papathemes-supermarket] ${label} GraphQL request could not be sent`, ...detailArgs, err); // eslint-disable-line no-console
            return { resp: null, xhr: null };
        });
}

/**
 * Flatten and re-sort the `featuredPromotions` connection.
 *
 * GraphQL makes no promise about edge order while the Stencil context arrives pre-sorted by
 * priority. Without this sort the same product can advertise two different offers in two
 * places on the same page.
 *
 * @param {Object} [featuredPromotions] The GraphQL connection
 * @returns {Object[]} `{ entityId, text, priority }`, highest priority first
 */
export function mapFeaturedPromotions(featuredPromotions) {
    const edges = featuredPromotions?.edges;

    if (!Array.isArray(edges)) {
        return [];
    }

    return edges
        .map(edge => edge?.node)
        .filter(node => node && node.text)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .map(({ entityId, text, priority }) => ({ entityId, text, priority }));
}

/**
 * Ajax load remote banner
 * - Banner must has position 'top'
 * - Banner must assign to Search page
 */
export function loadRemoteBanners(context, $scope) {
    if ($('[data-emthemesmodez-remote-banner]', $scope).length > 0) {
        const update = (resp) => {
            const $regions = $('[data-emthemesmodez-remote-banner]', $scope);
            const $resp = $(resp);
            if ($resp.length > 0) {
                $regions.each((i, region) => {
                    const $region = $(region);
                    const regionName = $(region).data('emthemesmodezRemoteBanner');

                    if (regionName) {
                        $region.after($resp.find(`[id='${regionName}'], .${regionName}`).clone());
                    }
                });
            }
            $regions.remove();
        };

        if (remoteBannerCache) {
            update(remoteBannerCache.content);
        } else if (context.graphQLToken) {
            $.ajax({
                url: '/graphql',
                method: 'POST',
                data: JSON.stringify({
                    query: `
                        query {
                            site {
                                content {
                                    banners {
                                        searchPage(first: 20) {
                                            edges {
                                                node {
                                                    entityId
                                                    name
                                                    content
                                                    location
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    `,
                }),
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${context.graphQLToken}`,
                },
                xhrFields: {
                    withCredentials: true,
                },
                success: (resp) => {
                    const $div = $('<div id="document"></div>');

                    resp.data.site.content.banners.searchPage.edges
                        .filter(edge => edge.node.location === 'TOP')
                        .forEach(edge => {
                            $div.append(edge.node.content);
                        });

                    remoteBannerCache = { content: $div[0].outerHTML };
                    update(remoteBannerCache.content);
                },
            });
        }
    }
}

function _formatMoney(_amount, _decimalCount = 2, decimal = '.', thousands = ',') {
    try {
        let decimalCount = Math.abs(_decimalCount);
        decimalCount = Number.isNaN(decimalCount) ? 2 : decimalCount;

        const negativeSign = _amount < 0 ? '-' : '';
        const amount = Math.abs(Number(_amount) || 0).toFixed(decimalCount);

        const i = parseInt(amount, 10).toString();
        const j = (i.length > 3) ? i.length % 3 : 0;

        return negativeSign + (j ? i.substr(0, j) + thousands : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, `$1${thousands}`) + (decimalCount ? decimal + Math.abs(amount - i).toFixed(decimalCount).slice(2) : '');
    } catch (e) {
        return null;
    }
}

export function currencyFormat(value, {
    currency_token = '$',
    currency_location = 'left',
    decimal_token = '.',
    decimal_places = 2,
    thousands_token = ',',
} = {}) {
    const _value = _formatMoney(value, decimal_places, decimal_token, thousands_token);
    return currency_location.toLowerCase() === 'left' ? `${currency_token}${_value}` : `${_value}${currency_token}`;
}

export function extractMoney(price, defaultMoney = {
    currency_token: '$',
    currency_location: 'left',
    decimal_token: '.',
    decimal_places: 2,
    thousands_token: ',',
}) {
    const money = { ...defaultMoney };

    if (!price && price !== 0) {
        return money;
    }

    const m = String(price).trim().match(/^([^0-9]*)([0-9.,]*)([^0-9]*)$/);
    const leftSymbol = String(m[1]).trim();
    const value = String(m[2]);
    const rightSymbol = String(m[3]).trim();
    const commaPosition = value.indexOf(',');
    const commaCount = (value.match(/,/g) || []).length;
    const dotPosition = value.indexOf('.');
    const dotCount = (value.match(/\./g) || []).length;

    if (leftSymbol) {
        money.currency_token = leftSymbol;
        money.currency_location = 'left';
    } else if (rightSymbol) {
        money.currency_token = rightSymbol;
        money.currency_location = 'right';
    }

    if (commaCount.length >= 2) {
        money.thousands_token = ',';
        money.decimal_token = '.';
        money.decimal_places = dotPosition > -1 ? value.length - dotPosition - 1 : 0;
    } else if (dotCount.length >= 2) {
        money.thousands_token = '.';
        money.decimal_token = ',';
        money.decimal_places = commaPosition > -1 ? value.length - commaPosition - 1 : 0;
    } else if (commaPosition > dotPosition && dotPosition > -1) {
        money.thousands_token = '.';
        money.decimal_token = ',';
        money.decimal_places = value.length - commaPosition - 1;
    } else if (dotPosition > commaPosition && commaPosition > -1) {
        money.thousands_token = ',';
        money.decimal_token = '.';
        money.decimal_places = value.length - dotPosition - 1;
    } else if (commaPosition > -1) {
        if ((value.length - commaPosition - 1) % 3 === 0) {
            money.thousands_token = ',';
            money.decimal_token = '.';
            money.decimal_places = 0;
        } else {
            money.thousands_token = '.';
            money.decimal_token = ',';
            money.decimal_places = value.length - commaPosition - 1;
        }
    } else if (dotPosition > -1) {
        if ((value.length - dotPosition - 1) % 3 === 0) {
            money.thousands_token = '.';
            money.decimal_token = ',';
            money.decimal_places = 0;
        } else {
            money.thousands_token = ',';
            money.decimal_token = '.';
            money.decimal_places = value.length - dotPosition - 1;
        }
    } else if (commaPosition === -1 && dotPosition === -1) {
        money.decimal_places = 0;
    }

    return money;
}

export class ProductCardsGraphQLQuery {
    constructor({
        graphQLToken = '',
        currencyCode = 'USD',
        restrictToLogin = false,
        showProductRating = false,
        defaultProductImage = '',

        // theme settings & store settings
        card_show_border = false,
        card_show_button = false,
        card_show_sku = false,
        card_show_brand = false,
        card_show_hover_image = false,
        card_custom_fields = '',
        show_product_quick_view = false,
        show_product_quantity_box = false,
        card_show_swatches = true,
        ajax_add_to_cart = false,
        product_outstock_badge = true,
        product_sale_badges = 'label',
        product_sale_label = 'Sale',
        product_custom_badges = '',
        show_featured_promotions = false,
        show_rrp = false,
        pdp_retail_price_label = '',
        price_ranges = false,
        pdp_price_label = '',
        pdp_sale_price_label = '',
        pdp_non_sale_price_label = '',
        // ---

        txtPriceWithoutTax = '',
        txtPriceWithTax = '',
        txtLoginForPricing = 'Log in for pricing',
        txtQuickView = 'Quick View',
        txtCompare = 'Compare',
        txtAddToCompare = 'Add to Compare',
        txtChooseOptions = 'Choose Options',
        txtPreOrder = 'Pre-Order',
        txtAddToCart = 'Add to Cart',
        txtQuantity = 'Quantity',
        txtQuantityDecrease = 'Decrease Quantity of {name}',
        txtQuantityIncrease = 'Increase Quantity of {name}',
        txtMoreOfferOne = 'more offer',
        txtMoreOffersOther = 'more offers',
        ratingStarHtmlFunc = (isFull = true) => `
            <span class="icon icon--rating${isFull ? 'Full' : 'Empty'}">
                <svg><use xlink:href="#icon-star" /></svg>
            </span>
        `,
        qtyBoxHtmlFunc = (id, min, max, qtyLabel, decLabel, incLabel) => `
            <div class="form-field form-field--increments">
                <div class="form-increment" data-card-quantity-change>
                    <button class="button button--icon" data-action="dec">
                        <span class="is-srOnly">${decLabel}</span>
                        <i class="icon" aria-hidden="true">
                            <svg>
                                <use xlink:href="#icon-minus"/>
                            </svg>
                        </i>
                    </button>
                    <input class="form-input form-input--incrementTotal"
                        name="qty_${id}"
                        type="tel"
                        value="${min || 1}"
                        data-quantity-min="${min}"
                        data-quantity-max="${max}"
                        min="1"
                        pattern="[0-9]*"
                        aria-label="${qtyLabel}"
                        aria-live="polite">
                    <button class="button button--icon" data-action="inc">
                        <span class="is-srOnly">${incLabel}</span>
                        <i class="icon" aria-hidden="true">
                            <svg>
                                <use xlink:href="#icon-add"/>
                            </svg>
                        </i>
                    </button>
                </div>
            </div>
        `,
    } = {}) {
        this.graphQLToken = graphQLToken;
        this.currencyCode = currencyCode;
        this.restrictToLogin = restrictToLogin;
        this.showProductRating = showProductRating;
        this.card_show_border = card_show_border;
        this.card_show_button = card_show_button;
        this.card_show_sku = card_show_sku;
        this.card_show_brand = card_show_brand;
        this.card_show_hover_image = card_show_hover_image;
        this.card_custom_fields = card_custom_fields;
        this.show_product_quick_view = show_product_quick_view;
        this.show_product_quantity_box = show_product_quantity_box;
        this.card_show_swatches = card_show_swatches;
        this.show_rrp = show_rrp;
        this.price_ranges = price_ranges;
        this.pdp_retail_price_label = pdp_retail_price_label;
        this.pdp_price_label = pdp_price_label;
        this.ajax_add_to_cart = ajax_add_to_cart;
        this.product_outstock_badge = product_outstock_badge;
        this.product_sale_badges = product_sale_badges;
        this.product_sale_label = product_sale_label;
        this.pdp_sale_price_label = pdp_sale_price_label;
        this.pdp_non_sale_price_label = pdp_non_sale_price_label;
        this.product_custom_badges = product_custom_badges;
        this.show_featured_promotions = show_featured_promotions;
        this.defaultProductImage = defaultProductImage;
        this.txtPriceWithoutTax = txtPriceWithoutTax;
        this.txtPriceWithTax = txtPriceWithTax;
        this.txtLoginForPricing = txtLoginForPricing;
        this.txtQuickView = txtQuickView;
        this.txtCompare = txtCompare;
        this.txtAddToCompare = txtAddToCompare;
        this.txtChooseOptions = txtChooseOptions;
        this.txtPreOrder = txtPreOrder;
        this.txtAddToCart = txtAddToCart;
        this.txtQuantity = txtQuantity;
        this.txtQuantityDecrease = txtQuantityDecrease;
        this.txtQuantityIncrease = txtQuantityIncrease;
        this.txtMoreOfferOne = txtMoreOfferOne;
        this.txtMoreOffersOther = txtMoreOffersOther;
        this.ratingStarHtmlFunc = ratingStarHtmlFunc;
        this.qtyBoxHtmlFunc = qtyBoxHtmlFunc;
        this.cachedProducts = {};
    }

    formatPrice(prices, currency, tax, show_rrp, retail_price_label, pdp_price_label, pdp_non_sale_price_label, pdp_sale_price_label, price_ranges) {
        if (tax === 'BOTH') {
            return prices.priceWithTax.priceRange.min.value !== prices.priceWithTax.priceRange.max.value && price_ranges ?
                `<div class="price-section">
                    ${pdp_price_label && `<span class="price-label">${pdp_price_label}</span>`}
                    <span class="price price--withTax price--main">${currencyFormat(prices.priceWithTax.priceRange.min.value, currency)}  - ${currencyFormat(prices.priceWithTax.priceRange.max.value, currency)}</span>
                    <abbr class="_title-labelTax" title="${prices.labePriceWithTax}">${prices.labePriceWithTax}</abbr>
                </div>
                <div class="_br"></div>
                <div class="price-section">
                    ${pdp_price_label && `<span class="price-label">${pdp_price_label}</span>`}
                    <span class="price price--withoutTax price--main">${currencyFormat(prices.priceWithoutTax.priceRange.min.value, currency)}  - ${currencyFormat(prices.priceWithoutTax.priceRange.max.value, currency)}</span>
                    <abbr class="_title-labelTax" title="${prices.labelPriceWithoutTax}">${prices.labelPriceWithoutTax}</abbr>
                </div>
                ` : `
                ${show_rrp && prices.priceWithTax.retailPrice && prices.priceWithTax.retailPrice.value && prices.priceWithTax.retailPrice.value !== prices.priceWithTax.basePrice.value ? `<div class="price-section price-section--withTax rrp-price--withTax">
                    <span class="price-was-label">${retail_price_label}</span>
                    <span data-product-rrp-with-tax class="price price--rrp">${currencyFormat(prices.priceWithTax.retailPrice.value, currency)}</span>
                </div>` : ''}
                    ${prices.priceWithTax.basePrice.value && prices.priceWithTax.basePrice.value !== prices.priceWithTax.price.value ? `
                        <div class="price-section non-sale-price">
                            ${pdp_non_sale_price_label && `<span class="price-was-label">${pdp_non_sale_price_label}</span>`}
                            <span class="price price--non-sale">
                                ${currencyFormat(prices.priceWithTax.basePrice.value, currency)}
                            </span>
                        </div>
                        <div class="price-section">
                            ${pdp_sale_price_label && `<span class="price-label">${pdp_sale_price_label}</span>`}
                            <span class="price price--main">${currencyFormat(prices.priceWithTax.price.value, currency)}</span>
                            <abbr class="_title-labelTax" title="${prices.labePriceWithTax}">${prices.labePriceWithTax}</abbr>
                        </div>
                    ` : `<div class="price-section">
                            ${pdp_price_label && `<span class="price-label">${pdp_price_label}</span>`}
                            <span class="price price--main">${currencyFormat(prices.priceWithTax.price.value, currency)}</span>
                            <abbr class="_title-labelTax" title="${prices.labePriceWithTax}">${prices.labePriceWithTax}</abbr>
                        </div>`}
                    <div class="_br"></div>
                    ${show_rrp && prices.priceWithoutTax.retailPrice && prices.priceWithoutTax.retailPrice.value && prices.priceWithoutTax.retailPrice.value !== prices.priceWithoutTax.basePrice.value ? `<div class="price-section price-section--withTax rrp-price--withTax">
                        <span class="price-was-label">${retail_price_label}</span>
                        <span data-product-rrp-with-tax class="price price--rrp">${currencyFormat(prices.priceWithoutTax.retailPrice.value, currency)}</span>
                    </div>` : ''}
                    ${prices.priceWithoutTax.basePrice.value && prices.priceWithoutTax.basePrice.value !== prices.priceWithoutTax.price.value ? `
                        <div class="price-section non-sale-price">
                            ${pdp_non_sale_price_label && `<span class="price-was-label">${pdp_non_sale_price_label}</span>`}
                            <span class="price price--non-sale">
                                ${currencyFormat(prices.priceWithoutTax.basePrice.value, currency)}
                            </span>
                        </div>
                        <div class="price-section">
                            ${pdp_sale_price_label && `<span class="price-label">${pdp_sale_price_label}</span>`}
                            <span class="price price--main">${currencyFormat(prices.priceWithoutTax.price.value, currency)}</span>
                            <abbr class="_title-labelTax" title="${prices.labelPriceWithoutTax}">${prices.labelPriceWithoutTax}</abbr>
                        </div>
                    ` : `<div class="price-section">
                            ${pdp_price_label && `<span class="price-label">${pdp_price_label}</span>`}
                            <span class="price price--main">${currencyFormat(prices.priceWithoutTax.price.value, currency)}</span>
                            <abbr class="_title-labelTax" title="${prices.labelPriceWithoutTax}">${prices.labelPriceWithoutTax}</abbr>
                        </div>`}
                `;
        }
        return prices.priceRange.min.value !== prices.priceRange.max.value && price_ranges ? `
            <div class="price-section">
                ${pdp_price_label && `<span class="price-label">${pdp_price_label}</span>`}
                <span class="price price--main">${currencyFormat(prices.priceRange.min.value, currency)}  - ${currencyFormat(prices.priceRange.max.value, currency)}</span>
            </div>
        ` : `
            ${show_rrp && prices.retailPrice && prices.retailPrice.value && prices.retailPrice.value !== prices.basePrice.value ? `<div class="price-section price-section--withTax rrp-price--withTax">
                ${retail_price_label && `<span class="price-was-label">${retail_price_label}</span>`}
                <span data-product-rrp-with-tax class="price price--rrp">${currencyFormat(prices.retailPrice.value, currency)}</span>
            </div>` : ''}
            ${prices.basePrice.value && prices.basePrice.value !== prices.price.value ? `
                <div class="price-section non-sale-price">
                    ${pdp_non_sale_price_label && `<span class="price-was-label">${pdp_non_sale_price_label}</span>`}
                    <span class="price price--non-sale">
                        ${currencyFormat(prices.basePrice.value, currency)}
                    </span>
                </div>
                <div class="price-section">
                    ${pdp_sale_price_label && `<span class="price-label">${pdp_sale_price_label}</span>`}
                    <span class="price price--main">${currencyFormat(prices.price.value, currency)}</span>
                </div>
            ` : `<div class="price-section">
                    ${pdp_price_label && `<span class="price-label">${pdp_price_label}</span>`}
                    <span class="price price--main">${currencyFormat(prices.price.value, currency)}</span>
                </div>`}
        `;
    }

    templateCustomFields(arrayCustomFields, card_custom_fields) {
        if (arrayCustomFields.length > 0 && card_custom_fields !== undefined && card_custom_fields !== '' && card_custom_fields !== '*') {
            const arrayCardCustomFields = card_custom_fields.split('|');
            let templateCustomFields = '';
            const arrayFields = arrayCustomFields.map(item => {
                let itemTemplate = '';
                for (let i = 0; i < arrayCardCustomFields.length; i++) {
                    if (item.node.name === arrayCardCustomFields[i]) {
                        itemTemplate = `<div>
                            <span class="card-info-name card-info-name--${(item.node.name).toLowerCase().replace(/\s+/g, '-')}">${item.node.name}:</span>
                            <span class="card-info-value card-info-value--${(item.node.name).toLowerCase().replace(/\s+/g, '-')}">${item.node.value}</span>
                        </div>`;
                    }
                }
                return itemTemplate;
            });
            arrayFields.forEach(itemArray => {
                if (itemArray !== undefined) {
                    templateCustomFields += itemArray;
                }
            });
            return templateCustomFields;
        } else if (card_custom_fields === '*' && arrayCustomFields.length > 0) {
            let templateCustomFields = '';
            const arrayFields = arrayCustomFields.filter(itemFilter => !(itemFilter.node.name).startsWith('__')).map(item => `<div>
                    <span class="card-info-name card-info-name--${(item.node.name).toLowerCase().replace(/\s+/g, '-')}">${item.node.name}:</span>
                    <span class="card-info-value card-info-value--${(item.node.name).toLowerCase().replace(/\s+/g, '-')}">${item.node.value}</span>
                </div>`);
            arrayFields.forEach(itemArray => {
                templateCustomFields += itemArray;
            });
            return templateCustomFields;
        }
    }

    /**
     * Fetch and map product cards for up to 50 product ids, memoised per currency + id list.
     *
     * Resolves on every path and never rejects — the other GraphQL fetches in this directory keep
     * the same contract. Three traps break it: jQuery never wraps `success:`, so a throw in there
     * leaves the promise unsettled forever; a query-layer failure arrives as HTTP 200 with
     * `errors` and no `data`; a partial failure keeps `data.site` but nulls the failed field.
     * `$.ajax` itself can throw synchronously. `postProductCardsQuery` owns all four, plus the
     * retry for stores that haven't been given `featuredPromotions` yet.
     *
     * @param {Number[]} _productIds
     * @returns {Promise<Object[]|String>} Mapped cards, or '' when the fetch or mapping failed
     */
    async load(_productIds) {
        const productIds = _productIds.slice(0, 50);
        const cacheKey = `${this.currencyCode}_${productIds.join(',')}`;

        if (!this.cachedProducts[cacheKey]) {
            const request = postProductCardsQuery({
                graphQLToken: this.graphQLToken,
                label: 'product-cards',
                variables: {
                    productIds,
                    first: productIds.length,
                    currencyCode: this.currencyCode,
                },
                buildQuery: featuredPromotionsField => `
                            query recentlyViewedProducts(
                                $productIds: [Int!]
                                $first: Int
                                $currencyCode: currencyCode!
                            ) {
                                site {
                                    products(entityIds: $productIds, first: $first) {
                                        edges {
                                            node {
                                                entityId
                                                name
                                                sku
                                                path
                                                addToCartUrl
                                                minPurchaseQuantity
                                                maxPurchaseQuantity
                                                pricesWithTax: prices(includeTax: true, currencyCode: $currencyCode) {
                                                    price {
                                                        ...MoneyFields
                                                    }
                                                    basePrice {
                                                        ...MoneyFields
                                                    }
                                                    salePrice {
                                                        ...MoneyFields
                                                    }
                                                    retailPrice {
                                                        ...MoneyFields
                                                    }
                                                    priceRange {
                                                        min {
                                                            ...MoneyFields
                                                        }
                                                        max {
                                                            ...MoneyFields
                                                        }
                                                    }
                                                }
                                                pricesWithoutTax: prices(includeTax: false, currencyCode: $currencyCode) {
                                                    price {
                                                        ...MoneyFields
                                                    }
                                                    basePrice {
                                                        ...MoneyFields
                                                    }
                                                    salePrice {
                                                        ...MoneyFields
                                                    }
                                                    retailPrice {
                                                        ...MoneyFields
                                                    }
                                                    priceRange {
                                                        min {
                                                            ...MoneyFields
                                                        }
                                                        max {
                                                            ...MoneyFields
                                                        }
                                                    }
                                                }
                                                defaultImage {
                                                    ...ImageFields
                                                }
                                                images {
                                                    edges {
                                                      node {
                                                        ...ImageFields
                                                        isDefault
                                                      }
                                                    }
                                                }
                                                brand {
                                                    name
                                                    path
                                                }
                                                reviewSummary {
                                                    averageRating
                                                }
                                                productOptions(first: 1) {
                                                    edges {
                                                        node {
                                                            entityId
                                                        }
                                                    }
                                                }
                                                availabilityV2 {
                                                    status
                                                }
                                                inventory {
                                                    isInStock
                                                }
                                                customFields {
                                                    edges {
                                                        node {
                                                            name
                                                            value
                                                        }
                                                    }
                                                }${featuredPromotionsField}
                                            }
                                        }
                                    }
                                    settings {
                                        tax {
                                            plp
                                        }
                                        inventory {
                                            defaultOutOfStockMessage
                                        }
                                        storefront {
                                            catalog {
                                                productComparisonsEnabled
                                            }
                                        }
                                    }
                                    currency(currencyCode: $currencyCode) {
                                        display {
                                            symbol
                                            symbolPlacement
                                            decimalToken
                                            thousandsToken
                                            decimalPlaces
                                        }
                                    }
                                }
                            }
                            fragment MoneyFields on Money {
                                value
                                currencyCode
                            }
                            fragment ImageFields on Image {
                                url80wide: url(width: 80)
                                url160wide: url(width: 160)
                                url320wide: url(width: 320)
                                url640wide: url(width: 640)
                            }
                        `,
            }).then(({ resp, xhr }) => {
                try {
                    if (!resp) {
                        return ''; // postProductCardsQuery already logged the transport failure
                    }
                    if (!resp.data?.site) {
                        console.error('[papathemes-supermarket] product-cards GraphQL returned no data', truncateResponseText(xhr)); // eslint-disable-line no-console
                        return '';
                    }
                    return this.mapGraphQLProducts(resp.data.site.products, resp.data.site.settings, resp.data.site.currency);
                } catch (err) {
                    console.error('[papathemes-supermarket] product-cards GraphQL response could not be mapped', err); // eslint-disable-line no-console
                    return '';
                }
            });

            try {
                this.cachedProducts[cacheKey] = await request;
            } catch (err) {
                console.error('[papathemes-supermarket] product-cards GraphQL request could not be sent', err); // eslint-disable-line no-console
                this.cachedProducts[cacheKey] = '';
            }
        }

        return this.cachedProducts[cacheKey];
    }

    mapGraphQLProducts(siteProducts, siteSettings, siteCurrency) {
        const currency = {
            currency_token: siteCurrency.display.symbol,
            currency_location: String(siteCurrency.display.symbolPlacement).toLowerCase(),
            decimal_token: siteCurrency.display.decimalToken,
            decimal_places: siteCurrency.display.decimalPlaces,
            thousands_token: siteCurrency.display.thousandsToken,
        };

        const ratingHtml = (rating) => (!rating ? '' : Array.from(Array(5).keys())
            .map(i => this.ratingStarHtmlFunc(rating > i))
            .join(''));

        const saleBadge = prices => {
            // return '' if no sale price
            if (!prices?.salePrice || prices.salePrice.value === prices.basePrice.value) return '';

            // return '' if settings 'hide'
            if (this.product_sale_badges === 'hide') return '';

            // return 'sale' badge
            if (this.product_sale_badges !== 'percent' && !String(this.product_sale_badges).includes('{percent}')) return this.product_sale_label;

            const n = prices.salePrice ? Math.round((prices.basePrice.value - prices.salePrice.value) / prices.basePrice.value * 100) : 0;
            const percent = n > 0 ? `${n}%` : '';

            // return 'sale {percent}' badge
            if (this.product_sale_label.includes('{percent}')) return this.product_sale_label.replace('{percent}', percent);

            // recent 'sale ...%' badge
            return `${this.product_sale_label}<span>${percent}</span>`;
        };

        const hoverProductImage = images => {
            try {
                const image = images.find(img => !img.node.isDefault);
                return image ? image.node : null;
            } catch (er) {
                return null;
            }
        };

        const products = siteProducts.edges
            .map(({ node }, index) => {
                const featuredPromotions = this.show_featured_promotions ? mapFeaturedPromotions(node.featuredPromotions) : [];
                const morePromotionsCount = Math.max(featuredPromotions.length - 1, 0);

                return {
                    index,
                    id: node.entityId,
                    name: node.name,
                    sku: node.sku,
                    url: node.path,
                    defaultImage: node.defaultImage,
                    hoverImage: this.card_show_hover_image ? hoverProductImage(node.images.edges) : null,
                    defaultProductImage: this.defaultProductImage,
                    restrictToLogin: this.restrictToLogin,
                    txtPriceWithoutTax: this.txtPriceWithoutTax,
                    txtPriceWithTax: this.txtPriceWithTax,
                    txtLoginForPricing: this.txtLoginForPricing,
                    retailPrice: !this.restrictToLogin && node.pricesWithoutTax && node.pricesWithTax ? {
                    // eslint-disable-next-line no-nested-ternary
                        value: siteSettings.tax.plp === 'EX' ? node.pricesWithoutTax.retailPrice : siteSettings.tax.plp === 'INC' ? node.pricesWithTax.retailPrice : siteSettings.tax.plp === 'BOTH' ? {
                            retailPriceWithoutTax: node.pricesWithoutTax.retailPrice,
                            retailPriceWithTax: node.pricesWithTax.retailPrice,
                        } : null,
                    } : null,
                    price: !this.restrictToLogin && node.pricesWithoutTax && node.pricesWithTax ? {
                    // eslint-disable-next-line no-nested-ternary
                        value: siteSettings.tax.plp === 'EX' ? {
                            price: node.pricesWithoutTax.price.value,
                            price_rrp: node.pricesWithoutTax.retailPrice,
                            // eslint-disable-next-line no-nested-ternary
                        } : siteSettings.tax.plp === 'INC' ? {
                            price: node.pricesWithTax.price.value,
                            price_rrp: node.pricesWithTax.retailPrice,
                        } : siteSettings.tax.plp === 'BOTH' ? {
                            priceWithoutTax: node.pricesWithoutTax.price.value,
                            priceWithTax: node.pricesWithTax.price.value,
                            price_rrpWithTax: node.pricesWithTax.retailPrice,
                            price_rrpWithoutTax: node.pricesWithoutTax.retailPrice,
                        } : null,
                        // eslint-disable-next-line no-nested-ternary
                        formatted: this.formatPrice(siteSettings.tax.plp === 'EX' ? node.pricesWithoutTax : siteSettings.tax.plp === 'INC' ? node.pricesWithTax : siteSettings.tax.plp === 'BOTH' ? {
                            priceWithoutTax: node.pricesWithoutTax,
                            priceWithTax: node.pricesWithTax,
                            labelPriceWithoutTax: this.txtPriceWithoutTax,
                            labePriceWithTax: this.txtPriceWithTax,
                        } : node.pricesWithoutTax, currency, siteSettings.tax.plp, this.show_rrp, this.pdp_retail_price_label, this.pdp_price_label, this.pdp_non_sale_price_label, this.pdp_sale_price_label, this.price_ranges),
                    } : null,
                    saleBadge: saleBadge(siteSettings.tax.plp === 'EX' ? node.pricesWithoutTax : node.pricesWithTax),
                    customBadges: this.product_custom_badges
                        ? node.customFields.edges.filter(item => item.node.name === '__badge').map(item => item.node.value)
                        : null,
                    brand: node.brand,
                    customFields: this.templateCustomFields(node.customFields.edges, this.card_custom_fields),
                    ratingHtml: this.showProductRating ? ratingHtml(node.reviewSummary?.averageRating) : '',
                    cardExtraClass: `${this.card_show_border ? '_border' : ''} ${!this.card_show_button ? '_hideBtn' : ''}`,
                    card_show_button: this.card_show_button,
                    card_show_sku: this.card_show_sku,
                    card_show_brand: this.card_show_brand,
                    show_product_quick_view: this.show_product_quick_view,
                    card_show_swatches: this.card_show_swatches,
                    ajax_add_to_cart: this.ajax_add_to_cart,
                    product_outstock_badge: this.product_outstock_badge && !this.restrictToLogin,
                    product_sale_badges: this.product_sale_badges,
                    product_sale_badges_sash: this.product_sale_badges === 'sash',
                    product_sale_badges_topright: this.product_sale_badges === 'topright',
                    product_sale_badges_burst: this.product_sale_badges === 'burst',
                    product_sale_label: this.product_sale_label,
                    txtQuickView: this.txtQuickView,
                    txtCompare: this.txtCompare,
                    txtAddToCompare: this.txtAddToCompare,
                    txtChooseOptions: this.txtChooseOptions,
                    txtPreOrder: this.txtPreOrder,
                    txtAddToCart: this.txtAddToCart,
                    txtQuantity: this.txtQuantity,
                    txtQuantityDecrease: this.txtQuantityDecrease.replace('{name}', node.name),
                    txtQuantityIncrease: this.txtQuantityIncrease.replace('{name}', node.name),
                    preOrder: node.availabilityV2.status === 'Preorder',
                    hasOptions: node.availabilityV2.status === 'Available' && node.productOptions.edges.length > 0 && node.inventory.isInStock,
                    addToCartUrl: node.availabilityV2.status === 'Available' && node.productOptions.edges.length === 0 && node.inventory.isInStock ? node.addToCartUrl : '',
                    outOfStockMessage: !node.inventory.isInStock ? siteSettings.inventory.defaultOutOfStockMessage : '',
                    qtyBoxHtml: this.show_product_quantity_box ? this.qtyBoxHtmlFunc(node.entityId, node.minPurchaseQuantity, node.maxPurchaseQuantity, this.txtQuantity, this.txtQuantityDecrease, this.txtQuantityIncrease) : '',
                    show_compare: siteSettings.storefront.catalog.productComparisonsEnabled,
                    show_featured_promotions: this.show_featured_promotions,
                    featuredPromotions,
                    featuredPromotion: featuredPromotions[0] || null,
                    hasMorePromotions: morePromotionsCount > 0,
                    morePromotionsCount,
                    txtMorePromotions: morePromotionsCount === 1 ? this.txtMoreOfferOne : this.txtMoreOffersOther,
                };
            });

        return products;
    }
}


/**
 * Inherited ProductCardsGraphQLQuery class for Supermarket theme
 */
export class SupermarketProductCardsGraphQLQuery extends ProductCardsGraphQLQuery {
    constructor({
        card_show_brand = true,
        card_show_swatches = false,
        show_rrp = true,
        ...context
    }) {
        super({
            ...context,
            card_show_brand,
            card_show_swatches,
            show_rrp,
            restrictToLogin: !context.customerId && context.hidePriceFromGuests,
        });
    }
}

export const productCardTemplate = `
    <article class="card"
        data-event-type="list"
        data-entity-id="{{id}}"
        data-position="{{index}}"
        data-name="{{name}}"
        data-product-price="{{price.value}}">
        <figure class="card-figure">
            {{#product_outstock_badge}}
                {{#outOfStockMessage}}
                    <div class="sale-flag-side sale-flag-side--outstock">
                        <span class="sale-text">{{outOfStockMessage}}</span>
                    </div>
                {{/outOfStockMessage}}
            {{/product_outstock_badge}}

            {{#saleBadge}}
                {{#product_sale_badges_sash}}
                    <div class="sale-flag-sash">
                        <span class="sale-text">{{&saleBadge}}</span>
                    </div>
                {{/product_sale_badges_sash}}
                {{#product_sale_badges_topright}}
                    <div class="sale-flag-side">
                        <span class="sale-text">{{&saleBadge}}</span>
                    </div>
                {{/product_sale_badges_topright}}
                {{#product_sale_badges_burst}}
                    <div class="starwrap">
                        <div class="sale-flag-star"></div>
                        <div class="sale-text-burst">{{&saleBadge}}</div>
                    </div>
                {{/product_sale_badges_burst}}
            {{/saleBadge}}

            {{#customBadges}}
                <div class="sale-flag-side sale-flag-side--custom">
                    <span class="sale-text">{{&.}}</span>
                </div>
            {{/customBadges}}

            <a href="{{url}}" data-event-type="product-click" data-instantload>
                <div class="card-img-container">
                    <img
                        {{#defaultImage}}
                            src="{{url320wide}}"
                            srcset="{{url80wide}} 80w, {{url160wide}} 160w, {{url320wide}} 320w, {{url640wide}} 640w"
                        {{/defaultImage}}
                        {{^defaultImage}}
                            src="{{defaultProductImage}}"
                        {{/defaultImage}}
                        data-sizes="auto"
                        class="card-image lazyload"
                        alt="{{name}}"
                        title="{{name}}">
                    {{#hoverImage}}
                        <img
                            src="{{url320wide}}"
                            srcset="{{url80wide}} 80w, {{url160wide}} 160w, {{url320wide}} 320w, {{url640wide}} 640w"
                            data-sizes="auto"
                            class="card-image lazyload"
                            alt="{{name}}"
                            title="{{name}}">
                    {{/hoverImage}}
                </div>
            </a>
            <figcaption class="card-figcaption">
                <div class="card-figcaption-body">
                    <div class="card-buttons">
                        {{#card_show_button}}
                            {{^restrictToLogin}}
                                {{#hasOptions}}
                                    <a href="{{url}}" target="_blank" title="{{txtChooseOptions}}" data-event-type="product-click" class="button button--small button--primary card-figcaption-button{{#show_product_quick_view}}{{#ajax_add_to_cart}} quickview-alt{{/ajax_add_to_cart}}{{/show_product_quick_view}}" data-product-id="{{id}}">
                                        {{txtChooseOptions}}
                                    </a>
                                {{/hasOptions}}

                                {{#preOrder}}
                                    <a href="{{url}}" data-event-type="product-click" class="button button--small button--primary card-figcaption-button">
                                        {{txtPreOrder}}
                                    </a>
                                {{/preOrder}}

                                {{#addToCartUrl}}
                                    <a href="{{addToCartUrl}}" {{^ajax_add_to_cart}} data-event-type="product-click"{{/ajax_add_to_cart}} class="button button--small button--primary card-figcaption-button"{{#ajax_add_to_cart}} data-emthemesmodez-cart-item-add{{/ajax_add_to_cart}}>
                                        {{txtAddToCart}}
                                    </a>
                                {{/addToCartUrl}}

                                {{#outOfStockMessage}}
                                    <a href="{{url}}" data-event-type="product-click" class="button button--outstock button--small card-figcaption-button" data-product-id="{{id}}">
                                        <span>{{outOfStockMessage}}</span>
                                    </a>
                                {{/outOfStockMessage}}

                                {{#show_compare}}
                                    <button type="button" class="button button--small card-figcaption-button card-figcaption-button--compare"
                                        aria-label="{{txtAddToCompare}}"
                                        title="{{txtAddToCompare}}"
                                        data-compare-id="{{id}}"
                                        data-compare-image="{{#defaultImage}}{{url320wide}}{{/defaultImage}}"
                                        data-compare-title="{{name}}"
                                        data-compare-url="{{url}}"
                                    >{{txtCompare}}</button>
                                {{/show_compare}}
                            {{/restrictToLogin}}
                        {{/card_show_button}}
                    </div>
                    <div class="card-buttons card-buttons--alt">
                        {{#show_product_quick_view}}
                            <a class="button button--small card-figcaption-button quickview" data-event-type="product-click" data-product-id="{{id}}">{{txtQuickView}}</a>
                        {{/show_product_quick_view}}
                    </div>
                </div>
            </figcaption>
        </figure>
        <div class="card-body">
            <h4 class="card-title">
                <a href="{{url}}" data-instantload data-event-type="product-click">{{name}}</a>
            </h4>

            {{#card_show_brand}}
                {{#brand}}
                    <p class="card-text card-text--brand" data-test-info-type="brandName">{{brand.name}}</p>
                {{/brand}}
            {{/card_show_brand}}

            {{#ratingHtml}}
                <p class="card-text card-text--rating" data-test-info-type="productRating">
                    <span class="rating--small">
                        {{&ratingHtml}}
                    </span>
                </p>
            {{/ratingHtml}}

            {{#price}}
                <div class="card-text card-text--price" data-test-info-type="price">
                    {{&price.formatted}}
                </div>
            {{/price}}

            {{#restrictToLogin}}
                <div class="card-text card-text--price" data-test-info-type="price">
                    <a class="price--login" href="/login.php" translate>{{txtLoginForPricing}}</a>
                </div>
            {{/restrictToLogin}}

            {{#card_show_sku}}
                {{#sku}}
                    <div class="card-text card-text--sku" data-test-info-type="sku">
                        {{sku}}
                    </div>
                {{/sku}}
            {{/card_show_sku}}

            {{#customFields}}
                <div class="card-text card-text--info">
                    {{&customFields}}
                </div>
            {{/customFields}}

            {{#card_show_swatches}}
                <div class="card-text card-text--colorswatches"></div>
            {{/card_show_swatches}}

            {{! last in the body so the swatches keep their row; merchant text stays escaped }}
            {{#show_featured_promotions}}
                {{#featuredPromotion}}
                    <div class="promotionCallout promotionCallout--compact">
                        <div class="promotionCallout-item">
                            <span class="promotionCallout-text">{{text}}</span>
                        </div>
                        {{#hasMorePromotions}}
                            <span class="promotionCallout-more">
                                +{{morePromotionsCount}} {{txtMorePromotions}}
                            </span>
                        {{/hasMorePromotions}}
                    </div>
                {{/featuredPromotion}}
            {{/show_featured_promotions}}
        </div>
    </article>
`;


export default {
    autoExpandCategoryMenu,
    bindNavPagesCheckRightEdge,
    checkTouchDevice,
    loadRemoteBanners,
    currencyFormat,
    extractMoney,
    postProductCardsQuery,
    mapFeaturedPromotions,
    ProductCardsGraphQLQuery,
    SupermarketProductCardsGraphQLQuery,
    productCardTemplate,
};
