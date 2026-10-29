import { throttle } from 'lodash';
import { SupermarketProductCardsGraphQLQuery, productCardTemplate, postProductCardsQuery, truncateResponseText } from './theme-utils';
import mustache from 'mustache';

export class SpecialProductsGraphQLQuery extends SupermarketProductCardsGraphQLQuery {
    /**
     * Load special products from GraphQL
     * @param {new|top|featured} type Load newest, bestselling or featured products
     * @param {String} afterCursor Load products after cursor
     * @param {Number} limit Number of products to load
     * @param {Boolean} hideOutOfStock Hide out of stock products
     * @returns products
     */
    async load(
        type = 'new',
        afterCursor = '',
        limit = 10,
        hideOutOfStock = true,
    ) {
        const cacheKey = `${this.currencyCode}_${type}_${afterCursor}_${limit}_${hideOutOfStock}`;

        if (!this.cachedProducts[cacheKey]) {
            const request = postProductCardsQuery({
                graphQLToken: this.graphQLToken,
                label: 'special-products-tabs',
                detail: type,
                variables: {
                    after: afterCursor,
                    first: limit,
                    hideOutOfStock,
                    currencyCode: this.currencyCode,
                },
                buildQuery: featuredPromotionsField => `
                            query categoryProducts(
                                $after: String,
                                $first: Int,
                                $hideOutOfStock: Boolean,
                                $currencyCode: currencyCode!
                            ) {
                                site {
                                    ${type === 'new' ? `
                                    newestProducts(after: $after, first: $first, hideOutOfStock: $hideOutOfStock) {
                                        edges {
                                            node {
                                                ...ProductFields
                                            }
                                        }
                                        pageInfo {
                                            endCursor
                                            hasNextPage
                                        }
                                    }
                                    ` : ''}
                                    ${type === 'top' ? `
                                    bestSellingProducts(after: $after, first: $first, hideOutOfStock: $hideOutOfStock) {
                                        edges {
                                            node {
                                                ...ProductFields
                                            }
                                        }
                                        pageInfo {
                                            endCursor
                                            hasNextPage
                                        }
                                    }
                                    ` : ''}
                                    ${type === 'featured' ? `
                                    featuredProducts(after: $after, first: $first, hideOutOfStock: $hideOutOfStock) {
                                        edges {
                                            node {
                                                ...ProductFields
                                            }
                                        }
                                        pageInfo {
                                            endCursor
                                            hasNextPage
                                        }
                                    }
                                    ` : ''}
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
                            fragment ProductFields on Product {
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
                        `,
            }).then(({ resp, xhr }) => {
                try {
                    if (!resp) {
                        return ''; // postProductCardsQuery already logged the transport failure
                    }
                    if (!resp.data?.site) {
                        console.error('[papathemes-supermarket] special-products-tabs GraphQL returned no data', type, truncateResponseText(xhr)); // eslint-disable-line no-console
                        return '';
                    }
                    return {
                        newestProducts: type === 'new' && resp.data.site.newestProducts
                            ? this.mapGraphQLProducts(resp.data.site.newestProducts, resp.data.site.settings, resp.data.site.currency)
                            : [],
                        newestProductsInfo: type === 'new' && resp.data.site.newestProducts
                            ? {
                                endCursor: resp.data.site.newestProducts.pageInfo.endCursor,
                                hasNextPage: resp.data.site.newestProducts.pageInfo.hasNextPage,
                            }
                            : { endCursor: '', hasNextPage: false },
                        bestsellingProducts: type === 'top' && resp.data.site.bestSellingProducts
                            ? this.mapGraphQLProducts(resp.data.site.bestSellingProducts, resp.data.site.settings, resp.data.site.currency)
                            : [],
                        bestsellingProductsInfo: type === 'top' && resp.data.site.bestSellingProducts
                            ? {
                                endCursor: resp.data.site.bestSellingProducts.pageInfo.endCursor,
                                hasNextPage: resp.data.site.bestSellingProducts.pageInfo.hasNextPage,
                            }
                            : { endCursor: '', hasNextPage: false },
                        featuredProducts: type === 'featured' && resp.data.site.featuredProducts
                            ? this.mapGraphQLProducts(resp.data.site.featuredProducts, resp.data.site.settings, resp.data.site.currency)
                            : [],
                        featuredProductsInfo: type === 'featured' && resp.data.site.featuredProducts
                            ? {
                                endCursor: resp.data.site.featuredProducts.pageInfo.endCursor,
                                hasNextPage: resp.data.site.featuredProducts.pageInfo.hasNextPage,
                            }
                            : { endCursor: '', hasNextPage: false },
                    };
                } catch (err) {
                    console.error('[papathemes-supermarket] special-products-tabs GraphQL response could not be mapped', type, err); // eslint-disable-line no-console
                    return '';
                }
            });

            try {
                this.cachedProducts[cacheKey] = await request;
            } catch (err) {
                console.error('[papathemes-supermarket] special-products-tabs GraphQL request could not be sent', type, err); // eslint-disable-line no-console
                this.cachedProducts[cacheKey] = '';
            }
        }

        return this.cachedProducts[cacheKey];
    }
}

class SpecialProductsTabs {
    constructor($scope, context) {
        this.$scope = $scope;
        this.context = context;
        this.$viewportCheck = $scope.find('[data-viewport-check]');
        this.$loading = $scope.find('.loading').hide();
        this.$loadMore = $scope.find('.loadMore').hide();
        this.$collapse = $scope.find('.collapse').hide();
        this.defaultProductsCount = (Number(this.context?.themeSettings?.specialProductsTab_lazy_count) || 0) + (Number(this.context?.themeSettings?.specialProductsTab_init_count) || 0);
        this.template = `
            <div class="emthemesModez-specialProductsTabs-products">
                {{#featuredProducts.length}}
                    <ul class="productGrid productGrid--maxCol4" data-product-type="featured" data-list-name="Featured Products">
                        {{#featuredProducts}}
                            <li class="product" data-product-id="{{id}}">
                                {{&productCardHtml}}
                            </li>
                        {{/featuredProducts}}
                    </ul>
                {{/featuredProducts.length}}

                {{#bestsellingProducts.length}}
                    <ul class="productGrid productGrid--maxCol4" data-product-type="bestselling" data-list-name="Most Popular Products">
                        {{#bestsellingProducts}}
                            <li class="product" data-product-id="{{id}}">
                                {{&productCardHtml}}
                            </li>
                        {{/bestsellingProducts}}
                    </ul>
                {{/bestsellingProducts.length}}

                {{#newestProducts.length}}
                    <ul class="productGrid productGrid--maxCol4" data-product-type="newest" data-list-name="Most Popular Products">
                        {{#newestProducts}}
                            <li class="product" data-product-id="{{id}}">
                                {{&productCardHtml}}
                            </li>
                        {{/newestProducts}}
                    </ul>
                {{/newestProducts.length}}
            </div>
        `;
        this.onCheckViewport = throttle(this.onCheckViewport.bind(this), 100);
        this.onLoadMore = this.onLoadMore.bind(this);
        this.onCollapse = this.onCollapse.bind(this);
        this.onTabToggled = this.onTabToggled.bind(this);

        if (this.context.themeSettings.specialProductsTab_more) {
            this.$loadMore.show();
        }

        this.bindEvents();

        this.gql = new SpecialProductsGraphQLQuery(context);
    }

    bindEvents() {
        $('body').one('beforeload.instantload', () => this.unbindEvents());

        if (this.$viewportCheck.length > 0) {
            $(window).on('load resize scroll', this.onCheckViewport);
        }

        if (this.context.themeSettings.specialProductsTab_more) {
            this.$loadMore.on('click', this.onLoadMore);
        }

        this.$collapse.on('click', this.onCollapse);

        $('[data-tab]', this.$scope).on('toggled', this.onTabToggled);
    }

    unbindEvents() {
        $(window).off('load resize scroll', this.onCheckViewport);
        this.$loadMore.off('click', this.onLoadMore);
        this.$collapse.off('click', this.onCollapse);
        $('[data-tab]', this.$scope).off('toggled', this.onTabToggled);
    }

    onCheckViewport() {
        const offset = 250;

        this.$viewportCheck.each((i, el) => {
            const $el = $(el);

            if (!$el.is(':visible')) {
                return;
            }

            // Measure the panel, not the sentinel: the sentinel sits below the reserved skeleton
            // slots, a full grid-height under the fold, so measuring it never fires the fetch.
            const $tab = $el.closest('.tab-content');

            if ($tab.length === 0) {
                return;
            }

            const elTop = $tab.offset().top;
            const elBottom = elTop + $tab.outerHeight();
            const winTop = $(window).scrollTop();
            const winBottom = winTop + $(window).innerHeight();

            if (elTop - offset < winBottom && elBottom + offset > winTop) {
                this.loadViewportProducts(
                    $el.data('viewportCheck'),
                    $tab.find('.productGrid, .productList, .productCarousel'),
                );

                this.$viewportCheck = this.$viewportCheck.not($el);
                $el.remove();
            }
        });
    }

    onLoadMore(event) {
        event.preventDefault();

        const $tab = this.$scope.find('.tab-content.is-active');

        if ($tab.data('loadingMore')) {
            return;
        }

        if (!$tab.data('loadedMore')) {
            $tab.data('loadingMore', true);

            const limit = 50;
            const type = $tab.data('productType');

            this.$loading.show();
            this.$loadMore.attr('disabled', true);

            const release = () => {
                this.$loading.hide();
                this.$loadMore.removeAttr('disabled');
                $tab.removeData('loadingMore');
            };

            this.gql.load(type, '', limit, true).then(data => {
                release();

                if (!data) {
                    return;
                }

                $tab.find('[data-skeleton-placeholder]').remove();

                const html = mustache.render(this.template, {
                    featuredProducts: data.featuredProducts.map(product => ({
                        ...product,
                        productCardHtml: mustache.render(productCardTemplate, product),
                    })),
                    bestsellingProducts: data.bestsellingProducts.map(product => ({
                        ...product,
                        productCardHtml: mustache.render(productCardTemplate, product),
                    })),
                    newestProducts: data.newestProducts.map(product => ({
                        ...product,
                        productCardHtml: mustache.render(productCardTemplate, product),
                    })),
                });

                const existProductIds = $tab
                    .find('.product, .productCarousel-slide')
                    .map((i, el) => $(el).data('productId')).get();

                const $products = $(html)
                    .find('.product, .productCarousel-slide')
                    .filter((i, el) => existProductIds.indexOf($(el).data('productId')) === -1);

                $products
                    .slice(this.defaultProductsCount)
                    .hide();

                $tab
                    .find('.productGrid, .productList, .productCarousel')
                    .append($products);

                // Latch only once the products are in the DOM — latching ahead of a throw routes the next click to the reveal branch with nothing to show.
                $tab.data('loadedMore', true);

                if (!$products.is(':hidden')) {
                    this.$loadMore.hide();
                }

                if ($products.length > 0) {
                    this.$collapse.show();
                }
            }).catch(err => {
                release();
                console.error('[papathemes-supermarket] special-products-tabs load more failed', type, err); // eslint-disable-line no-console
            });
        } else {
            const $products = $tab.find('.product, .productCarousel-slide').filter(':hidden');

            $products
                .slice(0, this.defaultProductsCount)
                .show();

            if (!$products.is(':hidden')) {
                this.$loadMore.hide();
            }

            this.$collapse.show();
        }
    }

    onCollapse(event) {
        event.preventDefault();

        const $tab = this.$scope.find('.tab-content.is-active');
        const $products = $tab.find('.product, .productCarousel-slide');

        $products.slice(this.defaultProductsCount).hide();

        this.$collapse.hide();

        if ($products.length > this.defaultProductsCount) {
            this.$loadMore.show();
        }

        $('html, body').animate({
            scrollTop: $tab.offset().top,
        });
    }

    onTabToggled(event, tab) {
        const $tabContent = $($('a', tab).attr('href'));

        $('[data-slick]', $tabContent).slick('setPosition');

        if (this.$viewportCheck.length > 0) {
            this.onCheckViewport();
        }

        const $products = $tabContent.find('.product, .productCarousel-slide');
        const visible = $products.filter(':visible').length;

        if (this.context.themeSettings.specialProductsTab_more) {
            if (!$tabContent.data('loadedMore') || $products.is(':hidden')) {
                this.$loadMore.show();
            } else {
                this.$loadMore.hide();
            }

            if (visible > this.defaultProductsCount) {
                this.$collapse.show();
            } else {
                this.$collapse.hide();
            }
        }
    }

    async loadViewportProducts(type, $container) {
        this.$loading.show();

        const limit = this.defaultProductsCount;
        const data = await this.gql.load(type, '', limit, true);

        this.$loading.hide();

        if (!data) {
            $container.find('[data-skeleton-placeholder]').addClass('emthemesModez-pbcSkeleton--inert');
            return;
        }

        $container.find('[data-skeleton-placeholder]').remove();

        // Nothing awaits this method, so a throw from here would surface only as an unhandled rejection.
        try {
            const html = mustache.render(this.template, {
                featuredProducts: data.featuredProducts.map(product => ({
                    ...product,
                    productCardHtml: mustache.render(productCardTemplate, product),
                })),
                bestsellingProducts: data.bestsellingProducts.map(product => ({
                    ...product,
                    productCardHtml: mustache.render(productCardTemplate, product),
                })),
                newestProducts: data.newestProducts.map(product => ({
                    ...product,
                    productCardHtml: mustache.render(productCardTemplate, product),
                })),
            });

            // Read the raw attribute, not .data() — jQuery coerces the id to a Number and the exact string compare then never matches.
            const readProductId = el => $(el).attr('data-product-id') || $(el).find('[data-product-id]').attr('data-product-id');
            const existIds = $container.find('.product, .productCarousel-slide')
                .map((i, el) => readProductId(el))
                .get()
                .filter(Boolean);
            const $new = $(html).find('.product, .productCarousel-slide').filter((i, el) => {
                const id = readProductId(el);
                return id && !existIds.includes(id);
            });
            const need = this.defaultProductsCount - existIds.length;

            $container.append($new.slice(0, Math.max(need, 0)));
        } catch (err) {
            console.error('[papathemes-supermarket] special-products-tabs lazy products could not be rendered', type, err); // eslint-disable-line no-console
        }
    }
}

export default function init({ selector = '[data-special-products-tabs]', context }) {
    $(selector).each((i, el) => {
        const $el = $(el);
        if (!$el.data('specialProductsTabsInstance')) {
            $el.data('specialProductsTabsInstance', new SpecialProductsTabs($el, context));
        }
    });
}
