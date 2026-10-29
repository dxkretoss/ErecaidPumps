/**
 * @jest-environment jsdom
 */

jest.mock('../../emthemes-modez/theme-utils', () => ({
    checkTouchDevice: () => false,
    loadRemoteBanners: jest.fn(),
}));
jest.mock('../../theme/global/modal', () => ({ defaultModal: () => ({}) }));
jest.mock('../../theme/global/quick-view', () => ({ initBulkOrderQuickView: jest.fn() }));
jest.mock('../../theme/global/foundation', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../theme/common/collapsible', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../theme/common/product-details', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('slick-carousel', () => ({}));
jest.mock('@bigcommerce/stencil-utils', () => ({
    __esModule: true,
    default: {
        api: {
            getPage: jest.fn(),
            product: { getById: jest.fn() },
        },
    },
}));

const ORIGIN = 'http://localhost';
const TAB_COUNT = 3;
const PRODUCT_COUNT = 12;

const context = {
    pageType: 'default',
    urls: { home: '/' },
    themeSettings: {
        homepage_show_carousel: true,
        specialProductsTab_init_count: 4,
        homepage_blog_posts_count: 3,
        max_shop_by_brand: 9,
        homepage_expand_categories_menu: false,
        productpage_reviews_count: 5,
        productpage_related_products_count: 5,
        productpage_similar_by_views_count: 5,
        categorypage_products_per_page: 12,
        brandpage_products_per_page: 12,
    },
};

/**
 * @param {String} pageType
 * @param {String} body
 * @returns {String}
 */
function pageHtml(pageType, body) {
    return `
        <div id="instantload-html-element">
            <div id="instantload-head-element"><title>${pageType}</title></div>
            <div id="instantload-body-element" class="papaSupermarket-pageType--${pageType}">
                <div class="body" id="instantload-page-body">${body}</div>
            </div>
        </div>
    `;
}

/**
 * @param {Number} tabs
 * @param {Number} products
 * @param {Boolean} withCategorySection
 * @returns {String}
 */
function homePageHtml(tabs, products, withCategorySection) {
    const tabsHtml = Array.from({ length: tabs }, (v, i) => `<li class="tab">tab-${i}</li>`).join('');
    const productsHtml = Array.from({ length: products }, (v, i) => `<li class="product">product-${i}</li>`).join('');
    return pageHtml('default', `
        <div data-special-products-tabs>
            <ul class="tabs">${tabsHtml}</ul>
            <ul class="productGrid">${productsHtml}</ul>
        </div>
        ${withCategorySection ? '<div data-pbcst-group="123"></div>' : ''}
    `);
}

const PRODUCT_PAGE_HTML = pageHtml('product', '<div class="productView">product</div>');
const CATEGORY_PAGE_HTML = pageHtml('category', '<div class="categoryPage">category</div>');
const BLOG_PAGE_HTML = pageHtml('blog', '<div class="blogPage">blog</div>');

/**
 * Stands in for the origin server: it renders exactly what the stencil-config asks for.
 * @param {String} url
 * @param {Object} config
 * @returns {String}
 */
function render(url, config) {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '') || '/';

    if (/^\/(\?|#|$)/.test(path)) {
        const asksForAllTabs = Boolean(config?.products?.featured && config?.products?.top_sellers);
        return asksForAllTabs
            ? homePageHtml(TAB_COUNT, PRODUCT_COUNT, true)
            : homePageHtml(1, 5, false);
    }

    if (path.startsWith('/jewelry')) {
        return CATEGORY_PAGE_HTML;
    }

    if (path.startsWith('/blog')) {
        return BLOG_PAGE_HTML;
    }

    return PRODUCT_PAGE_HTML;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** A popstate load needs one turn for the event and one for the fetch promise. */
const flushPopstate = async () => {
    await flush();
    await flush();
};

function expectFullHome() {
    expect($('.body .tabs .tab').length).toBe(TAB_COUNT);
    expect($('.body .productGrid .product').length).toBe(PRODUCT_COUNT);
    expect($('.body [data-pbcst-group]').length).toBe(1);
}

describe('InstantLoad', () => {
    let utils;
    let InstantLoad;
    let instance;

    beforeEach(() => {
        // `Preloader.cache` in instant-load.js is a module-level singleton. Resetting the registry
        // per test stops one test's prefetch from silently answering the next test's assertions.
        jest.resetModules();
        /* eslint-disable global-require */
        utils = require('@bigcommerce/stencil-utils').default;
        InstantLoad = require('../../emthemes-modez/instant-load').InstantLoad;
        /* eslint-enable global-require */

        document.body.innerHTML = `
            <div class="body"><h1>home</h1></div>
            <div data-banner-location="top"></div>
            <div data-banner-location="bottom"></div>
        `;
        $.fn.slick = jest.fn();
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(null, render(url, opts.config)));
        window.history.replaceState(null, '', '/');
        instance = new InstantLoad(context);
    });

    afterEach(() => {
        instance.unbindEvents();
    });

    describe('history entries', () => {
        it('stamps the landing entry with the resolved page type of the landing page', () => {
            expect(window.history.state).toEqual({ instantload: true, pageType: 'home' });
        });

        it('stamps a pushed entry with the page type of the destination, not of the current page', async () => {
            instance.loadPage('/shoes/necklace-123/', true, true, 'product');
            await flush();

            expect(window.history.state).toEqual({ instantload: true, pageType: 'product' });
        });

        it('resolves a bare home link with no data-instantload payload', async () => {
            $('body').append('<a id="crumb" data-instantload href="/">Home</a>');
            $('#crumb').trigger('click');
            await flush();

            expect(window.history.state.pageType).toBe('home');
            expect(utils.api.getPage.mock.calls[0][1].config.products.featured).toBeDefined();
        });
    });

    describe('home links that are not a bare "/"', () => {
        it('resolves a home link carrying a query string', async () => {
            $('body').append('<a id="utm" data-instantload href="/?utm_source=fb">Home</a>');
            $('#utm').trigger('click');
            await flush();

            expect(window.history.state.pageType).toBe('home');
            expectFullHome();
        });

        it('resolves a home link carrying a hash', async () => {
            $('body').append('<a id="hash" data-instantload href="/#foo">Home</a>');
            $('#hash').trigger('click');
            await flush();

            expect(window.history.state.pageType).toBe('home');
            expectFullHome();
        });

        it('resolves a home link when the configured home url spells the root differently', async () => {
            instance.unbindEvents();
            // `urls.home` without the trailing slash, link href with it: same page, different string.
            instance = new InstantLoad({ ...context, urls: { home: ORIGIN } });

            $('body').append('<a id="mismatch" data-instantload href="/">Home</a>');
            $('#mismatch').trigger('click');
            await flush();

            expect(window.history.state.pageType).toBe('home');
            expectFullHome();
        });

        it('degrades to the href when the data-instantload payload is not valid json', async () => {
            $('body').append('<a id="broken" data-instantload="{page: not-json," href="/">Home</a>');

            expect(() => $('#broken').trigger('click')).not.toThrow();
            await flush();

            expect(window.history.state.pageType).toBe('home');
            expectFullHome();
        });
    });

    describe('regression: back-navigation restores the full home page', () => {
        it('restores the full home page after a product page', async () => {
            $('body').append('<a id="pdp" data-instantload href="/shoes/necklace-123/">Necklace</a>');
            $('#pdp').trigger('click');
            await flush();
            expect($('.body .productView').length).toBe(1);

            window.history.back();
            await flushPopstate();

            expectFullHome();
        });

        it('restores the full home page after a category page', async () => {
            $('body').append('<a id="cat" data-instantload href="/jewelry/">Jewelry</a>');
            $('#cat').trigger('click');
            await flush();
            expect($('.body .categoryPage').length).toBe(1);

            window.history.back();
            await flushPopstate();

            expectFullHome();
        });

        it('restores the full home page after a blog page', async () => {
            $('body').append('<a id="blog" data-instantload href="/blog/">Blog</a>');
            $('#blog').trigger('click');
            await flush();
            expect($('.body .blogPage').length).toBe(1);

            window.history.back();
            await flushPopstate();

            expectFullHome();
        });

        it('keeps restoring the full home page over five home → product → back cycles', async () => {
            $('body').append('<a id="pdp" data-instantload href="/shoes/necklace-123/">Necklace</a>');

            for (let cycle = 1; cycle <= 5; cycle++) {
                $('#pdp').trigger('click');
                await flush(); // eslint-disable-line no-await-in-loop
                expect($('.body .productView').length).toBe(1);

                window.history.back();
                await flushPopstate(); // eslint-disable-line no-await-in-loop

                expectFullHome();
            }
        });

        it('restores the full home page again after a forward navigation', async () => {
            $('body').append('<a id="pdp" data-instantload href="/shoes/necklace-123/">Necklace</a>');
            $('#pdp').trigger('click');
            await flush();

            window.history.back();
            await flushPopstate();
            expectFullHome();

            window.history.forward();
            await flushPopstate();
            expect($('.body .productView').length).toBe(1);

            window.history.back();
            await flushPopstate();
            expectFullHome();
        });
    });

    describe('preloader cache', () => {
        it('prefetches a bare home link on mouseenter with the home config', async () => {
            $('body').append('<a id="crumb" data-instantload href="/?ref=hover">Home</a>');
            $('#crumb').trigger('mouseenter');
            await flush();

            expect(utils.api.getPage.mock.calls[0][1].config.products.top_sellers).toBeDefined();

            $('#crumb').trigger('click');
            await flush();

            expect($('.body .tabs .tab').length).toBe(TAB_COUNT);
        });

        it('does not serve a prefetch made with a different config', async () => {
            const url = '/?ref=prefetch-only';

            instance.loadPage(url, false, false, 'product');
            await flush();

            instance.loadPage(url, true, false, 'home');
            await flush();

            expect(utils.api.getPage).toHaveBeenCalledTimes(2);
            expect($('.body .tabs .tab').length).toBe(TAB_COUNT);
        });

        it('does not let one link\'s hover prefetch answer another link\'s click on the same url', async () => {
            // Same href, different declared page type, so different stencil-config.
            $('body').append('<a id="asPdp" data-instantload=\'{"page":"product"}\' href="/?ref=shared">A</a>');
            $('body').append('<a id="asHome" data-instantload=\'{"page":"home"}\' href="/?ref=shared">B</a>');

            $('#asPdp').trigger('mouseenter');
            await flush();
            expect(utils.api.getPage.mock.calls[0][1].config.products.top_sellers).toBeUndefined();

            $('#asHome').trigger('mouseenter');
            await flush();
            expect(utils.api.getPage).toHaveBeenCalledTimes(2);
            expect(utils.api.getPage.mock.calls[1][1].config.products.top_sellers).toBeDefined();

            $('#asHome').trigger('click');
            await flush();

            // Served from B's own cache entry, not A's, and without a third request.
            expect(utils.api.getPage).toHaveBeenCalledTimes(2);
            expectFullHome();
        });
    });
});
