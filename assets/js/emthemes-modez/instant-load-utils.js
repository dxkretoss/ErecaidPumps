export const HOME_PAGE_TYPE = 'home';

// BigCommerce reports the storefront home page as `default`; only the theme calls it `home`.
const STOREFRONT_DEFAULT_PAGE_TYPE = 'default';

function normalizePath(pathname) {
    const withLeadingSlash = pathname.charAt(0) === '/' ? pathname : `/${pathname}`;
    return withLeadingSlash.replace(/\/+$/, '') || '/';
}

/**
 * Resolves a value against the current document, the way a browser resolves an href.
 * @param {String|Location} value
 * @returns {{origin: String, path: String}}
 */
function parseUrl(value) {
    const anchor = document.createElement('a');
    anchor.href = String(value);
    return {
        origin: `${anchor.protocol}//${anchor.host}`,
        path: normalizePath(anchor.pathname),
    };
}

/**
 * @param {String|Location} url Absolute or relative url, or a Location object
 * @param {String} [homeUrl] The storefront home url, i.e. `context.urls.home`
 * @returns {Boolean} Whether the url points at the storefront home page
 */
export function isHomeUrl(url, homeUrl) {
    if (url === null || url === undefined) {
        return false;
    }

    const target = parseUrl(url);
    const home = parseUrl(homeUrl || '/');

    return target.origin === home.origin && target.path === home.path;
}

/**
 * Works out which stencil-config an InstantLoad request needs, before the request is sent.
 * @param {String|Location} url Destination url
 * @param {String} [declaredPageType] Page type from the link payload or the history entry
 * @param {String} [homeUrl] The storefront home url, i.e. `context.urls.home`
 * @returns {String|null}
 */
export function resolvePageType(url, declaredPageType, homeUrl) {
    if (declaredPageType === HOME_PAGE_TYPE && !isHomeUrl(url, homeUrl)) {
        return null;
    }

    if (declaredPageType && declaredPageType !== STOREFRONT_DEFAULT_PAGE_TYPE) {
        return declaredPageType;
    }

    if (isHomeUrl(url, homeUrl)) {
        return HOME_PAGE_TYPE;
    }

    return declaredPageType || null;
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

/**
 * Cache key for an InstantLoad page fetch. The stencil-config is part of the request and changes
 * the html the server renders, so caching on the url alone lets whichever config asked first
 * poison every later request for that url — including the ones prefetched on mouseenter.
 *
 * @param {String|Location} url
 * @param {Object} config The stencil-config sent with the request
 * @returns {String}
 */
export function buildPageCacheKey(url, config) {
    return `loadPage|${String(url)}|${stableStringify(config)}`;
}
