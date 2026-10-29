/**
 * Papathemes Social Proof — Recent Sales mini-popup.
 *
 * Displays a rotating sequence of "Someone in X just purchased Y" cards in the
 * corner of the viewport. Product data comes from BigCommerce Storefront
 * GraphQL. Four sources supported via `config.source`:
 *
 *   - best-sellers:  `site.bestSellingProducts(first: 5)`
 *   - new:           `site.newestProducts(first: 5)`
 *   - featured:      `site.featuredProducts(first: 5)`
 *   - manual:        batch `product(entityId)` / `product(sku)` queries,
 *                    aliased p0, p1, ... one per `config.items[]` entry.
 *
 * Timing (all seconds): `delay` before first show, `duration` each card is
 * visible, `interval` between cards, stop after `maxShows` (0 = unlimited).
 *
 * GraphQL failures are swallowed with a console.warn — no UI shown. The
 * dismiss button sets `papathemes-recentsales-dismissed=1` in sessionStorage,
 * hiding the widget for the rest of the browsing session.
 */

import { createStorage } from './storage';
import { appendDemoNote } from './demoNote';

const SELECTOR = '[data-papathemes-recent-sales]';
const DISMISS_KEY = 'papathemes-recentsales-dismissed';

const QUERIES = {
    'best-sellers': 'query BestSellingProducts { site { bestSellingProducts(first: 5) { edges { node { name path defaultImage { url(width: 128) } } } } } }',
    new: 'query NewestProducts { site { newestProducts(first: 5) { edges { node { name path defaultImage { url(width: 128) } } } } } }',
    featured: 'query FeaturedProducts { site { featuredProducts(first: 5) { edges { node { name path defaultImage { url(width: 128) } } } } } }',
};

function buildManualQuery(items) {
    const fields = items.map((item, idx) => {
        // Only emit a GraphQL field when we can produce a well-formed
        // argument. For productId we must interpolate a finite integer;
        // if parseInt returns NaN (e.g. item.productId is 'abc'), splicing
        // the literal "NaN" into the query would make the ENTIRE manual-
        // source query fail on the server side and the user would see
        // no popup at all. Skip the bad entry instead — aligns with
        // fetchProducts() which already walks the ORIGINAL items array
        // and tolerates null/missing aliases.
        if (item.productId !== undefined && item.productId !== null && item.productId !== '') {
            const id = parseInt(item.productId, 10);
            if (!Number.isFinite(id) || id <= 0) return '';
            return `p${idx}: product(entityId: ${id}) { name path defaultImage { url(width: 128) } }`;
        }
        if (item.sku) {
            return `p${idx}: product(sku: ${JSON.stringify(item.sku)}) { name path defaultImage { url(width: 128) } }`;
        }
        return '';
    }).filter(Boolean).join(' ');
    // If every item was invalid, return null so fetchProducts can short-
    // circuit without firing a useless network request for a query that
    // would render as `query RecentSalesProducts { site {  } }` — which
    // the server rejects as a syntax error anyway.
    if (!fields) return null;
    return `query RecentSalesProducts { site { ${fields} } }`;
}

async function fetchProducts(source, config, token) {
    let query;
    if (source === 'manual') {
        if (!Array.isArray(config.items) || !config.items.length) return [];
        query = buildManualQuery(config.items);
        // buildManualQuery returns null when every item was invalid
        // (e.g. merchant pasted SKUs that did not resolve). Short-
        // circuit rather than fire a malformed GraphQL request.
        if (!query) return [];
    } else {
        query = QUERIES[source] || QUERIES['best-sellers'];
    }

    try {
        const res = await fetch('/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query }),
        });
        // Non-2xx HTTP: log enough context to diagnose (matches the spec's
        // promise that GraphQL failures are reachable via console.warn)
        // but still return [] so the UI silently skips.
        if (!res.ok) {
            // eslint-disable-next-line no-console
            console.warn('[papathemes-socialproof] recent-sales GraphQL request failed', {
                status: res.status,
                statusText: res.statusText,
            });
            return [];
        }
        const json = await res.json();
        // GraphQL returns 200 even when individual fields fail — the
        // errors land in `json.errors`. Log them so they are diagnosable
        // the same way as transport-level failures.
        if (json && Array.isArray(json.errors) && json.errors.length) {
            // eslint-disable-next-line no-console
            console.warn('[papathemes-socialproof] recent-sales GraphQL returned errors', json.errors);
            return [];
        }
        const site = (json && json.data && json.data.site) || {};

        if (source === 'manual') {
            // Iterate the ORIGINAL config.items array and look up each entry
            // by its `p${idx}` alias. This keeps `location` / `timeAgo`
            // metadata aligned with the correct product even when
            // buildManualQuery() skipped invalid entries. Missing aliases
            // (e.g., a productId that did not resolve on the GraphQL side)
            // are dropped here.
            const items = (config && Array.isArray(config.items)) ? config.items : [];
            return items.map((item, idx) => {
                const node = site[`p${idx}`];
                if (!node) return null;
                return {
                    name: node.name,
                    url: node.path,
                    image: node.defaultImage && node.defaultImage.url,
                    location: (item && item.location) || '',
                    timeAgo: (item && item.timeAgo) || '',
                };
            }).filter(Boolean);
        }

        // Map the source string to its GraphQL field name. Avoids a nested
        // ternary so the branch logic is easy to extend (e.g., future
        // sources like "trending") without confusing operator precedence.
        let key = 'bestSellingProducts';
        if (source === 'new') key = 'newestProducts';
        else if (source === 'featured') key = 'featuredProducts';
        const conn = site[key];
        if (!conn || !Array.isArray(conn.edges)) return [];
        return conn.edges.map(({ node }) => ({
            name: node.name,
            url: node.path,
            image: node.defaultImage && node.defaultImage.url,
            location: '',
            timeAgo: '',
        }));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[papathemes-socialproof] recent-sales GraphQL fetch failed', e);
        return [];
    }
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function pickTimeAgo(lang, randFn = Math.random) {
    const r = randFn();
    if (r < 0.3) {
        const mins = Math.floor(randFn() * 50) + 5;
        return lang.minAgo.replace('__COUNT__', mins);
    }
    if (r < 0.75) {
        const hrs = Math.floor(randFn() * 22) + 1;
        if (hrs === 1) return lang.hourAgo;
        return lang.hoursAgo.replace('__COUNT__', hrs);
    }
    const days = Math.floor(randFn() * 2) + 1;
    if (days === 1) return lang.dayAgo;
    return lang.daysAgo.replace('__COUNT__', days);
}

export function shouldRunOnPage(scope, pageType, excludePages) {
    if (scope === 'none') return false;
    if (Array.isArray(excludePages) && pageType) {
        if (excludePages.some((p) => pageType.indexOf(p) !== -1)) return false;
    }
    if (scope === 'all') return true;
    return scope === pageType;
}

function buildPopupDOM(item, lang) {
    const frag = document.createDocumentFragment();
    const link = document.createElement('a');
    link.className = 'papathemes-socialproof-recent-sales__link';
    link.href = item.url || '/';

    if (item.image) {
        const img = document.createElement('img');
        img.className = 'papathemes-socialproof-recent-sales__img';
        img.src = item.image;
        img.alt = item.name || '';
        img.loading = 'lazy';
        img.width = 64;
        img.height = 64;
        link.appendChild(img);
    }

    const body = document.createElement('div');
    body.className = 'papathemes-socialproof-recent-sales__body';

    const meta = document.createElement('p');
    meta.className = 'papathemes-socialproof-recent-sales__meta';
    meta.textContent = item.location
        ? `${lang.someoneIn} ${item.location} ${lang.justPurchased}`
        : `${lang.someone} ${lang.justPurchased}`;
    body.appendChild(meta);

    const name = document.createElement('p');
    name.className = 'papathemes-socialproof-recent-sales__name';
    name.textContent = item.name;
    body.appendChild(name);

    const time = document.createElement('p');
    time.className = 'papathemes-socialproof-recent-sales__time';
    time.textContent = item.timeAgo || pickTimeAgo(lang);
    body.appendChild(time);

    link.appendChild(body);
    frag.appendChild(link);

    return frag;
}

// Module-level token for the "host element is already initialized by us"
// guard. Cleared explicitly on destroy so subsequent inits can re-claim
// the host.
const HOST_INIT_ATTR = 'papathemesRecentSalesInit';

/**
 * Initialize the recent-sales rotating corner popup. Returns a destroy
 * function that cancels any pending / in-flight setTimeout chain, hides
 * the host, and clears the init marker so a future initRecentSales()
 * call can hydrate fresh markup after an InstantLoad navigation.
 *
 * @returns {Promise<() => void>} destroy function
 */
export async function initRecentSales(config, context) {
    if (!config || !config.enabled) return () => {};
    const el = document.querySelector(SELECTOR);
    if (!el) return () => {};

    // Idempotency guard — if this same host is already running a
    // rotation cycle, bail rather than stack a second one.
    if (el.dataset[HOST_INIT_ATTR]) return () => {};

    const pageType = (context && context.pageType)
        || document.body.getAttribute('data-page-type')
        || '';
    if (!shouldRunOnPage(config.pages, pageType, config.excludePages)) return () => {};

    const storage = createStorage('session');
    if (storage.get(DISMISS_KEY) === '1') return () => {};

    const lang = {
        someoneIn: el.dataset.langSomeoneIn || 'Someone in',
        someone: el.dataset.langSomeone || 'Someone',
        justPurchased: el.dataset.langJustPurchased || 'just purchased',
        close: el.dataset.langClose || 'Dismiss',
        minAgo: el.dataset.langMinAgo || '__COUNT__ min ago',
        hourAgo: el.dataset.langHourAgo || '1 hour ago',
        hoursAgo: el.dataset.langHoursAgo || '__COUNT__ hours ago',
        dayAgo: el.dataset.langDayAgo || '1 day ago',
        daysAgo: el.dataset.langDaysAgo || '__COUNT__ days ago',
    };

    // Storefront API token is injected into the page context by base.html
    // (via `{{~inject 'graphQLToken' settings.storefront_api.token}}`) so
    // we can read it from the page JS context. Do NOT read it from a DOM
    // attribute — that would leak the token into server-rendered HTML
    // where it is trivially scraped. `window.bcToken` is a legacy
    // fallback for theme customizations that expose the token globally.
    const token = (context && context.graphQLToken)
        || (typeof window !== 'undefined' && window.bcToken)
        || '';
    // Consistent return: every early-exit path returns a no-op destroy
    // so callers (initSocialProof) can always invoke it without having
    // to check for undefined. Matches the signature documented above.
    if (!token) return () => {};

    const products = await fetchProducts(config.source, config, token);
    if (!products.length) return () => {};

    const items = shuffle(products);

    // Allowlist `config.position` to the positions we ship CSS offsets for.
    // A merchant typo (e.g. "bottom_left", "top-right") would otherwise
    // produce a modifier class with no matching rule and the fixed-position
    // popup would render in whichever corner the browser happens to pick
    // from defaults (typically top-left). Fall back to the documented
    // default instead so the UI degrades predictably.
    const ALLOWED_POSITIONS = ['bottom-left', 'bottom-right'];
    const position = ALLOWED_POSITIONS.indexOf(config.position) !== -1
        ? config.position
        : 'bottom-left';
    el.classList.add(`papathemes-socialproof-recent-sales--${position}`);

    let index = 0;
    let showCount = 0;
    const timing = config.timing || {};
    // Explicit numeric checks so `0` passes through (meaningful for
    // "show immediately" in test configs). `||` would silently coerce
    // 0 into the fallback, making certain test configurations impossible.
    const delayMs = (Number.isFinite(timing.delay) ? timing.delay : 8) * 1000;
    const durationMs = (Number.isFinite(timing.duration) ? timing.duration : 5) * 1000;
    const intervalMs = (Number.isFinite(timing.interval) ? timing.interval : 20) * 1000;
    const maxShows = Number.isFinite(timing.maxShows) ? timing.maxShows : 3;

    // All timers (for both delay+rotation AND in-flight hide+next)
    // are tracked so destroy() can cancel the whole chain atomically.
    // Without this, navigating via InstantLoad left the previous page's
    // rotation running in the background — popups would fire again on
    // the new page's host, producing stale product cards.
    const timers = new Set();
    const schedule = (fn, ms) => {
        const id = setTimeout(() => {
            timers.delete(id);
            fn();
        }, ms);
        timers.add(id);
        return id;
    };

    function showNext() {
        if (storage.get(DISMISS_KEY) === '1') return;
        if (maxShows > 0 && showCount >= maxShows) return;

        const item = items[index % items.length];
        index += 1;
        showCount += 1;

        el.textContent = '';
        el.appendChild(buildPopupDOM(item, lang));

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'papathemes-socialproof-recent-sales__close';
        closeBtn.setAttribute('aria-label', lang.close);
        closeBtn.textContent = '\u00d7';
        closeBtn.addEventListener('click', () => {
            storage.set(DISMISS_KEY, '1');
            el.classList.remove('is-visible');
            el.style.display = 'none';
        });
        el.appendChild(closeBtn);

        // Theme-editor demo preview — append a small secondary notice inside
        // the popup when this config came from DEMO_OVERRIDES. Never present
        // on merchant-configured recentSales.
        if (config.__demo === true) {
            appendDemoNote(el);
        }

        el.style.display = 'block';
        // Next paint: toggle `is-visible` so the CSS transition runs from its
        // initial state (opacity 0, translateY 20px) to visible.
        requestAnimationFrame(() => el.classList.add('is-visible'));

        schedule(() => {
            el.classList.remove('is-visible');
            schedule(() => { el.style.display = 'none'; }, 400);
            schedule(showNext, intervalMs);
        }, durationMs);
    }

    schedule(showNext, delayMs);
    el.dataset[HOST_INIT_ATTR] = '1';

    return () => {
        timers.forEach((id) => {
            try { clearTimeout(id); } catch (e) { /* noop */ }
        });
        timers.clear();
        if (el) {
            // Visible popup at destroy time would otherwise freeze on
            // screen with no timers left to hide it. Force hidden state.
            try {
                el.classList.remove('is-visible');
                el.style.display = 'none';
                // Strip position modifier classes so the next init can
                // apply a different config.position without class
                // accumulation (e.g. --bottom-left left over from a
                // previous init conflicting with a new --bottom-right).
                el.classList.remove('papathemes-socialproof-recent-sales--bottom-left');
                el.classList.remove('papathemes-socialproof-recent-sales--bottom-right');
            } catch (e) { /* noop */ }
            if (el.dataset) delete el.dataset[HOST_INIT_ATTR];
        }
        // Don't clear the host's contents — InstantLoad may swap the
        // whole page's DOM anyway, and if the host persists the new
        // init call will rebuild contents fresh on its first show.
    };
}
