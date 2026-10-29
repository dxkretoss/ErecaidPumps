import _ from 'lodash';

/**
 * Parse CSV content to array of keyword objects
 * @param {string} csvText - CSV content
 * @returns {Array<{keyword: string, rank: number}>}
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const keywords = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            // eslint-disable-next-line no-continue
            continue;
        }

        const parts = line.split(',');
        if (parts.length >= 2) {
            const keyword = parts[0].trim().replace(/^["']|["']$/g, '');
            const rank = parseInt(parts[1].trim(), 10);

            if (keyword && !Number.isNaN(rank)) {
                keywords.push({ keyword, rank });
            }
        }
    }

    return keywords;
}

/**
 * Load CSV file with low priority using jQuery Ajax
 * @param {string} url - CSV file URL
 * @returns {Promise<Array<{keyword: string, rank: number}>>}
 */
function loadCSVFile(url) {
    return new Promise((resolve) => {
        // Use requestIdleCallback for low priority loading, fallback to setTimeout
        const loadFn = () => {
            $.ajax({
                url,
                method: 'GET',
                dataType: 'text',
                timeout: 5000,
                cache: true,
            })
                .done((text) => {
                    const keywords = parseCSV(text);
                    resolve(keywords);
                })
                .fail(() => {
                    // eslint-disable-next-line no-console
                    console.warn(`⚠️ Could not load keyword suggestions from ${url}`);
                    resolve([]);
                });
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(loadFn, { timeout: 5000 });
        } else {
            setTimeout(loadFn, 100);
        }
    });
}

// Shared data across all inputs (loaded once)
let sharedKeywordSuggestions = [];
let sharedSuggestionsLoaded = false;
let $sharedSuggestContainer = null;
let loadingPromise = null; // Track loading state

/**
 * Normalize URL - check if full URL or relative path
 * @param {string} url - File path or full URL
 * @returns {string} - Normalized URL
 */
function normalizeURL(url) {
    if (!url) {
        return '';
    }
    // If it's already a full URL (starts with http:// or https://), return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    // Otherwise, treat as relative path
    return url;
}

/**
 * Check if a URL is a relative path (not a full URL)
 * @param {string} url - File path or full URL
 * @returns {boolean} - True if relative path, false if full URL
 */
function isRelativePath(url) {
    // Treat empty strings and falsy values as relative paths
    if (!url) {
        return true;
    }
    return !url.startsWith('http://') && !url.startsWith('https://');
}

/**
 * Check if any of the keyword files use relative paths
 * @param {Object} config - Configuration object with file paths
 * @returns {boolean} - True if any file uses relative path
 */
function hasRelativePaths(config = {}) {
    const file1 = config.keywords_file1 === undefined
        ? '/content/suggest-keywords-1.csv'
        : config.keywords_file1;
    const file2 = config.keywords_file2 === undefined
        ? '/content/suggest-keywords-2.csv'
        : config.keywords_file2;
    const file3 = config.keywords_file3 === undefined
        ? '/content/suggest-keywords-3.csv'
        : config.keywords_file3;

    return isRelativePath(file1) || isRelativePath(file2) || isRelativePath(file3);
}

/**
 * Load CSV data once and cache it
 * @param {Object} config - Configuration object with file paths
 * @returns {Promise}
 */
function loadKeywordData(config = {}) {
    // If already loading, return the existing promise
    if (loadingPromise) {
        return loadingPromise;
    }

    // If already loaded, return resolved promise
    if (sharedSuggestionsLoaded) {
        return Promise.resolve();
    }

    // Get file paths from config
    // If config value is undefined, use default. If empty string, skip that file
    const file1 = config.keywords_file1 === undefined
        ? '/content/suggest-keywords-1.csv'
        : normalizeURL(config.keywords_file1);
    const file2 = config.keywords_file2 === undefined
        ? '/content/suggest-keywords-2.csv'
        : normalizeURL(config.keywords_file2);
    const file3 = config.keywords_file3 === undefined
        ? '/content/suggest-keywords-3.csv'
        : normalizeURL(config.keywords_file3);

    // Check if all files are empty
    if (!file1 && !file2 && !file3) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ All keyword files are empty, skipping load');
        loadingPromise = Promise.resolve();
        return loadingPromise;
    }

    // Only load files that have values
    const loadPromises = [];
    if (file1) loadPromises.push(loadCSVFile(file1));
    else loadPromises.push(Promise.resolve([]));

    if (file2) loadPromises.push(loadCSVFile(file2));
    else loadPromises.push(Promise.resolve([]));

    if (file3) loadPromises.push(loadCSVFile(file3));
    else loadPromises.push(Promise.resolve([]));

    // Start loading
    loadingPromise = Promise.all(loadPromises).then(([keywords1, keywords2, keywords3]) => {
        // Combine all keywords
        sharedKeywordSuggestions = [...keywords1, ...keywords2, ...keywords3];

        // Sort by rank (descending - higher rank = higher priority)
        sharedKeywordSuggestions.sort((a, b) => b.rank - a.rank);

        if (sharedKeywordSuggestions.length > 0) {
            sharedSuggestionsLoaded = true;
        } else {
            // eslint-disable-next-line no-console
            console.warn('⚠️ No keyword suggestions loaded');
        }
    });

    return loadingPromise;
}

/**
 * Initialize suggest keywords for a single input
 * @param {jQuery} $searchInput - Single search input element
 * @param {jQuery} $dropdown - Dropdown element
 * @param {Object} stencilDropDown - StencilDropDown instance
 * @param {Function} doSearch - Search function
 */
function initForInput($searchInput, $dropdown, stencilDropDown, doSearch) {
    // Instance-specific state
    let activeIndex = -1;
    let currentAutocomplete = null;
    let $autocompleteOverlay = null;
    let isUpdatingFromFocus = false;

    /**
     * Filter and return matching keyword suggestions
     * @param {string} query - Search query
     * @returns {Array<string>} - Array of matching keywords (max 10)
     */
    const getKeywordSuggestions = (query) => {
        if (!sharedSuggestionsLoaded) {
            return [];
        }

        // If no query, return top 10 keywords
        if (!query || query.trim().length === 0) {
            return sharedKeywordSuggestions.slice(0, 10).map(item => item.keyword);
        }

        const lowerQuery = query.toLowerCase().trim();
        const matches = [];

        // Use for loop instead of filter for better performance and early exit
        // Only match keywords that START with the query
        for (let i = 0; i < sharedKeywordSuggestions.length && matches.length < 10; i++) {
            const item = sharedKeywordSuggestions[i];
            const lowerKeyword = item.keyword.toLowerCase();

            // Check if keyword starts with query
            if (lowerKeyword.startsWith(lowerQuery)) {
                matches.push(item.keyword);
            }
        }

        return matches;
    };

    /**
     * Render keyword suggestions HTML
     * @param {Array<string>} keywords - Array of keyword strings
     * @returns {string} - HTML string
     */
    const renderKeywordSuggestions = (keywords) => {
        if (!keywords || keywords.length === 0) {
            return '';
        }

        const items = keywords.map((keyword, index) =>
            `<button type="button" class="supermarket__quickSearch-suggestion" data-keyword="${keyword}" data-index="${index}" data-prevent-quick-search-close tabindex="-1">
                <svg class="icon" aria-hidden="true"><use xlink:href="#icon-search"></use></svg>
                <span>${keyword}</span>
            </button>`).join('');

        return `<div class="supermarket__quickSearch-suggestions">${items}</div>`;
    };

    /**
     * Set active suggestion by index
     * @param {number} index - Index of suggestion to activate (-1 for none)
     */
    const setActiveIndex = (index) => {
        if (!$sharedSuggestContainer) return;

        const $suggestions = $sharedSuggestContainer.find('.supermarket__quickSearch-suggestion');
        $suggestions.removeClass('is-active');

        if (index >= 0 && index < $suggestions.length) {
            activeIndex = index;
            $suggestions.eq(index).addClass('is-active');
        } else {
            activeIndex = -1;
        }
    };

    /**
     * Update autocomplete overlay
     * @param {string} query - Current search query
     * @param {string} suggestion - Suggestion to show
     */
    const updateAutocomplete = (query, suggestion) => {
        if (!$autocompleteOverlay) {
            $autocompleteOverlay = $searchInput.closest('.form-field').find('.supermarket__quickSearch-autocomplete');
            if (!$autocompleteOverlay.length) {
                // eslint-disable-next-line no-console
                console.warn('⚠️ Autocomplete overlay not found');
                return;
            }
        }

        if (suggestion && query && suggestion.toLowerCase().startsWith(query.toLowerCase())) {
            currentAutocomplete = suggestion;
            // Show full suggestion with query part invisible
            const remaining = suggestion.substring(query.length);
            $autocompleteOverlay.html(`<span style="visibility: hidden;">${query}</span>${remaining}`);
        } else {
            currentAutocomplete = null;
            $autocompleteOverlay.empty();
        }
    };

    /**
     * Select keyword and fill into search input
     * @param {string} keyword - Keyword to select
     */
    const selectKeyword = (keyword) => {
        if ($searchInput && keyword) {
            $searchInput.val(keyword);
            activeIndex = -1;
            currentAutocomplete = null;
            if ($autocompleteOverlay) {
                $autocompleteOverlay.empty();
            }

            // Trigger quick search directly
            doSearch(keyword);

            // Focus back to input
            $searchInput.focus();
        }
    };

    /**
     * Accept current autocomplete suggestion
     * @returns {boolean} - Whether autocomplete was accepted
     */
    const acceptAutocomplete = () => {
        if (currentAutocomplete && $searchInput) {
            const acceptedKeyword = currentAutocomplete;
            $searchInput.val(acceptedKeyword);
            currentAutocomplete = null;
            if ($autocompleteOverlay) {
                $autocompleteOverlay.empty();
            }

            // Trigger quick search with the accepted keyword
            doSearch(acceptedKeyword);

            // Manually trigger update with the accepted keyword
            // Use setTimeout to let value update first
            setTimeout(() => {
                const suggestions = getKeywordSuggestions(acceptedKeyword);
                if (suggestions.length > 0) {
                    // Update autocomplete with next suggestion
                    updateAutocomplete(acceptedKeyword, suggestions[0]);

                    // Update suggestions list
                    if ($sharedSuggestContainer) {
                        const html = renderKeywordSuggestions(suggestions);
                        $sharedSuggestContainer.html(html).show();

                        // Unbind old events before binding new ones
                        $sharedSuggestContainer.find('.supermarket__quickSearch-suggestion').off('click').on('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const keyword = $(e.currentTarget).data('keyword');
                            selectKeyword(keyword);
                        });
                    }
                }
            }, 0);
            return true;
        }
        return false;
    };

    /**
     * Update keyword suggestions display
     * @param {string} query - Current search query
     */
    const updateKeywordSuggestions = (query) => {
        if (!sharedSuggestionsLoaded) {
            return;
        }

        // Cache container on first use
        if (!$sharedSuggestContainer) {
            $sharedSuggestContainer = $dropdown.find('.supermarket__quickSearch-keywordSuggest');
            if (!$sharedSuggestContainer.length) {
                return;
            }
        }

        const suggestions = getKeywordSuggestions(query);
        activeIndex = -1; // Reset active index

        // Update autocomplete with first suggestion
        if (query && query.trim().length > 0 && suggestions.length > 0) {
            updateAutocomplete(query, suggestions[0]);
        } else {
            updateAutocomplete(null, null);
        }

        // Only update DOM if there are changes
        if (suggestions.length > 0) {
            const html = renderKeywordSuggestions(suggestions);
            $sharedSuggestContainer.html(html).show();

            // Unbind old events before binding new ones to prevent duplicates
            $sharedSuggestContainer.find('.supermarket__quickSearch-suggestion').off('click').on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const keyword = $(e.currentTarget).data('keyword');
                selectKeyword(keyword);
            });

            // Show dropdown if not updating from focus
            if (!isUpdatingFromFocus && stencilDropDown) {
                stencilDropDown.show($dropdown);
            }
        } else {
            $sharedSuggestContainer.hide().empty();
        }
    };

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     * @returns {boolean} - Whether event was handled
     */
    const handleKeyboardNavigation = (e) => {
        // Handle Right Arrow for autocomplete
        if (e.key === 'ArrowRight') {
            if (currentAutocomplete && $searchInput) {
                const cursorPos = $searchInput[0].selectionStart;
                const inputLength = $searchInput.val().length;
                // Only accept if cursor is at the end
                if (cursorPos === inputLength) {
                    e.preventDefault();
                    acceptAutocomplete();
                    return true;
                }
            }
            return false;
        }

        if (!$sharedSuggestContainer || !$sharedSuggestContainer.is(':visible')) {
            return false;
        }

        const $suggestions = $sharedSuggestContainer.find('.supermarket__quickSearch-suggestion');
        if ($suggestions.length === 0) {
            return false;
        }

        switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            setActiveIndex(activeIndex < $suggestions.length - 1 ? activeIndex + 1 : 0);
            return true;

        case 'ArrowUp':
            e.preventDefault();
            setActiveIndex(activeIndex > 0 ? activeIndex - 1 : $suggestions.length - 1);
            return true;

        case 'Enter':
            if (activeIndex >= 0) {
                e.preventDefault();
                const keyword = $suggestions.eq(activeIndex).data('keyword');
                selectKeyword(keyword);
                return true;
            }
            break;

        case 'Escape':
            e.preventDefault();
            activeIndex = -1;
            setActiveIndex(-1);
            updateAutocomplete(null, null);
            return true;

        default:
            // Reset active index when typing
            activeIndex = -1;
            setActiveIndex(-1);
            break;
        }

        return false;
    };

    // Debounced version for better performance (100ms = responsive but not laggy)
    const debouncedUpdateKeywordSuggestions = _.debounce(updateKeywordSuggestions, 100);

    // Bind input event to update suggestions
    $searchInput.on('input', () => {
        const query = $searchInput.val();
        debouncedUpdateKeywordSuggestions(query);
    });

    /**
     * Handle focus event to show suggestions
     */
    const handleFocusUpdate = () => {
        if (sharedSuggestionsLoaded) {
            isUpdatingFromFocus = true;
            const searchQuery = $searchInput.val();
            updateKeywordSuggestions(searchQuery || '');

            // Manually show dropdown if there are suggestions
            const suggestions = getKeywordSuggestions(searchQuery || '');
            if (suggestions && suggestions.length > 0 && stencilDropDown) {
                stencilDropDown.show($dropdown);
            }

            isUpdatingFromFocus = false;
        }
    };

    // Bind focus event to show suggestions immediately
    $searchInput.on('focus', handleFocusUpdate);

    // Bind keyboard navigation
    $searchInput.on('keydown', (e) => {
        handleKeyboardNavigation(e);
    });

    // Return public methods for lazy loading support
    return {
        updateOnFocus: handleFocusUpdate,
    };
}

/**
 * Initialize suggest keywords feature
 * @param {Object} options - Configuration options
 * @param {jQuery} options.$dropdown - Dropdown element
 * @param {jQuery} options.$searchInputs - Search input elements (desktop & mobile)
 * @param {Object} options.stencilDropDown - StencilDropDown instance
 * @param {Function} options.doSearch - Search function
 * @param {Object} options.context - Page context with themeSettings
 */
export default function suggestKeywords(options) {
    const {
        $dropdown, $searchInputs, stencilDropDown, doSearch, context,
    } = options;

    // Get config from context.themeSettings
    const config = (context && context.themeSettings) ? {
        keywords_file1: context.themeSettings.keywords_file1,
        keywords_file2: context.themeSettings.keywords_file2,
        keywords_file3: context.themeSettings.keywords_file3,
    } : {};

    // Check if we should use lazy loading
    // Use lazy loading if any file uses relative path and we're not on search page
    const shouldLazyLoad = hasRelativePaths(config) && context && context.template !== 'pages/search';

    if (shouldLazyLoad) {
        // Lazy loading mode: Load CSV on first focus
        let hasLoadedOnFocus = false;
        const inputInstances = [];

        $searchInputs.each((index, input) => {
            const $input = $(input);
            const instance = initForInput($input, $dropdown, stencilDropDown, doSearch);
            inputInstances.push(instance);

            // Add one-time focus handler to load data
            $input.one('focus', () => {
                if (!hasLoadedOnFocus) {
                    hasLoadedOnFocus = true;
                    loadKeywordData(config).then(() => {
                        // Update all instances after loading
                        inputInstances.forEach(inst => inst.updateOnFocus());
                    });
                }
            });
        });
    } else {
        // Immediate loading mode: Load CSV immediately
        // This happens when:
        // 1. All files use full URLs (external servers with cache support), OR
        // 2. We're on the search page
        loadKeywordData(config);

        // Initialize for each search input (desktop & mobile)
        $searchInputs.each((index, input) => {
            initForInput($(input), $dropdown, stencilDropDown, doSearch);
        });
    }
}
