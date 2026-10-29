import { getSettings, DEFAULTS } from '../../../../theme/papathemes/socialproof/settings';
import { DEMO_OVERRIDES } from '../../../../theme/papathemes/socialproof/demoSettings';

describe('getSettings()', () => {
    let warnSpy;

    // isInThemeEditor() keys off window.previewSdk.themeEditor — the BC
    // Page Builder / theme editor SDK global. Toggle it directly here.
    function setEditor(on) {
        if (on) {
            window.previewSdk = { themeEditor: { id: 'editor-test' } };
        } else {
            try { delete window.previewSdk; } catch (e) { /* noop */ }
        }
    }

    beforeEach(() => {
        delete window.supermarketThemeSettings;
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        setEditor(false);
    });

    afterEach(() => {
        delete window.supermarketThemeSettings;
        setEditor(false);
        warnSpy.mockRestore();
    });

    describe('outside editor', () => {
        it('returns DEFAULTS when merchant settings are undefined', () => {
            const s = getSettings();
            expect(s.urgency.enabled).toBe(false);
            expect(s.cartGoal.enabled).toBe(false);
            expect(s.recentSales.enabled).toBe(false);
            expect(s.promo.enabled).toBe(false);
            expect(s.exit.enabled).toBe(false);
        });

        it('applies merchant overrides for set keys only', () => {
            window.supermarketThemeSettings = { urgency: { enabled: true } };
            const s = getSettings();
            expect(s.urgency.enabled).toBe(true);
            expect(s.cartGoal.enabled).toBe(false);
            expect(s.promo.enabled).toBe(false);
        });

        it('preserves unknown top-level merchant keys through the merge', () => {
            window.supermarketThemeSettings = {
                urgency: { enabled: true },
                customFlag: 'x',
                customNested: { hello: 'world' },
            };
            const s = getSettings();
            expect(s.customFlag).toBe('x');
            expect(s.customNested).toEqual({ hello: 'world' });
        });
    });

    describe('inside editor', () => {
        beforeEach(() => setEditor(true));

        it('applies every DEMO_OVERRIDES key when merchant settings are undefined', () => {
            const s = getSettings();
            expect(s.urgency.enabled).toBe(true);
            expect(s.cartGoal.enabled).toBe(true);
            expect(s.cartGoal.items.length).toBeGreaterThan(0);
            // Verify the item shape matches what parseGoalItemsFromConfig()
            // in cartGoalBar.js expects — { amount: number, label: string, icon?: string }.
            // A length-only check would silently pass even if the keys were wrong.
            expect(s.cartGoal.items[0]).toEqual(expect.objectContaining({
                amount: expect.any(Number),
                label: expect.any(String),
            }));
            expect(s.recentSales.enabled).toBe(true);
            expect(s.promo.enabled).toBe(true);
            expect(s.promo.title).toBe(DEMO_OVERRIDES.promo.title);
            expect(s.exit.enabled).toBe(true);
        });

        it('respects merchant value that explicitly disables a feature', () => {
            window.supermarketThemeSettings = { promo: { enabled: false } };
            const s = getSettings();
            expect(s.promo.enabled).toBe(false);
            // Other keys still demoed
            expect(s.urgency.enabled).toBe(true);
            expect(s.cartGoal.enabled).toBe(true);
            expect(s.exit.enabled).toBe(true);
        });

        it('does not demo a key the merchant set to null', () => {
            window.supermarketThemeSettings = { urgency: null };
            const s = getSettings();
            // deepMerge warn-and-keep-default path fires
            expect(s.urgency.enabled).toBe(false);
            expect(warnSpy).toHaveBeenCalled();
            // Other keys still demoed
            expect(s.promo.enabled).toBe(true);
        });

        it('preserves unknown top-level merchant keys alongside demo fill', () => {
            window.supermarketThemeSettings = { customFlag: 'editor-x' };
            const s = getSettings();
            // Custom key survives the merge
            expect(s.customFlag).toBe('editor-x');
            // And demo still fills DEFAULTS-backed features
            expect(s.promo.enabled).toBe(true);
        });

        it('treats explicit undefined as "not set" and applies demo', () => {
            // Without the undefined-stripping sanitizer, `{ promo: undefined }`
            // would (a) wipe DEFAULTS.promo via the initial deepMerge since
            // deepMerge's warn path only guards non-undefined non-object
            // values, and (b) suppress the demo overlay because
            // hasOwnProperty would report promo as set. Verify both are
            // avoided: promo ends up with demo content, matching the
            // unset case.
            window.supermarketThemeSettings = { promo: undefined };
            const s = getSettings();
            expect(s.promo.enabled).toBe(true);
            expect(s.promo.title).toBe(DEMO_OVERRIDES.promo.title);
        });

        it('inherits DEFAULTS sub-keys through deep-merge', () => {
            const s = getSettings();
            // DEMO_OVERRIDES.urgency only sets enabled; sub-keys come from DEFAULTS
            expect(s.urgency.viewRange).toEqual(DEFAULTS.urgency.viewRange);
            expect(s.urgency.orderRange).toEqual(DEFAULTS.urgency.orderRange);
        });

        it('falls back to DEFAULTS (not demo) when merchant value is not a plain object', () => {
            window.supermarketThemeSettings = 'broken';
            const s = getSettings();
            expect(s.urgency.enabled).toBe(false);
            expect(s.promo.enabled).toBe(false);
            expect(warnSpy).toHaveBeenCalled();
        });
    });

    it('returns a fresh deep copy on every call (no shared references with DEMO_OVERRIDES)', () => {
        setEditor(true);
        const a = getSettings();
        a.cartGoal.items.push({ threshold: 9999, reward: 'leaked' });
        const b = getSettings();
        expect(b.cartGoal.items.some((i) => i.reward === 'leaked')).toBe(false);
    });
});

// Merged from the legacy co-located settings spec. These exercise the
// DEFAULTS shape and the merchant-merge path outside the theme editor.
describe('settings (merged from legacy spec)', () => {
    beforeEach(() => {
        delete window.supermarketThemeSettings;
        try { delete window.previewSdk; } catch (e) { /* noop */ }
    });

    it('exports DEFAULTS with all 5 feature keys', () => {
        expect(DEFAULTS).toHaveProperty('urgency');
        expect(DEFAULTS).toHaveProperty('cartGoal');
        expect(DEFAULTS).toHaveProperty('recentSales');
        expect(DEFAULTS).toHaveProperty('promo');
        expect(DEFAULTS).toHaveProperty('exit');
    });

    it('defaults urgency enabled=false', () => {
        expect(DEFAULTS.urgency.enabled).toBe(false);
    });

    it('defaults cartGoal enabled=false', () => {
        expect(DEFAULTS.cartGoal.enabled).toBe(false);
    });

    it('defaults recentSales enabled=false with source=best-sellers and maxShows=3', () => {
        expect(DEFAULTS.recentSales.enabled).toBe(false);
        expect(DEFAULTS.recentSales.source).toBe('best-sellers');
        expect(DEFAULTS.recentSales.timing.maxShows).toBe(3);
    });

    it('defaults all features enabled=false', () => {
        expect(DEFAULTS.urgency.enabled).toBe(false);
        expect(DEFAULTS.cartGoal.enabled).toBe(false);
        expect(DEFAULTS.recentSales.enabled).toBe(false);
        expect(DEFAULTS.promo.enabled).toBe(false);
        expect(DEFAULTS.exit.enabled).toBe(false);
    });

    it('getSettings returns defaults when no merchant override', () => {
        const s = getSettings();
        expect(s.urgency.enabled).toBe(false);
        expect(s.recentSales.enabled).toBe(false);
    });

    it('getSettings deep-merges merchant overrides', () => {
        window.supermarketThemeSettings = {
            urgency: { enabled: true, viewRange: [10, 50] },
        };
        const s = getSettings();
        expect(s.urgency.enabled).toBe(true);
        expect(s.urgency.viewRange).toEqual([10, 50]);
    });

    it('getSettings ignores non-object merchant config with console.warn', () => {
        window.supermarketThemeSettings = 'bad';
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const s = getSettings();
        expect(s).toEqual(DEFAULTS);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('getSettings disables a feature via merchant override', () => {
        window.supermarketThemeSettings = { urgency: { enabled: false } };
        const s = getSettings();
        expect(s.urgency.enabled).toBe(false);
    });

    it('returns an independent deep clone — mutating nested values does not leak into DEFAULTS', () => {
        const a = getSettings();
        const b = getSettings();
        // Arrays / nested objects must be distinct references across calls
        // and distinct from DEFAULTS itself.
        expect(a.urgency).not.toBe(b.urgency);
        expect(a.urgency.viewRange).not.toBe(b.urgency.viewRange);
        expect(a.urgency.viewRange).not.toBe(DEFAULTS.urgency.viewRange);

        // Mutating the returned settings must not affect DEFAULTS or a
        // subsequent call.
        a.urgency.viewRange.push(999);
        a.recentSales.excludePages.push('extra');
        expect(DEFAULTS.urgency.viewRange).toEqual([3, 25]);
        expect(b.urgency.viewRange).toEqual([3, 25]);
        expect(DEFAULTS.recentSales.excludePages).not.toContain('extra');
    });

    it('rejects non-object merchant value for an object branch and warns', () => {
        window.supermarketThemeSettings = { urgency: 'broken' };
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const s = getSettings();
        // Default urgency branch must survive the bad override untouched.
        expect(s.urgency.enabled).toBe(false);
        expect(s.urgency.viewRange).toEqual([3, 25]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
