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

const context = {
    graphQLToken: 'token',
    currencyCode: 'USD',
};

// BigCommerce answers a query-layer failure (rate limit, bad token) with HTTP 200 and no `data`.
const GRAPHQL_200_WITH_ERRORS = { errors: [{ message: 'Rate limit exceeded' }] };

const GRAPHQL_200_OK = {
    data: {
        site: {
            products: { edges: [] },
            settings: { tax: { plp: 'EX_TAX' } },
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

// A spec-compliant partial error: `data.site` is there, one field resolver is not. Reading the
// currency then dereferences `currency.display` and throws.
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

/**
 * Distinguishes the three outcomes the caller can see. `onDropdownOpened` is bound straight to a
 * jQuery event, so nothing awaits it and nothing catches it: a rejection strands the dropdown
 * exactly as a pending promise does, and both must be told apart from a clean resolve.
 * @param {Promise} promise
 * @returns {Promise<'resolved'|'rejected'|'pending'>}
 */
const outcomeOf = promise => Promise.race([
    promise.then(() => 'resolved', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 50)),
]);

/**
 * `instance` and `cache` are module-scoped singletons, so every test needs a fresh module.
 * @returns {Object} The RecentlyViewedProducts instance
 */
function loadInstance() {
    let instance;
    jest.isolateModules(() => {
        // eslint-disable-next-line global-require
        const init = require('../../emthemes-modez/recently-viewed-products').default;
        instance = init(context);
    });
    return instance;
}

describe('recently-viewed-products — GraphQL failure handling', () => {
    let consoleError;
    let instance;
    let $dropdown;

    beforeEach(() => {
        document.body.innerHTML = `
            <a data-dropdown="recently-viewed-dropdown" title="Recently Viewed"></a>
            <div id="recently-viewed-dropdown"></div>
        `;
        window.localStorage.clear();
        window.localStorage.setItem('supermarket_recentlyViewedProducts', JSON.stringify([1, 2]));
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        instance = loadInstance();
        $dropdown = $('#recently-viewed-dropdown');
    });

    afterEach(() => {
        consoleError.mockRestore();
        $('body').off('productviewed');
    });

    it('settles when GraphQL answers 200 with errors and no data', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        await expect(outcomeOf(instance.onDropdownOpened({}, $dropdown))).resolves.toBe('resolved');
    });

    it('releases the dropdown spinner when GraphQL answers 200 with errors and no data', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        await outcomeOf(instance.onDropdownOpened({}, $dropdown));

        expect($dropdown.hasClass('is-loading')).toBe(false);
        expect($dropdown.find('.loadingOverlay').length).toBe(0);
    });

    it('logs the query-layer failure, capped so an html error page cannot flood the console', async () => {
        const body = JSON.stringify(GRAPHQL_200_WITH_ERRORS).padEnd(20000, ' ');
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS, { responseText: body });

        await outcomeOf(instance.onDropdownOpened({}, $dropdown));

        const logged = consoleError.mock.calls[0].join(' ');
        expect(logged).toContain('Rate limit exceeded');
        expect(logged.length).toBeLessThan(1000);
    });

    it('settles when a field resolver fails and reading the response throws', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_PARTIAL_ERROR);

        await expect(outcomeOf(instance.onDropdownOpened({}, $dropdown))).resolves.toBe('resolved');
    });

    it('releases the dropdown spinner when a field resolver fails', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_PARTIAL_ERROR);

        await outcomeOf(instance.onDropdownOpened({}, $dropdown));

        expect($dropdown.hasClass('is-loading')).toBe(false);
        expect($dropdown.find('.loadingOverlay').length).toBe(0);
        expect(consoleError).toHaveBeenCalled();
    });

    it('settles when $.ajax throws synchronously', async () => {
        $.ajax = jest.fn(() => {
            throw new Error('no transport');
        });

        await expect(outcomeOf(instance.onDropdownOpened({}, $dropdown))).resolves.toBe('resolved');
        expect($dropdown.hasClass('is-loading')).toBe(false);
    });

    it('still renders the dropdown when GraphQL succeeds', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_OK);

        await outcomeOf(instance.onDropdownOpened({}, $dropdown));

        expect($dropdown.hasClass('is-loading')).toBe(false);
        expect($dropdown.html()).toContain('Recently Viewed');
        expect(consoleError).not.toHaveBeenCalled();
    });
});
