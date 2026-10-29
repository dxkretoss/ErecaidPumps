/**
 * Demo overrides for the socialproof feature set.
 *
 * Consumed ONLY by getSettings() in settings.js, and ONLY when:
 *   1. isInThemeEditor() returns true
 *   2. window.supermarketThemeSettings[featureKey] is NOT set
 *
 * Each top-level key is deep-merged onto DEFAULTS[key] independently
 * so sub-keys not defined here (e.g. urgency.viewRange, exit.mobileDelay)
 * still inherit the production defaults.
 *
 * Every top-level feature in DEMO_OVERRIDES carries `__demo: true`. That
 * flag:
 *   - Is preserved through the deep-merge and lands in the final settings
 *     object at `settings.<feature>.__demo`.
 *   - Lets the runtime (see initDemoBanner in index.js) detect which
 *     features came from the demo source and surface a single top-level
 *     "Theme editor preview" banner telling the merchant what they are
 *     looking at and where to configure the real values.
 *   - Never appears on a merchant-configured feature because merchant
 *     values override the entire branch — so shoppers never see it.
 *
 * Content is English literals rather than lang/en.json entries because
 * this copy is merchant-preview only — never shopper-facing production
 * UI — so i18n is not warranted.
 *
 * Frozen at the top level; deepClone in settings.js produces the
 * per-call copy that callers may safely mutate.
 */
export const DEMO_OVERRIDES = Object.freeze({
    urgency: {
        enabled: true,
        __demo: true,
    },
    cartGoal: {
        enabled: true,
        items: [
            { amount: 50, icon: 'shipping', label: 'Free shipping' },
            { amount: 100, icon: 'discount', label: '10% off' },
        ],
        __demo: true,
    },
    recentSales: {
        enabled: true,
        __demo: true,
    },
    promo: {
        enabled: true,
        title: 'Welcome offer',
        description: 'Save 10% on your first order',
        coupon: 'WELCOME10',
        __demo: true,
    },
    exit: {
        enabled: true,
        title: 'Wait — don\'t leave yet',
        description: 'Here\'s 15% off to stay',
        coupon: 'STAY15',
        buttonText: 'Claim discount',
        __demo: true,
    },
});
