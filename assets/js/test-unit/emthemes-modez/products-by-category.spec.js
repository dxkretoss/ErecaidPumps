/**
 * @jest-environment jsdom
 */

// foundation-sites 5 overwrites jQuery.fn.load and throws under jsdom
jest.mock('../../theme/global/foundation', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('@bigcommerce/stencil-utils', () => ({
    __esModule: true,
    default: {
        api: {
            getPage: jest.fn(),
        },
    },
}));

import utils from '@bigcommerce/stencil-utils';
import init, { ProductsByCategory } from '../../emthemes-modez/products-by-category';

const CATEGORY_ID = 123;

const SECTION_HTML = `
    <div class="emthemesModez-section emthemesModez-section--productsByCategorySortingTabs" data-from-category-page>
        <div class="emthemesModez-section-inner">
            <div class="emthemesModez-productsByCategoryTabs">
                <ul class="tabs" data-tab>
                    <li class="li-heading"><h2 class="page-heading"><a href="/jewelry/">Jewelry</a></h2></li>
                </ul>
                <div class="tabs-contents">
                    <section class="tab-content is-active" data-sort="featured">
                        <div class="emthemesModez-productsByCategoryTabs-products" data-current-page="1">
                            <ul class="productGrid"><li class="product">1</li></ul>
                        </div>
                    </section>
                </div>
                <div class="emthemesModez-productsByCategoryTabs-loader loader"></div>
                <div class="emthemesModez-productsByCategoryTabs-actionGroup">
                    <a href="#" class="button loadMore">Load more</a>
                    <a href="#" class="button collapse">Collapse</a>
                </div>
            </div>
        </div>
    </div>
`;

// BigCommerce answers a query-layer failure (rate limit, bad token) with HTTP 200 and no `data`.
const GRAPHQL_200_WITH_ERRORS = { errors: [{ message: 'Rate limit exceeded' }] };

// A spec-compliant partial error: `data.site.category` is there, one field resolver is not.
// Mapping the products then dereferences `currency.display` and throws.
const GRAPHQL_200_PARTIAL_ERROR = {
    data: {
        site: {
            category: { name: 'Jewelry', path: '/jewelry/' },
            categoryTree: [{ children: [], hasChildren: false }],
            search: { searchProducts: { products: { edges: [], pageInfo: { endCursor: '', hasNextPage: false } } } },
            settings: { tax: { plp: 'EX_TAX' }, inventory: {}, storefront: { catalog: {} } },
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

const context = {
    pbcst_products: 12,
    pbcst_show_featured: true,
    txtFeaturedTab: 'Featured',
    txtLoadMore: 'Load more',
    txtCollapse: 'Collapse',
    graphQLToken: '',
    currencyCode: 'USD',
};

/**
 * Lets pending promise callbacks and the throttled viewport check run.
 * @returns {Promise<void>}
 */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('products-by-category — GraphQL failure handling', () => {
    let consoleError;

    beforeEach(() => {
        document.body.innerHTML = `
            <div data-pbcst-group="${CATEGORY_ID}" data-sort="featured" data-limit="12">
                <div data-pbcst-skeleton class="emthemesModez-section">skeleton</div>
            </div>
        `;
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        $.fn.slick = jest.fn();
        $.ajax = jest.fn(options => options.error());
    });

    afterEach(() => {
        consoleError.mockRestore();
        $(window).off('load resize scroll');
    });

    it('falls back to the category page instead of deleting the section when GraphQL fails', async () => {
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(null, SECTION_HTML));

        init('[data-pbcst-group]', context);
        await flush();

        expect(utils.api.getPage).toHaveBeenCalledTimes(1);
        expect($('[data-pbcst-group]').find('[data-from-category-page]').length).toBe(1);
    });

    it('logs the GraphQL failure instead of swallowing it', async () => {
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(null, SECTION_HTML));

        init('[data-pbcst-group]', context);
        await flush();

        expect(consoleError).toHaveBeenCalled();
    });

    it('logs when the category-page fallback also fails', async () => {
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(new Error('500')));

        init('[data-pbcst-group]', context);
        await flush();

        expect(consoleError.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('caps the response body it logs so an html error page cannot flood the console', async () => {
        $.ajax = jest.fn(options => options.error({ status: 500, responseText: '<html>'.padEnd(20000, 'x') }));
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(null, SECTION_HTML));

        init('[data-pbcst-group]', context);
        await flush();

        const logged = consoleError.mock.calls[0].join(' ');
        expect(logged).toContain('500');
        expect(logged.length).toBeLessThan(1000);
    });

    it('falls back to the category page when the ajax call itself throws', async () => {
        // `new Promise(executor)` turns a synchronous throw into a rejection, so `load()` rejects
        // and `request()` never reaches the fallback — the skeleton would shimmer for good.
        $.ajax = jest.fn(() => {
            throw new Error('ajax blew up');
        });
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(null, SECTION_HTML));

        init('[data-pbcst-group]', context);
        await flush();

        expect(utils.api.getPage).toHaveBeenCalledTimes(1);
        expect($('[data-pbcst-group]').find('[data-from-category-page]').length).toBe(1);
        expect(consoleError).toHaveBeenCalled();
    });

    it('logs the query-layer failure when GraphQL answers 200 with errors and no data', async () => {
        const body = JSON.stringify(GRAPHQL_200_WITH_ERRORS).padEnd(20000, ' ');
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS, { responseText: body });
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(null, SECTION_HTML));

        init('[data-pbcst-group]', context);
        await flush();

        const logged = consoleError.mock.calls
            .map(call => call.join(' '))
            .find(line => line.includes('returned no data'));
        expect(logged).toContain(String(CATEGORY_ID));
        expect(logged).toContain('Rate limit exceeded');
        expect(logged.length).toBeLessThan(1000);
    });
});

describe('products-by-category — giving up', () => {
    let consoleError;

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        $.fn.slick = jest.fn();
        $.ajax = jest.fn(options => options.error());
        utils.api.getPage.mockImplementation((url, opts, cb) => cb(new Error('500')));
    });

    afterEach(() => {
        consoleError.mockRestore();
        $(window).off('load resize scroll');
        document.body.innerHTML = '';
    });

    it('drops the server-rendered skeleton when GraphQL and the category page both fail', async () => {
        document.body.innerHTML = `
            <div data-pbcst-group="${CATEGORY_ID}" data-sort="featured" data-limit="12">
                <div data-pbcst-skeleton class="emthemesModez-section">skeleton</div>
            </div>
        `;

        init('[data-pbcst-group]', context);
        await flush();

        expect($('[data-pbcst-skeleton]').length).toBe(0);
    });

    it('gives up instead of hanging when a field resolver fails and mapping the response throws', async () => {
        document.body.innerHTML = `
            <div data-pbcst-group="${CATEGORY_ID}" data-sort="featured" data-limit="12">
                <div data-pbcst-skeleton class="emthemesModez-section">skeleton</div>
            </div>
        `;
        $.ajax = asyncSuccess(GRAPHQL_200_PARTIAL_ERROR);

        init('[data-pbcst-group]', context);
        await flush();

        expect($('[data-pbcst-skeleton]').length).toBe(0);
        expect(consoleError).toHaveBeenCalled();
    });

    it('drops a client-rendered skeleton when GraphQL and the category page both fail', async () => {
        document.body.innerHTML = `<div data-pbcst-group="${CATEGORY_ID}" data-sort="featured" data-limit="12"></div>`;

        init('[data-pbcst-group]', context);
        await flush();

        expect($('[data-pbcst-group]').children().length).toBe(0);
    });

    it('leaves rendered merchant content alone when asked to give up on it', async () => {
        document.body.innerHTML = `<div data-pbcst-group="${CATEGORY_ID}"></div>`;
        const $parent = $('[data-pbcst-group]');
        const instance = new ProductsByCategory({ id: CATEGORY_ID, $parent, context });
        await flush();

        instance.$scope = $(SECTION_HTML).appendTo($parent);
        instance.giveUp('a future refactor reached giveUp holding real content');

        expect($parent.find('[data-from-category-page]').length).toBe(1);
    });
});
