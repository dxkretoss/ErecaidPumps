import './global/jquery-migrate';
import './common/select-option-plugin';
import PageManager from '../page-manager';
import quickSearch from './global/quick-search';
import currencySelector from './global/currency-selector';
import mobileMenuToggle from './global/mobile-menu-toggle';
import menu from './global/menu';
import foundation from './global/foundation';
import quickView from './global/quick-view';
import cartPreview from './global/cart-preview';
import privacyCookieNotification from './global/cookieNotification';
import carousel from './common/carousel';
import svgInjector from './global/svg-injector';
import accessibility from '../emthemes-modez/accessibility';
import { initPageTransition } from './supermarketPageTransition';

// emthemesModez added
import emthemesModez from '../emthemes-modez/theme';
import initSocialProof from './papathemes/socialproof';

export default class Global extends PageManager {
    onReady() {
        const {
            cartId,
        } = this.context;
        cartPreview(this.context.secureBaseUrl, this.context.cartId);
        quickSearch(this.context);
        currencySelector(cartId);
        foundation($(document));
        quickView(this.context);
        carousel();
        menu();
        mobileMenuToggle();
        privacyCookieNotification();
        emthemesModez(this.context); // emthemesModez added
        accessibility(); // papathemes-supermarket
        svgInjector();
        if (this.context.themeSettings.page_transition) {
            this._destroyPageTransition = initPageTransition();
        }

        // papathemes-socialproof — initial hydration for the first page.
        // initSocialProof now returns a destroy() that tears down every
        // listener / timer / observer it installed, so re-initializations
        // on InstantLoad navigation do NOT accumulate handlers over time.
        this._destroySocialProof = initSocialProof(this.context);

        // InstantLoad swaps page content via `loaded.instantload` without
        // re-running Global.onReady (templates/layout/instantload-base.html
        // calls `stencilBootstrap(..., false)` — `loadGlobal=false`).
        // Without a hook here, urgency / stock pill / cart goal bar /
        // recent sales on newly-loaded pages would not get hydrated.
        // Run the PREVIOUS destroy() before calling initSocialProof again
        // with the freshest per-page context (exposed by InstantLoad on
        // `window.themeInstantLoad_jsContext`).
        this._onInstantLoadSocialProof = () => {
            if (typeof this._destroySocialProof === 'function') {
                try { this._destroySocialProof(); } catch (e) { /* noop */ }
                this._destroySocialProof = null;
            }
            const instantLoadContext = (typeof window !== 'undefined'
                && window.themeInstantLoad_jsContext)
                || this.context;
            this._destroySocialProof = initSocialProof(instantLoadContext);
        };
        $(document).off('loaded.instantload', this._onInstantLoadSocialProof);
        $(document).on('loaded.instantload', this._onInstantLoadSocialProof);
    }

    destroy() {
        if (typeof this._destroyPageTransition === 'function') {
            this._destroyPageTransition();
            this._destroyPageTransition = null;
        }
        if (this._onInstantLoadSocialProof) {
            $(document).off('loaded.instantload', this._onInstantLoadSocialProof);
            this._onInstantLoadSocialProof = null;
        }
        if (typeof this._destroySocialProof === 'function') {
            try { this._destroySocialProof(); } catch (e) { /* noop */ }
            this._destroySocialProof = null;
        }
    }
}
