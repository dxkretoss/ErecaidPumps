/**
 * @jest-environment jsdom
 */

import fs from 'fs';
import path from 'path';

const TEMPLATE = path.resolve(__dirname, '../../../../templates/layout/instantload-base.html');

/**
 * The inline `#instantload-script` of instantload-base.html, with its handlebars placeholders
 * filled in the way BigCommerce renders them. The tests `eval` it: the script only ever exists
 * inline in that template, so running the real thing is the only way to cover it. The input is a
 * checked-in file in this repo, never user data.
 * @param {Object} ajaxContext The context of the ajax render, as `{{jsContext}}` serialises it
 * @returns {String}
 */
function bootstrapScript(ajaxContext) {
    const html = fs.readFileSync(TEMPLATE, 'utf8');
    const match = html.match(/<script id="instantload-script"[^>]*>([\s\S]*?)<\/script>/);

    if (!match) {
        throw new Error('#instantload-script not found in templates/layout/instantload-base.html');
    }

    return match[1]
        .replace('{{jsContext}}', JSON.stringify(JSON.stringify(ajaxContext)))
        .replace('{{page_type}}', 'product');
}

/**
 * Runs the real script and returns the merged context, parsed back from the string
 * `stencilBootstrap` was actually handed — the boundary the browser sees.
 * @param {Object} ajaxContext
 * @param {Object} [parentContext] Omit to run with no context from the full page load
 * @returns {Object}
 */
function boot(ajaxContext, parentContext) {
    const script = bootstrapScript(ajaxContext);

    if (parentContext === undefined) {
        delete window.themeInstantLoad_jsContext;
    } else {
        window.themeInstantLoad_jsContext = parentContext;
    }

    eval(script); // eslint-disable-line no-eval

    return JSON.parse(window.stencilBootstrap.mock.calls[0][1]);
}

describe('instantload-base #instantload-script', () => {
    beforeEach(() => {
        window.stencilBootstrap = jest.fn(() => ({ load: jest.fn() }));
    });

    afterEach(() => {
        delete window.themeInstantLoad_jsContext;
        delete window.stencilBootstrap;
    });

    it('back-fills a key the ajax render omitted entirely', () => {
        // BigCommerce leaves `graphQLToken` out of an ajax render, so iterating the ajax context
        // would never visit the key and every GraphQL widget on the swapped-in page loses its token.
        const merged = boot({ pageType: 'product' }, { pageType: 'default', graphQLToken: 'jwt-token' });

        expect(merged.graphQLToken).toBe('jwt-token');
        expect(merged.pageType).toBe('product');
    });

    it('back-fills a key whose ajax value is null', () => {
        const merged = boot({ cartId: null, customerId: null }, { cartId: 'abc', customerId: 42 });

        expect(merged).toEqual({ cartId: 'abc', customerId: 42 });
    });

    it('back-fills a key whose ajax value is present but undefined', () => {
        // JSON cannot carry `undefined`, so a real ajax context reaches the merge with the key
        // absent instead. Force the own-property case to pin that the guard tests for `undefined`
        // and not only for `null`.
        const script = bootstrapScript({});
        window.themeInstantLoad_jsContext = { graphQLToken: 'jwt-token' };
        const parse = jest.spyOn(JSON, 'parse').mockReturnValue({ graphQLToken: undefined });

        try {
            eval(script); // eslint-disable-line no-eval
        } finally {
            parse.mockRestore();
        }

        expect(JSON.parse(window.stencilBootstrap.mock.calls[0][1]).graphQLToken).toBe('jwt-token');
    });

    it('keeps ajax values that are present but falsy', () => {
        const merged = boot(
            { emptyString: '', zero: 0, no: false },
            { emptyString: 'parent', zero: 99, no: true },
        );

        expect(merged).toEqual({ emptyString: '', zero: 0, no: false });
    });

    it('does not overwrite an ajax value with an undefined parent value', () => {
        // Dropping the `parentContext[key] !== undefined` guard would assign `undefined` over the
        // ajax-sent `null`, and `JSON.stringify` would then drop the key out of the booted context
        // entirely rather than leave it null.
        const merged = boot({ cartId: null }, { cartId: undefined });

        expect(merged).toEqual({ cartId: null });
    });

    it('tolerates a missing context from the full page load', () => {
        expect(boot({ pageType: 'product' })).toEqual({ pageType: 'product' });
    });

    it('boots the page with the merged context', () => {
        boot({ pageType: 'product', graphQLToken: null }, { graphQLToken: 'parent-token' });

        expect(window.stencilBootstrap).toHaveBeenCalledTimes(1);
        expect(window.stencilBootstrap.mock.calls[0][0]).toBe('product');
        expect(JSON.parse(window.stencilBootstrap.mock.calls[0][1])).toEqual({
            pageType: 'product',
            graphQLToken: 'parent-token',
        });
    });
});
