/**
 * @jest-environment jsdom
 */

import { ProductCardsGraphQLQuery } from '../../emthemes-modez/theme-utils';

// BigCommerce answers a query-layer failure (rate limit, bad token) with HTTP 200 and no `data`.
const GRAPHQL_200_WITH_ERRORS = { errors: [{ message: 'Rate limit exceeded' }] };

const GRAPHQL_200_OK = {
    data: {
        site: {
            products: { edges: [] },
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

/**
 * @param {Promise} promise
 * @returns {Promise<'resolved'|'rejected'|'pending'>}
 */
const outcomeOf = promise => Promise.race([
    promise.then(() => 'resolved', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 50)),
]);

describe('ProductCardsGraphQLQuery.load — GraphQL failure handling', () => {
    let consoleError;
    let gql;

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        gql = new ProductCardsGraphQLQuery({ graphQLToken: 'token', currencyCode: 'USD' });
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('settles when GraphQL answers 200 with errors and no data', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        await expect(outcomeOf(gql.load([1, 2]))).resolves.toBe('resolved');
    });

    it('resolves the failure value when GraphQL answers 200 with errors and no data', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS);

        await expect(gql.load([1, 2])).resolves.toBe('');
        expect(consoleError).toHaveBeenCalled();
    });

    it('caps the response body it logs so an html error page cannot flood the console', async () => {
        const body = JSON.stringify(GRAPHQL_200_WITH_ERRORS).padEnd(20000, ' ');
        $.ajax = asyncSuccess(GRAPHQL_200_WITH_ERRORS, { responseText: body });

        await gql.load([1, 2]);

        const logged = consoleError.mock.calls[0].join(' ');
        expect(logged).toContain('Rate limit exceeded');
        expect(logged.length).toBeLessThan(1000);
    });

    it('settles when a field resolver fails and mapping the response throws', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_PARTIAL_ERROR);

        await expect(outcomeOf(gql.load([1, 2]))).resolves.toBe('resolved');
    });

    it('resolves the failure value when a field resolver fails', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_PARTIAL_ERROR);

        await expect(gql.load([1, 2])).resolves.toBe('');
        expect(consoleError).toHaveBeenCalled();
    });

    it('resolves the failure value when the request itself fails', async () => {
        $.ajax = jest.fn(options => options.error({ status: 500, responseText: 'boom' }));

        await expect(gql.load([1, 2])).resolves.toBe('');
        expect(consoleError).toHaveBeenCalled();
    });

    it('settles when $.ajax throws synchronously', async () => {
        $.ajax = jest.fn(() => {
            throw new Error('no transport');
        });

        await expect(outcomeOf(gql.load([1, 2]))).resolves.toBe('resolved');
        expect(consoleError).toHaveBeenCalled();
    });

    // The three sibling call sites all read `resp.data.site`; this one read `resp.site`, so it
    // threw on a perfectly good response and could never have returned products.
    it('reads the products out of a successful response', async () => {
        $.ajax = asyncSuccess(GRAPHQL_200_OK);

        await expect(gql.load([1, 2])).resolves.toEqual([]);
        expect(consoleError).not.toHaveBeenCalled();
    });
});
