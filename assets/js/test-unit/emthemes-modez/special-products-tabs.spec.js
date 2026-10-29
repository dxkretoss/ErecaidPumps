/**
 * @jest-environment jsdom
 */

import mustache from 'mustache';
import init from '../../emthemes-modez/special-products-tabs';

const context = {
    themeSettings: {
        specialProductsTab_init_count: 4,
        specialProductsTab_lazy_count: 8,
        specialProductsTab_more: true,
    },
    graphQLToken: '',
    currencyCode: 'USD',
};

// BigCommerce answers a query-layer failure (rate limit, bad token) with HTTP 200 and no `data`.
const GRAPHQL_200_WITH_ERRORS = { errors: [{ message: 'Rate limit exceeded' }] };

const GRAPHQL_200_OK = {
    data: {
        site: {
            newestProducts: { edges: [], pageInfo: { endCursor: '', hasNextPage: false } },
            settings: { tax: { plp: 'EX_TAX' }, inventory: {}, storefront: { catalog: {} } },
            currency: {
                display: {
                    symbol: '$',
                    symbolPlacement: 'Left',
                    decimalToken: '.',
                    thousandsToken: ',',
                    decimalPlaces: 2,
                },
            },
        },
    },
};

// A spec-compliant partial error: `data.site` is there, one field resolver is not. Mapping the
// products then dereferences `currency.display` and throws.
const GRAPHQL_200_PARTIAL_ERROR = {
    data: {
        site: {
            ...GRAPHQL_200_OK.data.site,
            currency: null,
        },
    },
    errors: [{ message: 'Not authorised', path: ['site', 'currency'] }],
};

/**
 * jQuery resolves ajax callbacks asynchronously; a synchronous mock would hide a throw inside
 * `success:` by turning it into a promise rejection instead of a promise that never settles.
 * @param {Object} payload
 * @param {Object} [xhr] The jqXHR jQuery hands to `success` as its third argument
 * @returns {jest.Mock}
 */
const asyncSuccess = (payload, xhr) => jest.fn(options => {
    setTimeout(() => options.success(payload, 'success', xhr), 0);
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Makes the first `mustache.render` call throw, then hands later calls back to the real one.
 * @returns {jest.SpyInstance} Restore it in a `finally`
 */
function failFirstRender() {
    const real = mustache.render;
    let thrown = false;

    return jest.spyOn(mustache, 'render').mockImplementation((...args) => {
        if (!thrown) {
            thrown = true;
            throw new Error('template blew up');
        }
        return real.apply(mustache, args);
    });
}

/**
 * @returns {JQuery} The SpecialProductsTabs instance scope
 */
function setupDom() {
    document.body.innerHTML = `
        <div data-special-products-tabs>
            <div class="loading"></div>
            <div class="tab-content is-active" data-product-type="new">
                <ul class="productGrid">
                    <li class="product" data-product-id="1">a</li>
                    <li class="product" data-skeleton-placeholder></li>
                    <li class="product" data-skeleton-placeholder></li>
                </ul>
                <span data-viewport-check="new"></span>
            </div>
            <a href="#" class="loadMore">Load more</a>
            <a href="#" class="collapse">Collapse</a>
        </div>
    `;
    return $('[data-special-products-tabs]');
}

/**
 * @returns {String} A tab panel grid: the server-rendered products plus the reserved lazy slots
 */
function gridSlots() {
    return [
        ...Array.from({ length: 4 }, (_, i) => `<li class="product" data-product-id="${i + 1}"></li>`),
        ...Array.from({ length: 8 }, () => '<li class="product" data-skeleton-placeholder></li>'),
    ].join('');
}

/**
 * Mirrors the shipped template: two tab panels, the sentinel under each grid.
 * @returns {JQuery} The SpecialProductsTabs instance scope
 */
function setupTabsDom() {
    // The theme hides inactive panels with `.tab-content { display: none }`. jsdom loads no
    // stylesheet, so the inline equivalent below is what keeps them `:hidden` here.
    document.body.innerHTML = `
        <div data-special-products-tabs>
            <ul class="tabs" data-tab>
                <li class="tab is-active"><a href="#tab-featured-products">Featured</a></li>
                <li class="tab"><a href="#tab-bestselling-products">Popular</a></li>
            </ul>
            <div class="tabs-contents">
                <section class="tab-content is-active" id="tab-featured-products" data-product-type="featured">
                    <ul class="productGrid">${gridSlots()}</ul>
                    <div data-viewport-check="featured"></div>
                </section>
                <section class="tab-content" id="tab-bestselling-products" data-product-type="top" style="display:none">
                    <ul class="productGrid">${gridSlots()}</ul>
                    <div data-viewport-check="top"></div>
                </section>
            </div>
            <div class="loading"></div>
            <a href="#" class="loadMore">Load more</a>
            <a href="#" class="collapse">Collapse</a>
        </div>
    `;
    return $('[data-special-products-tabs]');
}

/**
 * Replaces the layout jQuery reads, so a test can place a panel and the sentinel that sits
 * under its grid independently. jsdom runs no layout engine, so every real measurement is 0.
 * @param {Object} viewport `{ scrollTop, height }`
 * @param {Array} boxes `[selector, { top, height }]` pairs, first match wins
 * @returns {Array} The spies, to restore in an `afterEach`
 */
function stubLayout(viewport, boxes) {
    const boxOf = el => (boxes.find(([selector]) => $(el).is(selector)) || [null, { top: 0, height: 0 }])[1];

    return [
        jest.spyOn($.fn, 'offset').mockImplementation(function offset() {
            return { top: boxOf(this[0]).top, left: 0 };
        }),
        jest.spyOn($.fn, 'outerHeight').mockImplementation(function outerHeight() {
            return boxOf(this[0]).height;
        }),
        jest.spyOn($.fn, 'scrollTop').mockImplementation(function scrollTop() {
            return this[0] === window ? viewport.scrollTop : 0;
        }),
        jest.spyOn($.fn, 'innerHeight').mockImplementation(function innerHeight() {
            return this[0] === window ? viewport.height : boxOf(this[0]).height;
        }),
    ];
}

/**
 * Emulates what Foundation's tab plugin does before it fires `toggled`: swap `is-active` and,
 * through CSS the fixture stands in for, the panel's visibility.
 * @param {JQuery} $scope
 * @param {String} panelId
 */
function activatePanel($scope, panelId) {
    $scope.find('.tab-content').removeClass('is-active').css('display', 'none');
    $scope.find(panelId).addClass('is-active').css('display', '');
}

/**
 * @returns {Array} The product type of every GraphQL request dispatched so far
 */
function requestedTypes() {
    return $.ajax.mock.calls.map(([options]) => {
        const { query } = JSON.parse(options.data);

        if (query.includes('featuredProducts(')) return 'featured';
        if (query.includes('bestSellingProducts(')) return 'top';
        if (query.includes('newestProducts(')) return 'new';
        return 'unknown';
    });
}

describe('special-products-tabs — lazy load trigger', () => {
    let $scope;
    let instance;
    let spies = [];

    beforeEach(() => {
        $scope = setupTabsDom();
        $.fn.slick = jest.fn();
        // Never settles: these tests assert what was dispatched, not what came back.
        $.ajax = jest.fn();
    });

    afterEach(() => {
        spies.forEach(spy => spy.mockRestore());
        spies = [];
        $(window).off('load resize scroll');
        $('body').off('beforeload.instantload');
    });

    /**
     * @param {Object} viewport
     * @param {Array} boxes
     */
    function start(viewport, boxes) {
        spies = stubLayout(viewport, boxes);
        init({ context });
        instance = $scope.data('specialProductsTabsInstance');
    }

    it('dispatches the lazy fetch at 375px, where the reserved slots push the sentinel a screen and a half below the fold', () => {
        // 2 columns x 6 rows of cards = a 2084px panel, so the sentinel under the grid sits at
        // 3084 while the fold is at 1212 — the section itself is on screen the whole time.
        start({ scrollTop: 400, height: 812 }, [
            ['#tab-featured-products', { top: 1000, height: 2084 }],
            ['[data-viewport-check]', { top: 3084, height: 0 }],
        ]);

        $(window).trigger('scroll');

        expect(requestedTypes()).toEqual(['featured']);
    });

    it('hydrates a panel opened by a tab click, with no further scrolling', () => {
        start({ scrollTop: 900, height: 812 }, [
            ['.tab-content', { top: 1000, height: 2084 }],
            ['[data-viewport-check]', { top: 3084, height: 0 }],
        ]);

        activatePanel($scope, '#tab-bestselling-products');
        instance.onTabToggled({}, $scope.find('.tab').eq(1));

        expect(requestedTypes()).toEqual(['top']);
    });

    it('hydrates a clicked tab even after an earlier scroll has already spent the throttle window', async () => {
        start({ scrollTop: 900, height: 812 }, [
            ['.tab-content', { top: 1000, height: 2084 }],
            ['[data-viewport-check]', { top: 3084, height: 0 }],
        ]);

        $(window).trigger('scroll');
        await new Promise(resolve => setTimeout(resolve, 150));

        activatePanel($scope, '#tab-bestselling-products');
        instance.onTabToggled({}, $scope.find('.tab').eq(1));

        expect(requestedTypes()).toEqual(['featured', 'top']);
    });

    it('leaves a panel that has never been shown alone', () => {
        start({ scrollTop: 400, height: 812 }, [
            ['.tab-content', { top: 1000, height: 2084 }],
            ['[data-viewport-check]', { top: 3084, height: 0 }],
        ]);

        $(window).trigger('scroll');

        expect(requestedTypes()).not.toContain('top');
        expect($scope.find('[data-viewport-check="top"]')).toHaveLength(1);
    });

    it('still hydrates the tab that is active at parse time', () => {
        start({ scrollTop: 0, height: 900 }, [
            ['#tab-featured-products', { top: 200, height: 900 }],
            ['[data-viewport-check]', { top: 1100, height: 0 }],
        ]);

        $(window).trigger('scroll');

        expect(requestedTypes()).toEqual(['featured']);
    });

    it('does not fetch while the section is still far below the fold', () => {
        start({ scrollTop: 0, height: 812 }, [
            ['.tab-content', { top: 4000, height: 2084 }],
            ['[data-viewport-check]', { top: 6084, height: 0 }],
        ]);

        $(window).trigger('scroll');

        expect($.ajax).not.toHaveBeenCalled();
    });

    it('spends no request on a sentinel with no panel around it', () => {
        // The panel doubles as the container the products are appended to, so a sentinel outside
        // one would fetch a full page of products into an empty set and drop every one of them.
        $scope.find('[data-viewport-check="top"]').remove();
        $scope.find('[data-viewport-check="featured"]').appendTo($scope);

        start({ scrollTop: 400, height: 812 }, [
            ['[data-viewport-check]', { top: 400, height: 0 }],
        ]);

        $(window).trigger('scroll');

        expect($.ajax).not.toHaveBeenCalled();
        expect($scope.find('[data-viewport-check="featured"]')).toHaveLength(1);
    });
});

describe('special-products-tabs — GraphQL failure handling', () => {
    let consoleError;
    let $scope;
    let instance;

    beforeEach(() => {
        $scope = setupDom();
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        $.fn.slick = jest.fn();
        $.ajax = jest.fn(options => options.error());

        init({ context });
        instance = $scope.data('specialProductsTabsInstance');
    });

    afterEach(() => {
        consoleError.mockRestore();
        $(window).off('load resize scroll');
        $('body').off('beforeload.instantload');
    });

    it('keeps the skeleton placeholders when the lazy fetch fails', async () => {
        await instance.loadViewportProducts('new', $scope.find('.productGrid'));

        expect($scope.find('[data-skeleton-placeholder]').length).toBe(2);
        expect(consoleError).toHaveBeenCalled();
    });

    it('stops the placeholders left by a failed lazy fetch from reading as still loading', async () => {
        await instance.loadViewportProducts('new', $scope.find('.productGrid'));

        expect($scope.find('[data-skeleton-placeholder].emthemesModez-pbcSkeleton--inert').length).toBe(2);
    });

    it('removes the skeleton placeholders once the lazy fetch succeeds', async () => {
        $.ajax = jest.fn(options => options.success(GRAPHQL_200_OK));

        await instance.loadViewportProducts('new', $scope.find('.productGrid'));

        expect($scope.find('[data-skeleton-placeholder]').length).toBe(0);
    });

    it('caps the response body it logs so an html error page cannot flood the console', async () => {
        $.ajax = jest.fn(options => options.error({ status: 500, responseText: '<html>'.padEnd(20000, 'x') }));

        await instance.loadViewportProducts('new', $scope.find('.productGrid'));

        const logged = consoleError.mock.calls[0].join(' ');
        expect(logged).toContain('500');
        expect(logged.length).toBeLessThan(1000);
    });

    it('does not latch "load more" as done when its fetch fails', async () => {
        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        const $tab = $scope.find('.tab-content.is-active');
        expect($tab.data('loadedMore')).toBeFalsy();
        expect(instance.$loadMore.attr('disabled')).toBeUndefined();
        expect(consoleError).toHaveBeenCalled();
    });

    it('releases "load more" when GraphQL answers 200 with errors and no data', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        const $tab = $scope.find('.tab-content.is-active');
        expect($tab.data('loadingMore')).toBeFalsy();
        expect($tab.data('loadedMore')).toBeFalsy();
        expect(instance.$loadMore.attr('disabled')).toBeUndefined();
        expect(instance.$loading.css('display')).toBe('none');
    });

    it('still answers a second "load more" click after a 200 with errors', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        instance.onLoadMore({ preventDefault: () => {} });
        await flush();
        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        expect($.ajax).toHaveBeenCalledTimes(2);
    });

    it('logs the query-layer failure when GraphQL answers 200 with errors and no data', async () => {
        const body = JSON.stringify(GRAPHQL_200_WITH_ERRORS).padEnd(20000, ' ');
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS, { responseText: body });

        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        const logged = consoleError.mock.calls[0].join(' ');
        expect(logged).toContain('Rate limit exceeded');
        expect(logged.length).toBeLessThan(1000);
    });

    it('releases "load more" when a field resolver fails and mapping the response throws', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_PARTIAL_ERROR);

        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        const $tab = $scope.find('.tab-content.is-active');
        expect($tab.data('loadingMore')).toBeFalsy();
        expect($tab.data('loadedMore')).toBeFalsy();
        expect(instance.$loadMore.attr('disabled')).toBeUndefined();
        expect(instance.$loading.css('display')).toBe('none');
        expect(consoleError).toHaveBeenCalled();
    });

    it('keeps the skeleton placeholders when the lazy fetch answers 200 with errors', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        await instance.loadViewportProducts('new', $scope.find('.productGrid'));

        expect($scope.find('[data-skeleton-placeholder]').length).toBe(2);
    });

    it('clears the reserved slots once "load more" has taken the grid over', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_OK);

        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        expect($scope.find('.tab-content.is-active').data('loadedMore')).toBe(true);
        expect($scope.find('[data-skeleton-placeholder]').length).toBe(0);
    });

    it('leaves no inert ghost slots when a viewport fetch fails after "load more" took over', async () => {
        // Race: the viewport fetch is still in flight when the shopper clicks SHOW MORE, and
        // load-more lands first. Marking the leftover slots inert would strand faded grey tiles
        // in front of the real products for the rest of the session.
        let failViewport;
        $.ajax = jest.fn(options => {
            if ($.ajax.mock.calls.length === 1) {
                failViewport = () => options.error({ status: 500 });
            } else {
                setTimeout(() => options.success(GRAPHQL_200_OK, 'success', undefined), 0);
            }
        });

        const viewport = instance.loadViewportProducts('new', $scope.find('.productGrid'));
        instance.onLoadMore({ preventDefault: () => {} });
        await flush();

        failViewport();
        await viewport;

        expect($scope.find('.emthemesModez-pbcSkeleton--inert').length).toBe(0);
    });

    it('logs instead of rejecting when the ajax call itself throws', async () => {
        // `new Promise(executor)` turns a synchronous throw into a rejection, so `load()` rejects
        // rather than resolving to the falsy value every caller is written to expect.
        $.ajax = jest.fn(() => {
            throw new Error('ajax blew up');
        });

        await expect(instance.loadViewportProducts('new', $scope.find('.productGrid'))).resolves.toBeUndefined();

        expect($scope.find('[data-skeleton-placeholder]').length).toBe(2);
        expect(consoleError).toHaveBeenCalled();
    });

    it('logs instead of rejecting when rendering the lazy products throws', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_OK);
        const render = failFirstRender();

        try {
            await expect(instance.loadViewportProducts('new', $scope.find('.productGrid'))).resolves.toBeUndefined();
        } finally {
            render.mockRestore();
        }

        expect(consoleError).toHaveBeenCalled();
    });

    it('does not latch "load more" as done when rendering the products throws', async () => {
        // The latch decides which branch the NEXT click takes. Setting it before the render means a
        // throw leaves it latched, and every later click silently falls into the reveal-hidden
        // branch that has nothing to reveal.
        $.ajax = asyncSuccess(GRAPHQL_200_OK);
        const render = failFirstRender();
        const $tab = $scope.find('.tab-content.is-active');

        try {
            instance.onLoadMore({ preventDefault: () => {} });
            await flush();

            expect($tab.data('loadedMore')).toBeFalsy();
            expect(instance.$loadMore.attr('disabled')).toBeUndefined();
            expect(consoleError).toHaveBeenCalled();

            render.mockClear();

            instance.onLoadMore({ preventDefault: () => {} });
            await flush();

            expect(render).toHaveBeenCalled();
            expect($tab.data('loadedMore')).toBe(true);
        } finally {
            render.mockRestore();
        }
    });

    it('fires one request for a rapid double click on "load more", and latches only on success', async () => {
        let respond;
        $.ajax = jest.fn(options => {
            respond = () => options.success(GRAPHQL_200_OK);
        });

        instance.onLoadMore({ preventDefault: () => {} });
        instance.onLoadMore({ preventDefault: () => {} });

        const $tab = $scope.find('.tab-content.is-active');
        expect($.ajax).toHaveBeenCalledTimes(1);
        expect(instance.$loadMore.attr('disabled')).toBe('disabled');
        expect($tab.data('loadedMore')).toBeFalsy();

        respond();
        await flush();

        expect($.ajax).toHaveBeenCalledTimes(1);
        expect($tab.data('loadingMore')).toBeFalsy();
        expect($tab.data('loadedMore')).toBe(true);
        expect(instance.$loadMore.attr('disabled')).toBeUndefined();
    });
});
