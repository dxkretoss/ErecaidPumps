/* eslint-disable camelcase */

import { throttle } from 'lodash';
import utils from '@bigcommerce/stencil-utils';
import mustache from 'mustache';
import foundation from '../theme/global/foundation';
import { SupermarketProductCardsGraphQLQuery, productCardTemplate as defaultProductCardTemplate, postProductCardsQuery, truncateResponseText } from './theme-utils';

let isRequestingCategoryPage = 0;
export class CategoryProductsGraphQLQuery extends SupermarketProductCardsGraphQLQuery {
    /**
     * Load products by category ID using GraphQL
     * @param {Number} categoryId Category ID
     * @param {String} afterCursor Product ID after which to load more products
     * @param {Number} limit Number of products to load
     * @param {A_TO_Z|BEST_REVIEWED|BEST_SELLING|FEATURED|HIGHEST_PRICE|LOWEST_PRICE|NEWEST|RELEVANCE|Z_TO_A} sort Sort order
     * @param {Boolean} hideOutOfStock Hide out of stock products
     * @returns category
     */
    async load(categoryId, afterCursor = '', limit = 10, sort = 'FEATURED', hideOutOfStock = true) {
        const cacheKey = `${this.currencyCode}_${categoryId}_${afterCursor}_${limit}_${sort}_${hideOutOfStock}`;

        if (!this.cachedProducts[cacheKey]) {
            const request = postProductCardsQuery({
                graphQLToken: this.graphQLToken,
                label: 'products-by-category',
                detail: categoryId,
                variables: {
                    entityId: categoryId,
                    after: afterCursor,
                    first: limit,
                    hideOutOfStock,
                    sortBy: sort,
                    currencyCode: this.currencyCode,
                },
                buildQuery: featuredPromotionsField => `
                            query categoryProducts(
                                $entityId: Int!,
                                $after: String,
                                $first: Int,
                                $hideOutOfStock: Boolean,
                                $sortBy: SearchProductsSortInput,
                                $currencyCode: currencyCode!
                            ) {
                                site {
                                    category(entityId: $entityId) {
                                        name
                                        path
                                    }
                                    search {
                                        searchProducts(filters: { categoryEntityId: $entityId, searchSubCategories: true, hideOutOfStock: $hideOutOfStock }, sort: $sortBy) {
                                            products(after: $after, first: $first) {
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
                                                pageInfo {
                                                    endCursor
                                                    hasNextPage
                                                }
                                            }
                                        }
                                    }
                                    categoryTree(rootEntityId: $entityId) {
                                        hasChildren
                                        children {
                                            entityId
                                            name
                                            path
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
                        return null; // postProductCardsQuery already logged the transport failure
                    }
                    if (!resp.data?.site?.category) {
                        console.error('[papathemes-supermarket] products-by-category GraphQL returned no data', categoryId, truncateResponseText(xhr)); // eslint-disable-line no-console
                        return null;
                    }
                    const searchProducts = resp.data.site.search?.searchProducts?.products || { edges: [], pageInfo: { endCursor: '', hasNextPage: false } };
                    return {
                        ...resp.data.site.category,
                        children: resp.data.site.categoryTree?.[0]?.children || [],
                        hasChildren: resp.data.site.categoryTree?.[0]?.hasChildren || false,
                        products: this.mapGraphQLProducts(searchProducts, resp.data.site.settings, resp.data.site.currency),
                        productsInfo: {
                            endCursor: searchProducts.pageInfo?.endCursor || '',
                            hasNextPage: Boolean(searchProducts.pageInfo?.hasNextPage),
                        },
                    };
                } catch (err) {
                    console.error('[papathemes-supermarket] products-by-category GraphQL response could not be mapped', categoryId, err); // eslint-disable-line no-console
                    return null;
                }
            });

            try {
                this.cachedProducts[cacheKey] = await request;
            } catch (err) {
                console.error('[papathemes-supermarket] products-by-category GraphQL request could not be sent', categoryId, err); // eslint-disable-line no-console
                this.cachedProducts[cacheKey] = null;
            }
        }

        return this.cachedProducts[cacheKey];
    }
}

export class ProductsByCategory {
    constructor({
        id,
        index = 0,
        sort = '',
        limit = '',
        $parent,
        $placeholder,
        context,
        sectionTemplate = `
            <div class="emthemesModez-section emthemesModez-section--productsByCategorySortingTabs">
                <div class="emthemesModez-section-inner">
                    <div class="emthemesModez-productsByCategoryTabs emthemesModez-productsByCategoryTabs--sorting emthemesModez-productsByCategoryTabs--supermarket1">
                        <ul class="tabs" data-tab role="tablist">
                            <li class="li-heading" role="presentation"><h2 class="page-heading" role="tab"><a href="{{url}}">{{name}}</a></h2></li>

                            {{#showBestselling}}
                                <li class="tab{{#isBestsellingActive}} is-active{{/isBestsellingActive}}" role="presentation"><a class="tab-title" href="#tab-productsByCategoryTabs-bestselling-{{id}}" role="tab" tabindex="0" aria-selected="{{#isBestsellingActive}}true{{/isBestsellingActive}}{{^isBestsellingActive}}false{{/isBestsellingActive}}" aria-controls="tab-productsByCategoryTabs-bestselling-{{id}}">{{txtBestsellingTab}}</a></li>
                            {{/showBestselling}}

                            {{#showFeatured}}
                                <li class="tab{{#isFeaturedActive}} is-active{{/isFeaturedActive}}" role="presentation"><a class="tab-title" href="#tab-productsByCategoryTabs-featured-{{id}}" role="tab" tabindex="0" aria-selected="{{#isFeaturedActive}}true{{/isFeaturedActive}}{{^isFeaturedActive}}false{{/isFeaturedActive}}" aria-controls="tab-productsByCategoryTabs-featured-{{id}}">{{txtFeaturedTab}}</a></li>
                            {{/showFeatured}}

                            {{#showNew}}
                                <li class="tab{{#isNewActive}} is-active{{/isNewActive}}" role="presentation"><a class="tab-title" href="#tab-productsByCategoryTabs-newest-{{id}}" role="tab" tabindex="0" aria-selected="{{#isNewActive}}true{{/isNewActive}}{{^isNewActive}}false{{/isNewActive}}" aria-controls="tab-productsByCategoryTabs-newest-{{id}}">{{txtNewTab}}</a></li>
                            {{/showNew}}

                            {{#showReviews}}
                                <li class="tab{{#isReviewsActive}} is-active{{/isReviewsActive}}" role="presentation"><a class="tab-title" href="#tab-productsByCategoryTabs-avgcustomerreview-{{id}}" role="tab" tabindex="0" aria-selected="{{#isReviewsActive}}true{{/isReviewsActive}}{{^isReviewsActive}}false{{/isReviewsActive}}" aria-controls="tab-productsByCategoryTabs-avgcustomerreview-{{id}}">{{txtReviewsTab}}</a></li>
                            {{/showReviews}}
                        </ul>
                        {{#showBannerOrSubcategories}}
                            <div class="emthemesModez-productsByCategoryTabs-details{{#showBanner}} emthemesModez-productsByCategoryTabs-details--hasImage{{/showBanner}}">
                                {{#showBanner}}
                                    <div class="emthemesModez-productsByCategoryTabs-details-image" data-banner>
                                        <a href="{{url}}"><img alt="{{name}}" /></a>
                                    </div>
                                {{/showBanner}}
                                {{#subcategories.length}}
                                        <div class="emthemesModez-productsByCategoryTabs-details-sub">
                                            <h3 class="emthemesModez-productsByCategoryTabs-details-sub-heading">{{txtSubHeading}}</h3>
                                            <ul class="emthemesModez-productsByCategoryTabs-details-sub-list">
                                            {{#subcategories}}
                                                <li class="emthemesModez-productsByCategoryTabs-details-sub-item"><a href="{{url}}">{{name}}</a></li>
                                            {{/subcategories}}
                                            </ul>
                                        </div>
                                {{/subcategories.length}}
                            </div>
                        {{/showBannerOrSubcategories}}
                        <div class="tabs-contents">
                            {{#showBestselling}}
                                <section role="tabpanel" aria-hidden="{{#isBestsellingActive}}false{{/isBestsellingActive}}{{^isBestsellingActive}}true{{/isBestsellingActive}}" class="tab-content {{#isBestsellingActive}}is-active{{/isBestsellingActive}}" id="tab-productsByCategoryTabs-bestselling-{{id}}" data-sort="bestselling">
                                    {{#isBestsellingActive}}
                                        {{&productsHtml}}
                                    {{/isBestsellingActive}}
                                    {{^isBestsellingActive}}
                                        {{&productsLoadingHtml}}
                                    {{/isBestsellingActive}}
                                </section>
                            {{/showBestselling}}

                            {{#showFeatured}}
                                <section role="tabpanel" aria-hidden="{{#isFeaturedActive}}false{{/isFeaturedActive}}{{^isFeaturedActive}}true{{/isFeaturedActive}}" class="tab-content {{#isFeaturedActive}}is-active{{/isFeaturedActive}}" id="tab-productsByCategoryTabs-featured-{{id}}" data-sort="featured">
                                    {{#isFeaturedActive}}
                                        {{&productsHtml}}
                                    {{/isFeaturedActive}}
                                    {{^isFeaturedActive}}
                                        {{&productsLoadingHtml}}
                                    {{/isFeaturedActive}}
                                </section>
                            {{/showFeatured}}

                            {{#showNew}}
                                <section role="tabpanel" aria-hidden="{{#isNewActive}}false{{/isNewActive}}{{^isNewActive}}true{{/isNewActive}}" class="tab-content {{#isNewActive}}is-active{{/isNewActive}}" id="tab-productsByCategoryTabs-newest-{{id}}" data-sort="newest">
                                    {{#isNewActive}}
                                        {{&productsHtml}}
                                    {{/isNewActive}}
                                    {{^isNewActive}}
                                        {{&productsLoadingHtml}}
                                    {{/isNewActive}}
                                </section>
                            {{/showNew}}

                            {{#showReviews}}
                                <section role="tabpanel" aria-hidden="{{#isReviewsActive}}false{{/isReviewsActive}}{{^isReviewsActive}}true{{/isReviewsActive}}" class="tab-content {{#isReviewsActive}}is-active{{/isReviewsActive}}" id="tab-productsByCategoryTabs-avgcustomerreview-{{id}}" data-sort="avgcustomerreview">
                                    {{#isReviewsActive}}
                                        {{&productsHtml}}
                                    {{/isReviewsActive}}
                                    {{^isReviewsActive}}
                                        {{&productsLoadingHtml}}
                                    {{/isReviewsActive}}
                                </section>
                            {{/showReviews}}

                        </div>
                        <div class="emthemesModez-productsByCategoryTabs-loader loader"></div>
                        <div class="emthemesModez-productsByCategoryTabs-actionGroup">
                            <a href="#" class="button button--small loadMore">{{txtLoadMore}}</a>
                            <a href="#" class="button button--small collapse">{{txtCollapse}}</a>
                        </div>
                    </div>
                </div>
            </div>
        `,
        productsLoadingTemplate = `
            <div class="emthemesModez-productLoading">
                <div class="emthemesModez-productLoading-item"><img class="lazyload" data-sizes="auto" src="{{loadingImage}}" data-src="{{productLoadingImage}}" alt="loading" title="loading" /></div>
                <div class="emthemesModez-productLoading-item"><img class="lazyload" data-sizes="auto" src="{{loadingImage}}" data-src="{{productLoadingImage}}" alt="loading" title="loading" /></div>
                <div class="emthemesModez-productLoading-item"><img class="lazyload" data-sizes="auto" src="{{loadingImage}}" data-src="{{productLoadingImage}}" alt="loading" title="loading" /></div>
                <div class="emthemesModez-productLoading-item"><img class="lazyload" data-sizes="auto" src="{{loadingImage}}" data-src="{{productLoadingImage}}" alt="loading" title="loading" /></div>
            </div>
        `,
        productsTemplate = `
            <div class="emthemesModez-productsByCategoryTabs-products" data-end-cursor="{{endCursor}}" {{#hasNextPage}}data-has-next-page="true"{{/hasNextPage}}>
                <ul class="productGrid {{#maxColumns}}productGrid--maxCol{{maxColumns}}{{/maxColumns}}">
                    {{#products}}
                        <li class="product">
                            {{&productCardHtml}}
                        </li>
                    {{/products}}
                </ul>
            </div>
        `,
        skeletonTemplate = `
            <div class="emthemesModez-section emthemesModez-section--productsByCategorySortingTabs" data-pbcst-skeleton>
                <div class="emthemesModez-section-inner">
                    <div class="emthemesModez-productsByCategoryTabs emthemesModez-productsByCategoryTabs--sorting emthemesModez-productsByCategoryTabs--supermarket1 emthemesModez-pbcSkeleton" aria-hidden="true">
                        <ul class="tabs">
                            <li class="li-heading"><span class="emthemesModez-pbcSkeleton-bar emthemesModez-pbcSkeleton-bar--heading"></span></li>
                        </ul>
                        <div class="tabs-contents">
                            <div class="emthemesModez-productsByCategoryTabs-products">
                                <ul class="productGrid {{#maxColumns}}productGrid--maxCol{{maxColumns}}{{/maxColumns}}">
                                    {{#cards}}
                                        <li class="product">
                                            <div class="emthemesModez-pbcSkeleton-card">
                                                <span class="emthemesModez-pbcSkeleton-figure"></span>
                                                <span class="emthemesModez-pbcSkeleton-bar emthemesModez-pbcSkeleton-bar--title"></span>
                                                <span class="emthemesModez-pbcSkeleton-bar emthemesModez-pbcSkeleton-bar--price"></span>
                                            </div>
                                        </li>
                                    {{/cards}}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        productCardTemplate,
    }) {
        this.onLoadMore = this.onLoadMore.bind(this);
        this.onCollapse = this.onCollapse.bind(this);

        this.id = id;
        this.index = index;
        this.sort = sort;
        this.limit = limit;
        this.$parent = $parent;
        this.context = context;
        this.sectionTemplate = sectionTemplate;
        this.productsLoadingTemplate = productsLoadingTemplate;
        this.productsTemplate = productsTemplate;
        this.skeletonTemplate = skeletonTemplate;
        this.productCardTemplate = productCardTemplate || defaultProductCardTemplate;

        // Prefer the server-rendered skeleton (reserves height at first paint, no CLS); else render one.
        if ($placeholder && $placeholder.length) {
            this.$scope = $placeholder;
        } else {
            this.$scope = $(this.renderSkeleton());
            this.$parent.append(this.$scope);
        }

        this.$loadMore = $();
        this.$collapse = $();
        this.$loader = $();

        this.gql = new CategoryProductsGraphQLQuery(context);

        this.request();
    }

    async request() {
        let sort;

        switch (this.sort) {
        case 'bestselling':
            sort = 'BEST_SELLING';
            break;
        case 'featured':
            sort = 'FEATURED';
            break;
        case 'newest':
            sort = 'NEWEST';
            break;
        case 'avgcustomerreview':
            sort = 'BEST_REVIEWED';
            break;
        default:
            sort = 'FEATURED';
            break;
        }

        const category = await this.gql.load(this.id, '', this.limit, sort, true);

        this.categoryPath = category?.path;

        if (!category || !category.products?.length) {
            return this.requestCategoryPageOnViewport();
        }

        const html = mustache.render(this.sectionTemplate, {
            name: category.name,
            url: category.path,
            id: this.id,
            showBestselling: this.context.pbcst_show_bestselling,
            isBestsellingActive: this.sort === 'bestselling',
            txtBestsellingTab: this.context.txtBestsellingTab,
            showFeatured: this.context.pbcst_show_featured,
            isFeaturedActive: this.sort === 'featured',
            txtFeaturedTab: this.context.txtFeaturedTab,
            showNew: this.context.pbcst_show_new,
            isNewActive: this.sort === 'newest',
            txtNewTab: this.context.txtNewTab,
            showReviews: this.context.pbcst_show_reviews,
            isReviewsActive: this.sort === 'avgcustomerreview',
            txtReviewsTab: this.context.txtReviewsTab,
            showBannerOrSubcategories: this.context.pbcst_show_banner || this.context.pbcst_subcategories > 0 && category.hasChildren,
            showBanner: this.context.pbcst_show_banner,
            txtSubHeading: this.context.txtSubcategoryHeading,
            subcategories: category.children.slice(0, this.context.pbcst_subcategories).map(cat => ({
                name: cat.name,
                url: cat.path,
            })),

            productsHtml: this.generateProductsHtml(category),
            productsLoadingHtml: mustache.render(this.productsLoadingTemplate, {
                loadingImage: this.context.loadingImage,
                productLoadingImage: this.context.productLoadingImage,
            }, null),
            txtLoadMore: this.context.txtLoadMore,
            txtCollapse: this.context.txtCollapse,
        }, null);

        const $html = $(html);

        this.$scope.replaceWith($html);
        this.$scope = $html;
        this.$loader = this.$scope.find('.loader');

        this.initTabs();
        this.initSlick();
        this.initBanner();
        this.initButtons();
    }

    requestCategoryPageOnViewport() {
        const $sptLoading = $('[data-special-products-tabs] .loading');
        const onCheckViewport = throttle(() => {
            if ($sptLoading.length > 0 && $sptLoading.is(':visible')) return;

            const offset = 50;
            const elTop = this.$scope.offset().top;
            const elBottom = elTop + this.$scope.outerHeight();
            const winTop = $(window).scrollTop();
            const winBottom = winTop + $(window).innerHeight();

            if (elTop - offset < winBottom && elBottom + offset > winTop) {
                $(window).off('load resize scroll', onCheckViewport);
                this.requestCategoryPage();
            }
        }, 100);
        $(window).on('load resize scroll', onCheckViewport);
        if (this.index === 0) {
            onCheckViewport();
        }
    }

    requestCategoryPage() {
        const task = () => {
            const limitQuery = this.limit ? `&limit=${this.limit}` : '';
            const sortQuery = this.sort ? `&sort=${this.sort}` : '';
            const template = 'papa-supermarket/products-by-category-sorting-tabs/section';
            const url = this.categoryPath ? `${this.categoryPath}?${limitQuery}${sortQuery}` : `/categories.php?category=${this.id}${limitQuery}${sortQuery}`;

            isRequestingCategoryPage++;

            utils.api.getPage(url, { template }, (err, resp) => {
                isRequestingCategoryPage--;

                if (err || !resp || resp.error) {
                    this.giveUp(err || resp?.error || 'empty response');
                    return;
                }

                const $resp = $(resp);

                // Stop if the response contains multiple root elements (server error)
                if ($resp.length > 1) {
                    this.giveUp('unexpected multi-root response');
                    return;
                }

                this.$scope.replaceWith($resp);
                this.$scope = $resp;
                this.$loader = this.$scope.find('.loader');

                this.initTabs();
                this.initSlick();
                this.initBanner();
                this.initButtons();
            });
        };

        if (isRequestingCategoryPage <= 0) {
            task();
        } else {
            const timer = setInterval(() => {
                if (isRequestingCategoryPage <= 0) {
                    clearInterval(timer);
                    task();
                }
            }, 200);
        }
    }

    /** Removes `$scope` only while it is still a skeleton — without the marker check, a caller added later silently drops rendered content. */
    giveUp(reason) {
        console.error('[papathemes-supermarket] products-by-category could not be rendered', this.id, reason); // eslint-disable-line no-console

        if (this.$scope.is('[data-pbcst-skeleton]')) {
            this.$scope.remove();
        }
    }

    getMaxColumns() {
        const productsCount = Number(this.context?.pbcst_products) || Number(this.limit);
        const subcategoriesCount = Number(this.context?.pbcst_subcategories) || 0;
        if ([5, 10, 15].includes(productsCount)) return 5;
        if ([6, 18].includes(productsCount) || (productsCount === 12 && subcategoriesCount === 0)) return 6;
        return undefined;
    }

    renderSkeleton() {
        const count = Number(this.context?.pbcst_products) || Number(this.limit) || 4;
        return mustache.render(this.skeletonTemplate, {
            maxColumns: this.getMaxColumns(),
            cards: Array.from({ length: count }, () => ({})),
        });
    }

    generateProductsHtml(category) {
        return mustache.render(this.productsTemplate, {
            maxColumns: this.getMaxColumns(),
            products: category.products.map(product => ({
                ...product,
                productCardHtml: mustache.render(this.productCardTemplate, product),
            })),
            endCursor: category.productsInfo.endCursor,
            hasNextPage: category.productsInfo.hasNextPage,
        });
    }

    async loadProducts({
        sort = '',
        afterCursor = '',
        $content,
    }) {
        this.$loader.addClass('loading');

        let sortParam;
        switch (sort) {
        case 'bestselling':
            sortParam = 'BEST_SELLING';
            break;
        case 'featured':
            sortParam = 'FEATURED';
            break;
        case 'newest':
            sortParam = 'NEWEST';
            break;
        case 'avgcustomerreview':
            sortParam = 'BEST_REVIEWED';
            break;
        default:
            sortParam = 'FEATURED';
            break;
        }

        const category = await this.gql.load(this.id, afterCursor, this.limit, sortParam, true);

        this.$loader.removeClass('loading');

        if (!category) {
            return;
        }

        const { endCursor, hasNextPage } = category.productsInfo;

        const html = this.generateProductsHtml(category);
        const $html = $(html);

        const $productGridContainer = $content.find('[data-end-cursor]');
        if ($productGridContainer.length > 0) {
            $productGridContainer.data({
                endCursor,
                hasNextPage,
            });
            $productGridContainer.find('.productGrid').append($html.find('.productGrid').children());
        } else {
            $content
                .html($html)
                .data('loaded', true);
        }

        this.initSlick();

        if (hasNextPage) {
            this.$loadMore.show();
        } else {
            this.$loadMore.hide();
        }

        if (endCursor) {
            this.$collapse.show();
        } else {
            this.$collapse.hide();
        }
    }

    loadProductsFromCategoryPage({
        sort = '',
        page = '',
        $content,
    }) {
        const limitQuery = this.limit ? `&limit=${this.limit}` : '';
        const sortQuery = sort ? `&sort=${sort}` : '';
        const pageQuery = page ? `&page=${page}` : '';
        const template = 'papa-supermarket/products-by-category-sorting-tabs/products';
        const url = this.categoryPath ? `${this.categoryPath}?${limitQuery}${sortQuery}${pageQuery}` : `/categories.php?category=${this.id}${limitQuery}${sortQuery}${pageQuery}`;

        this.$loader.addClass('loading');

        utils.api.getPage(url, { template }, (err, resp) => {
            this.$loader.removeClass('loading');

            if (err || !resp) {
                return;
            }

            const $resp = $(resp);

            // Stop if the response contains multiple root elements (server error)
            if ($resp.length > 1) {
                return;
            }

            const $currentPage = $content.find('[data-current-page]');

            if ($currentPage.length > 0) {
                $currentPage.data({
                    currentPage: $resp.data('currentPage'),
                    hasNextPage: Boolean($resp.data('hasNextPage')),
                });
                $currentPage.find('.productGrid').append($resp.find('.productGrid').children());
            } else {
                $content
                    .html(resp)
                    .data('loaded', true);
            }

            this.initSlick();

            if ($resp.data('hasNextPage')) {
                this.$loadMore.show();
            } else {
                this.$loadMore.hide();
            }

            if ($resp.data('currentPage') > 1) {
                this.$collapse.show();
            } else {
                this.$collapse.hide();
            }
        });
    }

    initTabs() {
        foundation(this.$scope);

        const $activeTabContent = this.$scope.find('.tab-content.is-active').data('loaded', true);

        $('[data-tab]', this.$scope).on('toggled', (event, tab) => {
            const $content = $($(tab).find('a').attr('href'));

            if ($content.data('loaded')) {
                const $productGridContainer = $content.find('[data-end-cursor], [data-current-page]');

                if ($productGridContainer.data('hasNextPage')) {
                    this.$loadMore.show();
                } else {
                    this.$loadMore.hide();
                }

                if ($productGridContainer.data('endCursor') || Number($productGridContainer.data('currentPage')) > 1) {
                    this.$collapse.show();
                } else {
                    this.$collapse.hide();
                }

                return;
            }

            this.$loadMore.hide();
            this.$collapse.hide();

            if ($activeTabContent.find('[data-end-cursor]').length > 0) {
                this.loadProducts({
                    sort: $content.data('sort'),
                    $content,
                });
            } else {
                this.loadProductsFromCategoryPage({
                    sort: $content.data('sort'),
                    $content,
                });
            }
        });
    }

    initSlick() {
        // init products carousel
        $('[data-slick]', this.$scope)
            .on('init', e => setTimeout(() => {
                // init nested carousel
                $('[data-slick-nested]', e.target).each((i, el) => {
                    $(el).slick($(el).data('slickNested'));
                });
            }, 200))
            .on('breakpoint', e => setTimeout(() => {
                $('[data-slick-nested]', e.target).slick('setPosition');
            }, 200))
            .slick();
    }

    initBanner() {
        const $img = this.$scope.find('[data-banner] img');
        const src = `/product_images/uploaded_images/products-by-category-${this.index + 1}.jpg?c=2&t=${this.context.configurationId}`;

        if ($img.hasClass('lazyload')) {
            $img.attr('data-src', src);
        } else {
            $img.attr('src', src);
        }
    }

    initButtons() {
        this.$loadMore = this.$scope.find('.loadMore').hide();
        this.$collapse = this.$scope.find('.collapse').hide();

        if (this.$scope.find('.tab-content.is-active').find('[data-end-cursor], [data-current-page]').data('hasNextPage')) {
            this.$loadMore.show();
        }

        this.$loadMore.on('click', this.onLoadMore);
        this.$collapse.on('click', this.onCollapse);
    }

    onLoadMore(event) {
        event.preventDefault();

        const $content = this.$scope.find('.tab-content.is-active');
        const $productGridContainer = $content.find('[data-end-cursor], [data-current-page]');
        const $hide = $content.find('.product.hide');

        if ($hide.length > 0) {
            $hide.show().removeClass('hide');
            this.$collapse.show();

            if (!$productGridContainer.data('hasNextPage')) {
                this.$loadMore.hide();
            }
            return;
        }

        if ($productGridContainer.data('hasNextPage')) {
            const sort = $content.data('sort');
            const afterCursor = $productGridContainer.data('endCursor');
            const page = Number($productGridContainer.data('currentPage'));

            if (afterCursor) {
                this.loadProducts({
                    sort,
                    afterCursor,
                    $content,
                });
            } else if (page) {
                this.loadProductsFromCategoryPage({
                    sort,
                    page: page + 1,
                    $content,
                });
            }
        } else {
            this.$loadMore.hide();
        }
    }

    onCollapse(event) {
        event.preventDefault();

        if (this.limit) {
            const $tab = this.$scope.find('.tab-content.is-active');
            const $hide = $tab.find('.product').slice(this.limit).hide().addClass('hide');

            if ($hide.length > 0) {
                this.$loadMore.show();
            }

            $('html, body').animate({
                scrollTop: $tab.offset().top,
            }, 500);
        }

        this.$collapse.hide();
    }
}

class ProductsByCategories {
    constructor($scope, context) {
        this.$scope = $scope;
        this.lazy = this.$scope.is('[data-lazy]');
        this.context = context;
        this.loaded = false;

        this.onCheckViewport = throttle(this.onCheckViewport.bind(this), 100);

        this.bindEvents();

        if (!this.lazy) {
            this.load();
        }
    }

    load() {
        this.loaded = true;

        const sort = this.$scope.data('sort');
        const limit = this.$scope.data('limit');
        const $skeletons = this.$scope.children('[data-pbcst-skeleton]');

        String(this.$scope.data('pbcstGroup')).split(',').map((idStr, index) => new ProductsByCategory({
            id: Number(idStr.trim()),
            index,
            sort,
            limit,
            $parent: this.$scope,
            $placeholder: $skeletons.eq(index),
            context: this.context,
        }));
    }

    bindEvents() {
        $('body').one('beforeload.instantload', () => this.unbindEvents());

        if (this.lazy) {
            $(window).on('load resize scroll', this.onCheckViewport);
        }
    }

    unbindEvents() {
        $(window).off('load resize scroll', this.onCheckViewport);
    }

    onCheckViewport() {
        if (this.loaded) {
            $(window).off('load resize scroll', this.onCheckViewport);
            return;
        }

        if (!this.$scope.is(':visible')) {
            return;
        }

        const offset = 300;
        const elTop = this.$scope.offset().top;
        const elBottom = elTop + this.$scope.outerHeight();
        const winTop = $(window).scrollTop();
        const winBottom = winTop + $(window).innerHeight();

        if (elTop - offset < winBottom && elBottom + offset > winTop) {
            this.load();
        }
    }
}

export default function init(selector = '[data-pbcst-group]', context) {
    $(selector).each((i, el) => new ProductsByCategories($(el), context));
}
