/**
 * BigCommerce Pump Finder - Dynamic Product Catalogue Fetcher & Normalizer
 *
 * Retrieves eligible products dynamically across the entire store catalogue using
 * Storefront GraphQL cursor pagination.
 *
 * Filters products by Custom Field: `finder_enabled = yes`.
 * Parses, normalizes, and maps all `finder_*` custom fields into clean attribute arrays.
 * Preserves product ID, name, URL, image, and price for recommendation cards.
 * Stores eligible products in `window.pumpFinderProducts`.
 */

export const GET_CATALOG_PRODUCTS_QUERY = `
    query FetchAllCatalogProducts($after: String) {
        site {
            products(first: 50, after: $after) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    cursor
                    node {
                        entityId
                        name
                        path
                        defaultImage {
                            url(width: 300)
                            altText
                        }
                        prices {
                            price {
                                value
                                currencyCode
                            }
                            retailPrice {
                                value
                                currencyCode
                            }
                            salePrice {
                                value
                                currencyCode
                            }
                        }
                        customFields(first: 50) {
                            edges {
                                node {
                                    name
                                    value
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Retrieves the active Storefront GraphQL authentication token.
 * Reads from context, window.jsContext, or global fallbacks.
 *
 * @param {Object} [context] - Stencil page JS context
 * @returns {string} Bearer token or empty string
 */
export function getStorefrontToken(context) {
    return (context && context.graphQLToken)
        || (typeof window !== 'undefined' && window.jsContext && window.jsContext.graphQLToken)
        || (typeof window !== 'undefined' && window.stencilContext && window.stencilContext.graphQLToken)
        || (typeof window !== 'undefined' && window.graphQLToken)
        || (typeof window !== 'undefined' && window.bcToken)
        || '';
}

/**
 * Converts snake_case custom field names to camelCase attribute names.
 * e.g. "finder_primary_reason" -> "primaryReason"
 *      "finder_ed_severity"    -> "edSeverity"
 *      "finder_pump_type"      -> "pumpType"
 *      "finder_hand_friendly"  -> "handFriendly"
 *      "finder_budget"         -> "budget"
 *      "finder_priority"       -> "priority"
 *
 * @param {string} fieldName - Raw custom field name
 * @returns {string} Normalized attribute name
 */
export function normalizeAttributeName(fieldName) {
    return fieldName
        .replace(/^finder_/, '')
        .trim()
        .toLowerCase()
        .replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Splits comma-separated values, trims whitespace, and normalizes to lowercase.
 *
 * @param {string} value - Raw field value (e.g. "mild, moderate ")
 * @returns {string[]} Array of normalized value strings
 */
export function parseCustomFieldValue(value) {
    if (typeof value !== 'string') return [];
    return value
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(item => item.length > 0);
}

/**
 * Processes a product node's custom fields.
 * Extracts `finder_*` fields, normalizes them, and checks eligibility.
 *
 * @param {Object} productNode - GraphQL product node
 * @returns {Object} { isEnabled, rawFields, attributes }
 */
export function processProductCustomFields(productNode) {
    const rawFields = {};
    const attributes = {};
    const edges = (productNode && productNode.customFields && productNode.customFields.edges) || [];

    edges.forEach(({ node }) => {
        if (!node || !node.name) return;
        const name = node.name.trim();
        const value = typeof node.value === 'string' ? node.value.trim() : '';

        if (name.startsWith('finder_')) {
            rawFields[name] = value;
            if (name !== 'finder_enabled') {
                const attrKey = normalizeAttributeName(name);
                attributes[attrKey] = parseCustomFieldValue(value);
            }
        }
    });

    const isEnabled = typeof rawFields.finder_enabled === 'string'
        && rawFields.finder_enabled.trim().toLowerCase() === 'yes';

    return {
        isEnabled,
        rawFields,
        attributes,
    };
}

/**
 * Transforms a GraphQL product node into the structured Pump Finder product format.
 * Returns null if the product is not eligible (finder_enabled !== 'yes').
 *
 * @param {Object} node - GraphQL product node
 * @returns {Object|null} Structured product object or null
 */
export function transformProduct(node) {
    if (!node || !node.entityId) return null;

    const { isEnabled, rawFields, attributes } = processProductCustomFields(node);

    if (!isEnabled) {
        return null;
    }

    return {
        id: node.entityId,
        name: node.name,
        url: node.path,
        image: node.defaultImage ? {
            url: node.defaultImage.url,
            altText: node.defaultImage.altText || node.name || '',
        } : null,
        price: node.prices ? {
            price: node.prices.price ? node.prices.price.value : null,
            salePrice: node.prices.salePrice ? node.prices.salePrice.value : null,
            retailPrice: node.prices.retailPrice ? node.prices.retailPrice.value : null,
            currencyCode: (node.prices.price && node.prices.price.currencyCode) || 'USD',
        } : null,
        finderEnabled: true,
        attributes,
        rawCustomFields: rawFields,
    };
}

/**
 * Retrieves the entire product catalogue via GraphQL cursor pagination,
 * filters for eligible products (finder_enabled = yes), and normalizes attributes.
 *
 * @param {Object} [options]
 * @param {string} [options.token] - Storefront API token
 * @param {Object} [options.context] - Stencil JS context
 * @param {number} [options.maxPages=100] - Safety ceiling for pagination loops
 * @returns {Promise<Object>} Fetch result summary and products
 */
export async function fetchAllCatalogProducts(options = {}) {
    const token = options.token || getStorefrontToken(options.context);

    if (!token) {
        const error = new Error('Storefront GraphQL token not available. Ensure base.html injects graphQLToken.');
        console.error('[Pump Finder]', error.message);
        return {
            success: false,
            error,
            allProducts: [],
            eligibleProducts: [],
            excludedProductsCount: 0,
            graphQLErrors: [],
        };
    }

    let hasNextPage = true;
    let endCursor = null;
    const allProducts = [];
    const seenIds = new Set();
    let pageCount = 0;
    const maxPages = options.maxPages || 100;
    const graphQLErrors = [];

    while (hasNextPage && pageCount < maxPages) {
        pageCount++;

        let response;
        try {
            response = await fetch('/graphql', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: GET_CATALOG_PRODUCTS_QUERY,
                    variables: {
                        after: endCursor,
                    },
                }),
            });
        } catch (networkErr) {
            console.error('[Pump Finder] Network request failed:', networkErr);
            return {
                success: false,
                error: networkErr,
                allProducts,
                eligibleProducts: [],
                excludedProductsCount: 0,
                graphQLErrors,
            };
        }

        if (!response.ok) {
            const httpErr = new Error(`GraphQL HTTP ${response.status}: ${response.statusText}`);
            console.error('[Pump Finder]', httpErr.message);
            return {
                success: false,
                error: httpErr,
                allProducts,
                eligibleProducts: [],
                excludedProductsCount: 0,
                graphQLErrors,
            };
        }

        let result;
        try {
            result = await response.json();
        } catch (jsonErr) {
            console.error('[Pump Finder] Failed to parse GraphQL response JSON:', jsonErr);
            return {
                success: false,
                error: jsonErr,
                allProducts,
                eligibleProducts: [],
                excludedProductsCount: 0,
                graphQLErrors,
            };
        }

        if (result.errors && result.errors.length) {
            console.error('[Pump Finder] GraphQL returned errors:', result.errors);
            graphQLErrors.push(...result.errors);
            return {
                success: false,
                error: new Error('GraphQL returned query errors'),
                graphQLErrors,
                allProducts,
                eligibleProducts: [],
                excludedProductsCount: 0,
            };
        }

        const site = result.data && result.data.site;
        const productsConnection = site && site.products;

        if (!productsConnection || !Array.isArray(productsConnection.edges)) {
            break;
        }

        productsConnection.edges.forEach(({ node }) => {
            if (node && node.entityId && !seenIds.has(node.entityId)) {
                seenIds.add(node.entityId);
                allProducts.push(node);
            }
        });

        const pageInfo = productsConnection.pageInfo || {};
        hasNextPage = Boolean(pageInfo.hasNextPage);
        endCursor = pageInfo.endCursor || null;

        // If no cursor returned despite hasNextPage, break to prevent infinite loop
        if (!endCursor) {
            hasNextPage = false;
        }
    }

    // Process and filter eligible products
    const eligibleProducts = [];
    let excludedCount = 0;

    allProducts.forEach(node => {
        const transformed = transformProduct(node);
        if (transformed) {
            eligibleProducts.push(transformed);
        } else {
            excludedCount++;
        }
    });

    return {
        success: true,
        pageCount,
        totalRetrieved: allProducts.length,
        eligibleProducts,
        excludedProductsCount: excludedCount,
        graphQLErrors,
    };
}

/**
 * Initializes catalogue retrieval, filters eligible products, stores them on window,
 * and outputs the formatted diagnostic summary to console as required.
 *
 * @param {Object} [context]
 * @returns {Promise<Object|null>}
 */
export async function initPumpFinderCatalog(context = null) {
    try {
        const result = await fetchAllCatalogProducts({ context });

        if (!result.success) {
            console.error('[Pump Finder] Catalogue Retrieval Failed:', result.error || result.graphQLErrors);
            return null;
        }

        // Store eligible products in window.pumpFinderProducts as required
        window.pumpFinderProducts = result.eligibleProducts;
        window.pumpFinderCatalog = result;

        // Log exactly according to Requirement 7:
        // - Total products retrieved.
        // - Total eligible products.
        // - Total excluded products.
        // - Eligible product names and IDs.
        // - Any GraphQL errors.
        console.group('Pump Finder - Catalogue Retrieval');
        console.log('Total products retrieved:', result.totalRetrieved);
        console.log('Total eligible products:', result.eligibleProducts.length);
        console.log('Total excluded products:', result.excludedProductsCount);
        console.log('Eligible product names and IDs:');
        console.table(result.eligibleProducts.map(p => ({
            'ID': p.id,
            'Name': p.name,
            'URL': p.url,
            'Pump Type': (p.attributes.pumpType || []).join(', '),
            'Primary Reason': (p.attributes.primaryReason || []).join(', '),
            'Budget': (p.attributes.budget || []).join(', '),
        })));

        if (result.graphQLErrors && result.graphQLErrors.length) {
            console.error('GraphQL Errors:', result.graphQLErrors);
        }
        console.groupEnd();

        return result;
    } catch (err) {
        console.error('[Pump Finder] Catalogue Retrieval Exception:', err);
        return null;
    }
}

/**
 * Ranks eligible products based on customer questionnaire answers.
 * Implements:
 *   - Exact matches first
 *   - Clinical preference ranking (hand strength, pump type, primary reason, severity, budget, priority)
 *   - Essential suitability guards (hand strength penalty for arthritis patients if pump is not hand-friendly)
 *   - Dynamic clinical reasoning explanations for why each product matches
 *
 * @param {Object} answers - User questionnaire selections
 * @param {Array} [products] - Eligible products (defaults to window.pumpFinderProducts)
 * @returns {Array<Object>} Scored and sorted recommendations: [{ product, score, reasons, badge }]
 */
export function calculateClinicalMatches(answers = {}, products = null) {
    const list = products || (typeof window !== 'undefined' && window.pumpFinderProducts) || [];
    if (!Array.isArray(list) || list.length === 0) {
        return [];
    }

    const primaryReason = answers.primary_reason || '';
    const edSeverity = answers.ed_severity || '';
    const pumpType = answers.pump_type || '';
    const handStrength = answers.hand_strength || '';
    const budget = answers.budget || '';
    const priority = answers.priority || '';

    const scored = list.map(product => {
        let score = 0;
        const reasons = [];
        let badge = 'Personalized Best Match';
        const attr = product.attributes || {};

        const pReasons = attr.primaryReason || [];
        const pSeverities = attr.edSeverity || [];
        const pTypes = attr.pumpType || [];
        const pHand = attr.handFriendly || [];
        const pBudget = attr.budget || [];
        const pPriority = attr.priority || [];

        // 1. Essential Suitability / Hand Strength (Question 4)
        if (handStrength === 'yes') {
            if (pHand.includes('yes')) {
                score += 25;
                reasons.push('Effortless motorized operation eliminates hand fatigue — ideal for arthritis or limited grip');
                badge = 'Best for Limited Hand Strength';
            } else {
                score -= 30; // Strongly penalize manual squeeze pumps for limited hand strength
            }
        } else if (handStrength === 'no') {
            score += 5;
        }

        // 2. Pump Type (Question 3)
        if (pumpType === 'battery_operated') {
            if (pTypes.includes('battery_operated')) {
                score += 25;
                reasons.push('Convenient push-button motorized battery vacuum for effortless operation');
                if (badge === 'Personalized Best Match') badge = 'Top Motorized System';
            }
        } else if (pumpType === 'manual') {
            if (pTypes.includes('manual')) {
                score += 25;
                reasons.push('Ergonomic manual squeeze lever gives you complete, tactile control over vacuum pressure');
                if (badge === 'Personalized Best Match') badge = 'Top Manual System';
            }
        } else if (pumpType === 'rechargeable') {
            if (pTypes.includes('rechargeable')) {
                score += 25;
                reasons.push('Modern USB-rechargeable electric motor — zero replacement batteries required');
                if (badge === 'Personalized Best Match') badge = 'Top Rechargeable System';
            }
        } else if (pumpType === 'no_preference') {
            score += 10;
        }

        // 3. Primary Reason (Question 1)
        if (primaryReason === 'erectile_dysfunction') {
            if (pReasons.includes('erectile_dysfunction') || pReasons.includes('both')) {
                score += 20;
                reasons.push('Clinically proven medical vacuum therapy engineered specifically for erectile dysfunction');
            }
        } else if (primaryReason === 'prostate_therapy') {
            if (pReasons.includes('prostate_therapy') || pReasons.includes('both')) {
                score += 20;
                reasons.push('Doctor-recommended protocol for penile rehabilitation following prostate surgery');
                badge = 'Top Urology Recommendation';
            }
        } else if (primaryReason === 'both') {
            if (pReasons.length > 0) {
                score += 20;
                reasons.push('Dual-purpose system suitable for both ED treatment and post-prostate recovery');
            }
        }

        // 4. ED Severity (Question 2)
        if (edSeverity === 'mild') {
            if (pSeverities.includes('mild')) {
                score += 15;
                reasons.push('Gentle, easy-to-control suction calibrated for mild ED symptoms');
            }
        } else if (edSeverity === 'moderate') {
            if (pSeverities.includes('moderate')) {
                score += 15;
                reasons.push('Consistent medical-grade vacuum strength suited for moderate ED');
            }
        } else if (edSeverity === 'severe') {
            if (pSeverities.includes('severe')) {
                score += 15;
                reasons.push('High-efficiency medical vacuum power engineered for severe erectile dysfunction');
            }
        } else if (edSeverity === 'none') {
            score += 10;
        }

        // 5. Budget (Question 5)
        if (budget === 'under_150') {
            if (pBudget.includes('under_150')) {
                score += 20;
                reasons.push('Starter system fitting comfortably within your under-$150 budget');
                if (badge === 'Personalized Best Match') badge = 'Best Value Selection';
            } else {
                score -= 10;
            }
        } else if (budget === '150_300') {
            if (pBudget.includes('150_300')) {
                score += 15;
                reasons.push('Mid-range system fitting within your preferred $150–$300 budget');
            }
        } else if (budget === 'over_300') {
            if (pBudget.includes('over_300')) {
                score += 15;
                reasons.push('Premium clinical-grade system with maximum features and durability');
                if (badge === 'Personalized Best Match') badge = 'Premium Clinical Grade';
            }
        } else if (budget === 'flexible') {
            score += 10;
        }

        // 6. Priority / Feature (Question 6)
        if (priority === 'ease_of_use') {
            if (pPriority.includes('ease_of_use') || pHand.includes('yes')) {
                score += 20;
                reasons.push('Engineered for maximum simplicity with intuitive, comfortable operation');
            }
        } else if (priority === 'warranty_support') {
            if (pPriority.includes('warranty_support')) {
                score += 20;
                reasons.push('Industry-leading manufacturer warranty backed by dedicated urology product specialists');
            }
        } else if (priority === 'lowest_price') {
            if (pPriority.includes('lowest_price') || pBudget.includes('under_150')) {
                score += 20;
                reasons.push('Complete system offering full clinical functionality at the lowest available price');
            }
        } else if (priority === 'manual_and_powered') {
            if (pPriority.includes('manual_and_powered')) {
                score += 25;
                reasons.push('Versatile kit including both manual pump handle and battery-powered motor');
                badge = 'Dual-Power Combo System';
            }
        }

        // Fallback clinical bullets if fewer than 2 specific reasons matched
        if (reasons.length < 2) {
            reasons.push('Doctor & urologist recommended vacuum erection device');
            reasons.push('Complete medical kit with sizing rings, cylinder, and accessories');
            reasons.push('Backed by manufacturer warranty & dedicated clinical support');
        }

        return {
            product,
            score,
            reasons: reasons.slice(0, 4),
            badge,
        };
    });

    // Rank highest score first (exact matches and highest preference satisfaction)
    scored.sort((a, b) => b.score - a.score);

    return scored;
}

if (typeof window !== 'undefined') {
    window.calculateClinicalMatches = calculateClinicalMatches;
}

export default initPumpFinderCatalog;

