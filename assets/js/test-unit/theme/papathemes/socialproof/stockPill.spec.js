/**
 * @jest-environment jsdom
 */
import { initStockPill } from '../../../../theme/papathemes/socialproof/stockPill';

function createPill({ level, threshold = '10' } = {}) {
    const pill = document.createElement('div');
    pill.setAttribute('data-papathemes-stock-pill', '');
    pill.setAttribute('data-stock-level', String(level));
    pill.setAttribute('data-low-threshold', threshold);

    const display = document.createElement('span');
    display.setAttribute('data-papathemes-stock-display', '');
    display.textContent = String(level);
    pill.appendChild(display);

    const bcValue = document.createElement('span');
    bcValue.setAttribute('data-product-stock', '');
    bcValue.textContent = String(level);
    pill.appendChild(bcValue);

    document.body.appendChild(pill);
    return { pill, display, bcValue };
}

describe('stockPill', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('adds is-low-stock when level is below threshold', () => {
        const { pill } = createPill({ level: 5 });
        initStockPill();
        expect(pill.classList.contains('is-low-stock')).toBe(true);
    });

    it('does not add is-low-stock when level is above threshold', () => {
        const { pill } = createPill({ level: 50 });
        initStockPill();
        expect(pill.classList.contains('is-low-stock')).toBe(false);
    });

    it('hides the pill when level is zero', () => {
        const { pill } = createPill({ level: 0 });
        initStockPill();
        expect(pill.style.display).toBe('none');
        expect(pill.classList.contains('is-low-stock')).toBe(false);
    });

    it('hides the pill when data-stock-level is not numeric', () => {
        const { pill } = createPill({ level: 'abc' });
        initStockPill();
        expect(pill.style.display).toBe('none');
    });

    it('adds is-low-stock when level equals threshold (inclusive)', () => {
        const { pill } = createPill({ level: 10, threshold: '10' });
        initStockPill();
        expect(pill.classList.contains('is-low-stock')).toBe(true);
    });

    it('does not add is-low-stock when threshold is empty (low_stock_level not set)', () => {
        // The template renders data-low-threshold="{{product.low_stock_level}}",
        // which is empty when the merchant sets no per-product low stock level.
        const { pill } = createPill({ level: 3, threshold: '' });
        initStockPill();
        expect(pill.classList.contains('is-low-stock')).toBe(false);
        expect(pill.style.display).toBe('');
    });

    it('syncs visible display text from data-product-stock on init', () => {
        const { display } = createPill({ level: 42 });
        display.textContent = 'stale'; // simulate out-of-sync markup
        initStockPill();
        expect(display.textContent).toBe('42');
    });

    it('mirrors BC stock changes into visible display and re-evaluates class', (done) => {
        const { pill, display, bcValue } = createPill({ level: 50 });
        initStockPill();
        expect(pill.classList.contains('is-low-stock')).toBe(false);

        // Simulate product-details.js writing a new variant stock value
        bcValue.textContent = '3';

        // MutationObserver fires asynchronously — wait a tick.
        setTimeout(() => {
            expect(display.textContent).toBe('3');
            expect(pill.getAttribute('data-stock-level')).toBe('3');
            expect(pill.classList.contains('is-low-stock')).toBe(true);
            done();
        }, 0);
    });

    it('hides pill when BC writes a non-numeric stock value', (done) => {
        const { pill, bcValue } = createPill({ level: 20 });
        initStockPill();
        expect(pill.style.display).toBe('');

        // product-details.js writes `String(undefined)` when the selected
        // variant does NOT track inventory.
        bcValue.textContent = 'undefined';

        setTimeout(() => {
            // readBcStock returns null for non-numeric strings → our
            // syncFromBc clears data-stock-level → applyPillState hides
            // the pill, matching product-details.js's own
            // u-hiddenVisually behavior for non-tracked inventory.
            expect(pill.style.display).toBe('none');
            expect(pill.getAttribute('data-stock-level')).toBe('');
            expect(pill.classList.contains('is-low-stock')).toBe(false);
            done();
        }, 0);
    });
});
