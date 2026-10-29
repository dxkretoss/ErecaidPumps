/**
 * @jest-environment jsdom
 */

import { isHomeUrl, resolvePageType, buildPageCacheKey } from '../../emthemes-modez/instant-load-utils';

const ORIGIN = 'http://localhost';

describe('isHomeUrl', () => {
    it.each([
        ['/', '/'],
        ['', '/'],
        [`${ORIGIN}/`, '/'],
        [`${ORIGIN}`, '/'],
        ['/?utm_source=newsletter', '/'],
        ['/#top', '/'],
        ['/?a=1#top', '/'],
    ])('treats %s as the home page when home is %s', (url, home) => {
        expect(isHomeUrl(url, home)).toBe(true);
    });

    it.each([
        ['/shoes/necklace-123/', '/'],
        ['/jewelry/', '/'],
        ['/blog', '/'],
        ['https://other.example.com/', '/'],
        ['/search.php?search_query=ring', '/'],
    ])('does not treat %s as the home page', (url, home) => {
        expect(isHomeUrl(url, home)).toBe(false);
    });

    it('honours a store home path that is not the origin root', () => {
        expect(isHomeUrl('/shop/', '/shop/')).toBe(true);
        expect(isHomeUrl('/shop', '/shop/')).toBe(true);
        expect(isHomeUrl('/', '/shop/')).toBe(false);
    });

    it('accepts a Location object', () => {
        expect(isHomeUrl(window.location, '/')).toBe(true);
    });

    it('returns false for an unusable url', () => {
        expect(isHomeUrl(null, '/')).toBe(false);
        expect(isHomeUrl(undefined, '/')).toBe(false);
    });
});

describe('resolvePageType', () => {
    it('keeps the page type declared on the link', () => {
        expect(resolvePageType('/', 'home', '/')).toBe('home');
        expect(resolvePageType('/jewelry/', 'category', '/')).toBe('category');
    });

    it('resolves a bare home link with no declared page type', () => {
        expect(resolvePageType('/', null, '/')).toBe('home');
        expect(resolvePageType(`${ORIGIN}/?utm_source=x`, undefined, '/')).toBe('home');
    });

    it('returns null for a non-home link with no declared page type', () => {
        expect(resolvePageType('/shoes/necklace-123/', null, '/')).toBeNull();
        expect(resolvePageType('/jewelry/', null, '/')).toBeNull();
    });

    it('normalises the storefront default page type of the landing entry', () => {
        expect(resolvePageType('/', 'default', '/')).toBe('home');
        expect(resolvePageType('/jewelry/', 'default', '/')).toBe('default');
    });

    it('drops a declared home page type on a url that is not the home page', () => {
        // The home stencil-config omits product.reviews / related_products / similar_by_views,
        // so trusting a mislabelled link would fetch a PDP with a config that guts it.
        expect(resolvePageType('/shoes/necklace-123/', 'home', '/')).toBeNull();
        expect(resolvePageType('/jewelry/', 'home', '/')).toBeNull();
        expect(resolvePageType('/', 'home', '/shop/')).toBeNull();
    });
});

describe('buildPageCacheKey', () => {
    const homeConfig = { carousel: true, products: { new: { limit: 12 }, featured: { limit: 12 } } };
    const genericConfig = { products: { new: { limit: 5 } }, categories: true };

    it('does not collide when the same url is fetched with a different config', () => {
        expect(buildPageCacheKey('/', homeConfig)).not.toBe(buildPageCacheKey('/', genericConfig));
    });

    it('is stable for equivalent configs declared in a different key order', () => {
        expect(buildPageCacheKey('/', { a: 1, b: { c: 2, d: 3 } }))
            .toBe(buildPageCacheKey('/', { b: { d: 3, c: 2 }, a: 1 }));
    });

    it('does not collide when the same config is fetched for a different url', () => {
        expect(buildPageCacheKey('/', homeConfig)).not.toBe(buildPageCacheKey('/jewelry/', homeConfig));
    });

    it('accepts a Location object as the url', () => {
        expect(buildPageCacheKey(window.location, homeConfig))
            .toBe(buildPageCacheKey(String(window.location), homeConfig));
    });
});
