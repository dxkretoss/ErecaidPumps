import $ from 'jquery';
import utils from '@bigcommerce/stencil-utils';
import modalFactory, { ModalEvents } from '../theme/global/modal';
import Cookies from 'js-cookie';
import { isInThemeEditor } from '../theme/papathemes/socialproof/editorMode';

let singletonModal;

function getModal() {
    if (!singletonModal) {
        singletonModal = modalFactory('#newsletterPopupModal')[0];
        singletonModal.$modal
            .on(ModalEvents.open, () => {
                $('body').addClass('has-activeModal--newsletter');
            })
            .on(ModalEvents.closed, () => {
                $('body').removeClass('has-activeModal--newsletter');
            });

        singletonModal.$content.on('change', 'input[name=hide]', (event) => {
            const $el = $(event.target);
            if ($el.prop('checked')) {
                Cookies.set('NL_POPUP_HIDE', 1, { expires: 1 });
            } else {
                Cookies.remove('NL_POPUP_HIDE');
            }
        });
    }
    return singletonModal;
}

function showPopup(context) {
    utils.api.getPage(`${context.urls.search}?search_query=&section=content`, { template: 'emthemes-modez/newsletter/popup-banner' }, (err, resp) => {
        const modal = getModal();
        modal.updateContent(resp);
        modal.$content.find('#newsletterPopup-form-placeholder').empty().append(modal.$content.find('#newsletterPopup-form'));
        modal.open({ size: 'small', pending: false, clearContent: false });
    });
}

/** Suppress the popup for a subscribed user for 7 days. */
export function hideForSubscribed() {
    Cookies.set('NL_POPUP_HIDE', 1, { expires: 7 });
}

/** Legacy auto-init: show the newsletter popup when due. */
export default function (context) {
    if (isInThemeEditor()) {
        return;
    }

    // Bail when the new socialproof PopupManager is active — it registers the
    // newsletter via newsletterPopupDef() below, so running here would open twice.
    if (typeof window !== 'undefined' && window.__papathemesSocialproofActive) {
        return;
    }

    if (!Cookies.get('NL_POPUP_HIDE')) {
        let last = parseInt(Cookies.get('NL_POPUP_LAST'), 10);
        if (Number.isNaN(last)) {
            last = 0;
        }

        let hideSec = parseInt(context.themeSettings.nl_popup_hide, 10);
        if (Number.isNaN(hideSec)) {
            hideSec = 0;
        }

        if (last === 0 || hideSec === 0 || last + hideSec * 1000 <= Date.now()) {
            let waitSec = parseInt(context.themeSettings.nl_popup_start, 10);
            if (Number.isNaN(waitSec)) {
                waitSec = 0;
            }

            setTimeout(() => {
                // Re-check at fire-time: global.js runs this auto-init BEFORE
                // initSocialProof(), so the flag is unset on entry but is set by
                // the time the delay elapses. Bail so PopupManager owns the popup.
                if (typeof window !== 'undefined' && window.__papathemesSocialproofActive) return;
                if (!Cookies.get('NL_POPUP_HIDE')) {
                    Cookies.set('NL_POPUP_LAST', Date.now(), { expires: 1 });
                    showPopup(context);
                }
            }, waitSec * 1000);
        }
    }
}

/** Build a popup definition consumable by the socialproof PopupManager. */
export function newsletterPopupDef(context) {
    const settings = (context && context.themeSettings)
        || (typeof window !== 'undefined' && window.PP_CONTEXT && window.PP_CONTEXT.themeSettings)
        || {};
    const scope = settings.nl_popup_show || 'hide';
    // Number.isFinite (not `|| fallback`) so a legitimate 0 ("no delay" /
    // "no cooldown") is preserved instead of being coerced to the fallback.
    let delaySec = parseInt(settings.nl_popup_start, 10);
    if (!Number.isFinite(delaySec)) delaySec = 0;
    let hideSec = parseInt(settings.nl_popup_hide, 10);
    if (!Number.isFinite(hideSec)) hideSec = 0;

    return {
        type: 'newsletter',
        priority: 3,
        delay: delaySec,
        isExitIntent: false,

        canShow() {
            if (scope === 'hide' || scope === '') return false;
            // Supermarket's home body class is `papaSupermarket-pageType--home`;
            // also accept legacy `body-home` so the guard stays portable in forks.
            if (scope === 'home') {
                const { classList } = document.body;
                const isHome = classList.contains('papaSupermarket-pageType--home')
                    || classList.contains('body-home');
                if (!isHome) return false;
            }
            if (Cookies.get('NL_POPUP_HIDE')) return false;
            // Replicate legacy NL_POPUP_LAST + nl_popup_hide cooldown so the
            // modal does not reappear on every page load within the window.
            let last = parseInt(Cookies.get('NL_POPUP_LAST'), 10);
            if (Number.isNaN(last)) last = 0;
            if (last > 0 && hideSec > 0 && last + hideSec * 1000 > Date.now()) {
                return false;
            }
            return true;
        },

        show(managerOnClose) {
            try {
                showPopup(context);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[papathemes-socialproof] newsletter showPopup failed', e);
                // Re-throw so PopupManager's tryShow() handles teardown AND skips
                // markShown — otherwise NL_POPUP_LAST would be set despite the
                // modal never opening, suppressing the popup during the cooldown.
                throw e;
            }

            // Notify the manager on user dismissal (X / overlay / Esc) so it unlocks scroll and clears activePopup.
            const modal = getModal();
            const $modal = modal && modal.$modal;
            let closedHandler = null;
            if ($modal && typeof managerOnClose === 'function') {
                closedHandler = () => { managerOnClose(); };
                $modal.one(ModalEvents.closed, closedHandler);
            }

            return () => {
                try {
                    if ($modal && closedHandler) {
                        $modal.off(ModalEvents.closed, closedHandler);
                        closedHandler = null;
                    }
                    if (modal && typeof modal.close === 'function') modal.close();
                } catch (e) { /* noop */ }
            };
        },

        markShown() {
            // NL_POPUP_LAST carries the cooldown timestamp. NL_POPUP_HIDE is
            // deliberately NOT touched — that is the explicit opt-out path with a
            // different 7-day lifetime (hideForSubscribed()).
            Cookies.set('NL_POPUP_LAST', Date.now(), { expires: 1 });
        },
    };
}
