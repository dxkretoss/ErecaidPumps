import _ from 'lodash';
import utils from '@bigcommerce/stencil-utils';
import StencilDropDown from './stencil-dropdown';
import suggestKeywords from './suggest-keywords';

export default function (context) {
    const TOP_STYLING = 'top: 49px;';
    const $quickSearchResults = $('.quickSearchResults');
    const $quickSearchDiv = $('#quickSearch');
    const $searchQuery = $('#search_query');
    const $searchQueryMobile = $('#search_query_mobile');
    const enableSuggestKeywords = context.themeSettings && context.themeSettings.suggest_keywords;

    const stencilDropDownExtendables = {
        hide: () => {
            // papathemes-supermarket: fix issue when selecting the search text from right to left by mouse
            if ($searchQuery.is(':hidden')) {
                $searchQuery.trigger('blur');
            }
        },
        show: (event) => {
            // Only trigger focus if not already focused to prevent infinite loop
            if (!$searchQuery.is(':focus') && $searchQuery.is(':visible')) {
                $searchQuery.trigger('focus');
            } else if (!$searchQueryMobile.is(':focus') && $searchQueryMobile.is(':visible')) {
                $searchQueryMobile.trigger('focus');
            }

            if (typeof event !== 'undefined') { // emthemesModez: fix for showing dropdown results
                event.stopPropagation();
            }

            // Supermarket
            $quickSearchDiv.css('top', '');
            if ($quickSearchDiv.offset().top < window.scrollY) {
                $quickSearchDiv.css('top', `${window.scrollY + $('[data-stickymenu]').height()}px`);
            }
        },
    };
    const stencilDropDown = new StencilDropDown(stencilDropDownExtendables);
    stencilDropDown.bind($('[data-search="quickSearch"]'), $quickSearchDiv, TOP_STYLING);

    stencilDropDownExtendables.onBodyClick = (e, $container) => {
        // If the target element has this data tag or one of it's parents, do not close the search results
        // We have to specify `.modal-background` because of limitations around Foundation Reveal not allowing
        if ($(e.target).closest('[data-prevent-quick-search-close], .modal-background').length === 0) {
            stencilDropDown.hide($container);
        }

        // Papathemes - Supermarket: close popup if click on the overlay
        if ($(e.target).is('.emthemesModez-overlay')) {
            stencilDropDown.hide($container);
        }
    };

    // papathemes-supermarket: show/hide loading indicator functions
    const $form = $('[data-search-quick]').closest('form');
    const showLoading = () => {
        $form.addClass('_loading');
    };
    const hideLoading = () => {
        $form.removeClass('_loading');
    };

    // stagger searching for 1200ms after last input
    const debounceWaitTime = 1200;
    const doSearch = _.debounce((searchQuery) => {
        showLoading(); // papathemes-supermarket
        utils.api.search.search(searchQuery, { template: 'search/quick-results' }, (err, response) => {
            hideLoading(); // papathemes-supermarket
            if (err) {
                return false;
            }

            $quickSearchResults.html(response);
            stencilDropDown.show($quickSearchDiv); // emthemesModez: show drop-down results after search results retrieved
        });
    }, debounceWaitTime);

    // Initialize suggest keywords feature if enabled (both desktop & mobile)
    if (enableSuggestKeywords) {
        suggestKeywords({
            $dropdown: $quickSearchDiv,
            $searchInputs: $('[data-search-quick]'), // Select all search inputs
            stencilDropDown,
            doSearch,
            context, // Pass context for accessing themeSettings
        });
    }

    utils.hooks.on('search-quick', (event, currentTarget) => {
        const searchQuery = $(currentTarget).val();

        // server will only perform search with at least 3 characters
        if (searchQuery.length < 2) {
            return;
        }

        doSearch(searchQuery);
    });

    // Catch the submission of the quick-search
    // $quickSearchDiv.on('submit', (event) => { // emthemesModez fix bug don't stop form submit
    $searchQuery.closest('form').on('submit', (event) => {
        const searchQuery = $(event.currentTarget).find('input').val();

        if (searchQuery.length === 0) {
            return event.preventDefault();
        }

        return true;
    });

    // Supermarket: close quick search when InstantLoad finish loading
    $('body').on('loaded.instantload', () => stencilDropDown.hide($quickSearchDiv));
}
