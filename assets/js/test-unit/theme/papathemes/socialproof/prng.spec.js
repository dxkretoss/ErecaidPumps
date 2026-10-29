import { simpleHash, seededRandom, seededInt, seededFloat } from '../../../../theme/papathemes/socialproof/prng';

describe('prng', () => {
    it('simpleHash returns deterministic non-negative integer', () => {
        const a = simpleHash('product-42');
        const b = simpleHash('product-42');
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
    });

    it('simpleHash gives different results for different inputs', () => {
        expect(simpleHash('a')).not.toBe(simpleHash('b'));
    });

    it('seededRandom returns value in [0, 1)', () => {
        for (let i = 0; i < 10; i += 1) {
            const v = seededRandom(i * 1000);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('seededInt returns integer in [min, max]', () => {
        for (let i = 0; i < 100; i += 1) {
            const v = seededInt(i, 3, 25);
            expect(v).toBeGreaterThanOrEqual(3);
            expect(v).toBeLessThanOrEqual(25);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    it('seededFloat returns number in [min, max)', () => {
        for (let i = 0; i < 100; i += 1) {
            const v = seededFloat(i, 1, 48);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThan(48);
        }
    });

    it('seededInt is deterministic given same seed', () => {
        expect(seededInt(12345, 3, 25)).toBe(seededInt(12345, 3, 25));
    });
});
