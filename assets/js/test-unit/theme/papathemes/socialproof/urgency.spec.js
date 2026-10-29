import { formatTimeAgo, pickViewCount, pickOrderHours } from '../../../../theme/papathemes/socialproof/urgency';

describe('urgency helpers', () => {
    const lang = {
        minAgo: '__COUNT__m ago',
        hourAgo: '1h ago',
        hoursAgo: '__COUNT__h ago',
        dayAgo: '1d ago',
        daysAgo: '__COUNT__d ago',
    };

    it('formatTimeAgo returns minutes for <1h', () => {
        expect(formatTimeAgo(0.5, lang)).toBe('30m ago');
    });
    it('formatTimeAgo returns singular hour', () => {
        expect(formatTimeAgo(1, lang)).toBe('1h ago');
    });
    it('formatTimeAgo returns plural hours for 1<h<24', () => {
        expect(formatTimeAgo(5, lang)).toBe('5h ago');
    });
    it('formatTimeAgo returns singular day for 24<=h<48', () => {
        expect(formatTimeAgo(30, lang)).toBe('1d ago');
    });
    it('formatTimeAgo returns plural days for h>=48', () => {
        expect(formatTimeAgo(72, lang)).toBe('3d ago');
    });

    it('pickViewCount returns value in [min, max]', () => {
        const v = pickViewCount('product-1', 'session-A', 3, 25);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(25);
    });

    it('pickViewCount is deterministic for same product+session', () => {
        const a = pickViewCount('p-42', 'sess-X', 3, 25);
        const b = pickViewCount('p-42', 'sess-X', 3, 25);
        expect(a).toBe(b);
    });

    it('pickOrderHours returns value in [min, max)', () => {
        const h = pickOrderHours('p-1', 'sess-A', 1, 48);
        expect(h).toBeGreaterThanOrEqual(1);
        expect(h).toBeLessThan(48);
    });
});
