/**
 * Renders `components/products/promotion-callout` with stand-ins for the Stencil helpers it
 * uses, so a change to the partial cannot silently break the compact/full split, the plural
 * or the escaping of the merchant's sentence.
 *
 * `handlebars` is resolved from the dev tree (grunt-svgstore pulls it in); this suite fails
 * loudly rather than skipping if it ever disappears.
 */

import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';

const PARTIAL_PATH = path.resolve(__dirname, '../../../../templates/components/products/promotion-callout.html');

const COMPARATORS = {
    '===': (a, b) => a === b,
    '==': (a, b) => a == b, // eslint-disable-line eqeqeq
    '!==': (a, b) => a !== b,
    '!=': (a, b) => a != b, // eslint-disable-line eqeqeq
};

/**
 * Mirrors stencil-paper-handlebars' `if`, which doubles as a comparison block helper —
 * `{{#if mode '===' 'compact'}}`. Handlebars' built-in only takes one argument, so the partial
 * would silently take the wrong branch. Its one-argument form is a plain `!!value`, which is
 * what turns `{{#if promotions.length}}` into an empty-list guard.
 * @returns {Handlebars} the same environment, for chaining
 */
function registerStencilHelpers(env) {
    env.registerHelper('if', function ifHelper(...args) {
        const options = args.pop();
        const truthy = args.length === 3
            ? COMPARATORS[args[1]](args[0], args[2])
            : Boolean(Array.isArray(args[0]) ? args[0].length : args[0]);

        return truthy ? options.fn(this) : options.inverse(this);
    });

    env.registerHelper('subtract', (a, b) => a - b);

    env.registerHelper('lang', (key, options) => {
        if (key !== 'products.featured_promotions.more_offers') {
            return key;
        }
        return options.hash.count === 1 ? 'more offer' : 'more offers';
    });

    return env;
}

const render = (() => {
    const env = registerStencilHelpers(handlebars.create());
    const template = env.compile(fs.readFileSync(PARTIAL_PATH, 'utf8'));

    return context => template(context).replace(/\s+/g, ' ').trim();
})();

const promotion = text => ({ text });

describe('components/products/promotion-callout', () => {
    it('renders nothing at all when the product has no promotion', () => {
        expect(render({ promotions: [], mode: 'compact' })).toBe('');
        expect(render({ mode: 'compact' })).toBe('');
        expect(render({ promotions: [], mode: 'full' })).toBe('');
    });

    it('shows only the top promotion on a card', () => {
        const html = render({
            promotions: [promotion('Save 15%'), promotion('Free shipping')],
            mode: 'compact',
        });

        expect(html).toContain('promotionCallout--compact');
        expect(html).toContain('Save 15%');
        expect(html).not.toContain('Free shipping');
    });

    it('keeps "+N more offers" outside the chip so it cannot truncate the sentence', () => {
        const html = render({
            promotions: [promotion('Save 15%'), promotion('Free shipping')],
            mode: 'compact',
        });

        const item = html.slice(html.indexOf('promotionCallout-item'), html.indexOf('promotionCallout-more'));
        expect(item).not.toContain('promotionCallout-more');
        expect(html).toContain('+1 more offer');
    });

    it('uses the singular for one extra offer and the plural beyond', () => {
        const two = render({ promotions: [promotion('A'), promotion('B')], mode: 'compact' });
        const three = render({ promotions: [promotion('A'), promotion('B'), promotion('C')], mode: 'compact' });

        expect(two).toContain('+1 more offer');
        expect(two).not.toContain('+1 more offers');
        expect(three).toContain('+2 more offers');
    });

    it('omits the counter when there is a single promotion', () => {
        const html = render({ promotions: [promotion('Save 15%')], mode: 'compact' });

        expect(html).not.toContain('promotionCallout-more');
    });

    it('lists every promotion, in order, on the product page', () => {
        const html = render({
            promotions: [promotion('First'), promotion('Second'), promotion('Third')],
            mode: 'full',
        });

        expect(html).toContain('promotionCallout--full');
        expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
        expect(html.indexOf('Second')).toBeLessThan(html.indexOf('Third'));
        expect(html.match(/promotionCallout-item/g)).toHaveLength(3);
    });

    it('escapes the merchant sentence instead of executing it', () => {
        const xss = '<img src=x onerror="alert(1)">';

        expect(render({ promotions: [promotion(xss)], mode: 'compact' })).not.toContain('<img');
        expect(render({ promotions: [promotion(xss)], mode: 'compact' })).toContain('&lt;img');
        expect(render({ promotions: [promotion(xss)], mode: 'full' })).not.toContain('<img');
    });
});
