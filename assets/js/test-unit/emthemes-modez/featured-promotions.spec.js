/**
 * @jest-environment jsdom
 */

import mustache from 'mustache';
import {
    isFeaturedPromotionsFieldError,
    isFeaturedPromotionsUnsupported,
    mapFeaturedPromotions,
    postProductCardsQuery,
    productCardTemplate,
    ProductCardsGraphQLQuery,
} from '../../emthemes-modez/theme-utils';

// What a store that has not been given Featured Promotions yet answers: HTTP 200, no `data`,
// and the whole query rejected — every product of the widget is gone, not only the callout.
const ROLLOUT_REJECTION = {
    errors: [{ message: 'Cannot query field "featuredPromotions" on type "Product".' }],
};

const OTHER_REJECTION = { errors: [{ message: 'Rate limit exceeded' }] };

const OK = { data: { site: {} } };

/**
 * jQuery resolves ajax callbacks asynchronously; a synchronous mock would turn a throw inside
 * `success:` into a rejection instead of a promise that never settles.
 * @param {Object[]} payloads One payload per expected call, in order
 * @returns {jest.Mock}
 */
const asyncSuccessSequence = (...payloads) => jest.fn(options => {
    const payload = payloads.shift();
    setTimeout(() => options.success(payload, 'success', {}), 0);
});

const buildQuery = field => `query { site { products { edges { node { entityId${field} } } } } }`;

const post = () => postProductCardsQuery({
    graphQLToken: 'token',
    label: 'test-widget',
    variables: {},
    buildQuery,
});

const sentQueries = ajax => ajax.mock.calls.map(([options]) => JSON.parse(options.data).query);

describe('featuredPromotions rollout guard', () => {
    let consoleWarn;

    beforeEach(() => {
        window.sessionStorage.clear();
        consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleWarn.mockRestore();
    });

    it('recognises the rollout rejection and ignores unrelated errors', () => {
        expect(isFeaturedPromotionsFieldError(ROLLOUT_REJECTION)).toBe(true);
        expect(isFeaturedPromotionsFieldError(OTHER_REJECTION)).toBe(false);
        expect(isFeaturedPromotionsFieldError(OK)).toBe(false);
        expect(isFeaturedPromotionsFieldError(null)).toBe(false);
    });

    it('asks for the field on a fresh session', async () => {
        $.ajax = asyncSuccessSequence(OK);

        await post();

        expect(sentQueries($.ajax)[0]).toContain('featuredPromotions');
    });

    it('retries without the field so the widget still gets its products', async () => {
        $.ajax = asyncSuccessSequence(ROLLOUT_REJECTION, OK);

        const { resp } = await post();

        const queries = sentQueries($.ajax);
        expect(queries).toHaveLength(2);
        expect(queries[0]).toContain('featuredPromotions');
        expect(queries[1]).not.toContain('featuredPromotions');
        expect(resp).toBe(OK);
    });

    it('remembers the rejection for the rest of the session', async () => {
        $.ajax = asyncSuccessSequence(ROLLOUT_REJECTION, OK);
        await post();

        expect(isFeaturedPromotionsUnsupported()).toBe(true);

        $.ajax = asyncSuccessSequence(OK);
        await post();

        expect(sentQueries($.ajax)[0]).not.toContain('featuredPromotions');
    });

    it('does not retry when the query failed for an unrelated reason', async () => {
        $.ajax = asyncSuccessSequence(OTHER_REJECTION);

        await post();

        expect($.ajax).toHaveBeenCalledTimes(1);
        expect(isFeaturedPromotionsUnsupported()).toBe(false);
    });
});

describe('mapFeaturedPromotions', () => {
    it('returns an empty list when the store answered without the field', () => {
        expect(mapFeaturedPromotions(undefined)).toEqual([]);
        expect(mapFeaturedPromotions(null)).toEqual([]);
        expect(mapFeaturedPromotions({})).toEqual([]);
        expect(mapFeaturedPromotions({ edges: [] })).toEqual([]);
    });

    it('re-sorts by priority — GraphQL makes no ordering promise', () => {
        const promotions = mapFeaturedPromotions({
            edges: [
                { node: { entityId: 2, text: 'Second', priority: 20 } },
                { node: { entityId: 1, text: 'First', priority: 10 } },
            ],
        });

        expect(promotions.map(p => p.text)).toEqual(['First', 'Second']);
    });

    it('drops promotions with no sentence to show', () => {
        const promotions = mapFeaturedPromotions({
            edges: [
                { node: { entityId: 1, text: '', priority: 10 } },
                { node: null },
                { node: { entityId: 2, text: 'Save 15%', priority: 20 } },
            ],
        });

        expect(promotions).toEqual([{ entityId: 2, text: 'Save 15%', priority: 20 }]);
    });
});

describe('ProductCardsGraphQLQuery.mapGraphQLProducts — promotion fields', () => {
    const siteSettings = { tax: { plp: 'EX' }, inventory: {}, storefront: { catalog: {} } };
    const siteCurrency = {
        display: {
            symbol: '$', symbolPlacement: 'Left', decimalToken: '.', thousandsToken: ',', decimalPlaces: 2,
        },
    };

    const productNode = featuredPromotions => ({
        entityId: 1,
        name: 'Coffee',
        path: '/coffee/',
        images: { edges: [] },
        brand: null,
        reviewSummary: null,
        productOptions: { edges: [] },
        availabilityV2: { status: 'Available' },
        inventory: { isInStock: true },
        customFields: { edges: [] },
        featuredPromotions,
    });

    const mapOne = (options, featuredPromotions) => new ProductCardsGraphQLQuery(options)
        .mapGraphQLProducts({ edges: [{ node: productNode(featuredPromotions) }] }, siteSettings, siteCurrency)[0];

    const twoPromotions = {
        edges: [
            { node: { entityId: 1, text: 'Save 15%', priority: 10 } },
            { node: { entityId: 2, text: 'Free shipping', priority: 20 } },
        ],
    };

    it('renders nothing when the setting is off, whatever the store returned', () => {
        const product = mapOne({ show_featured_promotions: false }, twoPromotions);

        expect(product.featuredPromotions).toEqual([]);
        expect(product.featuredPromotion).toBeNull();
        expect(mustache.render(productCardTemplate, product)).not.toContain('promotionCallout');
    });

    it('shows the top promotion plus a pluralised "+N more offers"', () => {
        const product = mapOne({
            show_featured_promotions: true,
            txtMoreOfferOne: 'more offer',
            txtMoreOffersOther: 'more offers',
        }, twoPromotions);

        expect(product.featuredPromotion.text).toBe('Save 15%');
        expect(product.morePromotionsCount).toBe(1);

        const html = mustache.render(productCardTemplate, product);
        expect(html).toContain('Save 15%');
        expect(html).toContain('+1 more offer');
        expect(html).not.toContain('+1 more offers');
    });

    it('uses the plural form past one extra offer', () => {
        const product = mapOne({
            show_featured_promotions: true,
            txtMoreOfferOne: 'more offer',
            txtMoreOffersOther: 'more offers',
        }, {
            edges: [
                ...twoPromotions.edges,
                { node: { entityId: 3, text: 'Buy one get one', priority: 30 } },
            ],
        });

        expect(mustache.render(productCardTemplate, product)).toContain('+2 more offers');
    });

    it('renders no callout markup for a product with no promotion', () => {
        const product = mapOne({ show_featured_promotions: true }, { edges: [] });

        expect(mustache.render(productCardTemplate, product)).not.toContain('promotionCallout');
    });

    it('escapes merchant html instead of executing it', () => {
        const product = mapOne({ show_featured_promotions: true }, {
            edges: [{ node: { entityId: 1, text: '<img src=x onerror="alert(1)">', priority: 10 } }],
        });

        const html = mustache.render(productCardTemplate, product);
        const callout = html.slice(html.indexOf('promotionCallout-text'));

        expect(callout).not.toContain('<img');
        expect(callout).not.toContain('onerror="');
        expect(callout).toContain('&lt;img');
    });
});
