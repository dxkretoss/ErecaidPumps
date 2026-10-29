import { pickTimeAgo, shouldRunOnPage } from '../../../../theme/papathemes/socialproof/recentSales';

describe('recentSales helpers', () => {
    const lang = {
        minAgo: '__COUNT__ min ago',
        hourAgo: '1 hour ago',
        hoursAgo: '__COUNT__ hours ago',
        dayAgo: '1 day ago',
        daysAgo: '__COUNT__ days ago',
    };

    it('pickTimeAgo returns "X min ago" when random lands in minutes bucket', () => {
        const s = pickTimeAgo(lang, () => 0.1);
        expect(s).toMatch(/^\d+ min ago$/);
    });

    it('pickTimeAgo returns hours/days for larger random values', () => {
        const hrs = pickTimeAgo(lang, () => 0.5);
        expect(hrs).toMatch(/hour/);
        const days = pickTimeAgo(lang, () => 0.9);
        expect(days).toMatch(/day/);
    });

    it('shouldRunOnPage respects "none"', () => {
        expect(shouldRunOnPage('none', 'home', [])).toBe(false);
    });

    it('shouldRunOnPage respects excludePages', () => {
        expect(shouldRunOnPage('all', 'checkout', ['checkout'])).toBe(false);
        expect(shouldRunOnPage('all', 'home', ['checkout'])).toBe(true);
    });

    it('shouldRunOnPage respects scope "home"', () => {
        expect(shouldRunOnPage('home', 'home', [])).toBe(true);
        expect(shouldRunOnPage('home', 'product', [])).toBe(false);
    });
});
