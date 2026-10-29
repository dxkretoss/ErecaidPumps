/**
 * Guards the quietest failure mode of the Featured Promotions feature: a setting, a schema
 * label or a lang key that exists in one file and not the others. Nothing throws when that
 * happens — the storefront just renders an empty string or an untranslated `i18n.*` token.
 */

import config from '../../../../config.json';
import schema from '../../../../schema.json';
import schemaTranslations from '../../../../schemaTranslations.json';

import en from '../../../../lang/en.json';
import enCA from '../../../../lang/en-CA.json';
import fr from '../../../../lang/fr.json';
import frCA from '../../../../lang/fr-CA.json';

const SETTING_SHOW = 'show_featured_promotions';
const SETTING_BG = 'color_bg_featured_promotions';
const SETTING_TEXT = 'color_text_featured_promotions';

const LANG_FILES = {
    'en.json': en,
    'en-CA.json': enCA,
    'fr.json': fr,
    'fr-CA.json': frCA,
};

const productsGroup = schema.find(group => group.name === 'Products' || group.name === 'i18n.Products');
const settingById = id => productsGroup.settings.find(setting => setting.id === id);

/**
 * @param {String} hex `#rrggbb`
 * @returns {Number} WCAG relative luminance
 */
const luminance = hex => {
    const channels = hex.replace('#', '').match(/../g)
        .map(pair => parseInt(pair, 16) / 255)
        .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrastRatio = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
};

describe('Featured Promotions — config.json', () => {
    it('ships the three settings the templates and stylesheet read', () => {
        expect(config.settings[SETTING_SHOW]).toBe(true);
        expect(config.settings[SETTING_BG]).toMatch(/^#[0-9a-f]{6}$/);
        expect(config.settings[SETTING_TEXT]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('keeps the callout readable in the base theme', () => {
        expect(contrastRatio(config.settings[SETTING_BG], config.settings[SETTING_TEXT]))
            .toBeGreaterThanOrEqual(4.5);
    });

    it.each(config.variations.map(variation => [variation.name, variation]))(
        'keeps the callout readable in the %s variation',
        (name, variation) => {
            const bg = variation.settings[SETTING_BG] || config.settings[SETTING_BG];
            const text = variation.settings[SETTING_TEXT] || config.settings[SETTING_TEXT];

            // A variation that overrides one colour and inherits the other silently pairs two
            // palettes, so require both or neither.
            expect(Boolean(variation.settings[SETTING_BG])).toBe(Boolean(variation.settings[SETTING_TEXT]));
            expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(4.5);
        },
    );
});

describe('Featured Promotions — schema.json', () => {
    it('exposes the group in the Products section', () => {
        expect(productsGroup.settings).toContainEqual({
            type: 'heading',
            content: 'i18n.FeaturedPromotions',
        });
    });

    it('reloads the preview, because the callout is server-rendered markup', () => {
        expect(settingById(SETTING_SHOW)).toMatchObject({ type: 'checkbox', force_reload: true });
    });

    it.each([SETTING_BG, SETTING_TEXT])('hides %s while the feature is off', id => {
        expect(settingById(id)).toMatchObject({
            type: 'color',
            reference: SETTING_SHOW,
            reference_default: false,
        });
    });

    it('has every setting of the group backed by a real config.json default', () => {
        [SETTING_SHOW, SETTING_BG, SETTING_TEXT].forEach(id => {
            expect(config.settings).toHaveProperty(id);
        });
    });
});

describe('Featured Promotions — schemaTranslations.json', () => {
    const keys = [
        'i18n.FeaturedPromotions',
        'i18n.ShowFeaturedPromotions',
        'i18n.FeaturedPromotionBackgroundColor',
        'i18n.FeaturedPromotionTextColor',
    ];

    it.each(keys)('translates %s', key => {
        expect(schemaTranslations[key]).toBeDefined();
        expect(typeof schemaTranslations[key].default).toBe('string');
        expect(schemaTranslations[key].default.length).toBeGreaterThan(0);
    });

    it('leaves no i18n token in the group without a translation', () => {
        const groupKeys = productsGroup.settings
            .flatMap(setting => [setting.label, setting.content])
            .filter(value => typeof value === 'string' && value.startsWith('i18n.'));

        groupKeys.forEach(key => expect(schemaTranslations).toHaveProperty([key]));
    });
});

describe('Featured Promotions — lang files', () => {
    it.each(Object.keys(LANG_FILES))('%s carries the "+N more offers" plural', file => {
        const message = LANG_FILES[file].products?.featured_promotions?.more_offers;

        expect(typeof message).toBe('string');
        expect(message).toContain('{count, plural,');
        expect(message).toContain('one {');
        expect(message).toContain('other {');
    });

    it('gives the French locales an actual translation, not the English string', () => {
        expect(fr.products.featured_promotions.more_offers)
            .not.toBe(en.products.featured_promotions.more_offers);
        expect(frCA.products.featured_promotions.more_offers)
            .not.toBe(en.products.featured_promotions.more_offers);
    });
});
