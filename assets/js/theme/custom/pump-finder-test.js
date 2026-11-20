import { initPumpFinderCatalog, fetchAllCatalogProducts, calculateClinicalMatches } from './pump-finder-catalog';

(function () {
    // Expose functions globally for interactive testing from DevTools console
    if (typeof window !== 'undefined') {
        window.initPumpFinderCatalog = initPumpFinderCatalog;
        window.fetchEligiblePumpProducts = initPumpFinderCatalog;
        window.fetchAllCatalogProducts = fetchAllCatalogProducts;
        window.testPumpFinderGraphQL = initPumpFinderCatalog;
        window.calculateClinicalMatches = calculateClinicalMatches;
    }

    function runWhenReady() {
        // Run after the page and context are ready
        setTimeout(() => {
            initPumpFinderCatalog();
        }, 150);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runWhenReady);
        } else {
            runWhenReady();
        }
    }
})();
