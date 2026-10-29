import mediaQueryListFactory from '../theme/common/media-query-list';

const mq = mediaQueryListFactory('medium');

export default function () {
    // Make "Categories" button press-able
    $('.navPages .emthemesModez-navPages-verticalCategories-container > .navPages-action').addClass('_fixGroupedMenuADA').attr('role', 'button').attr('tabindex', '0');

    // Listen Enter | Space keydown on [data-collapsible] menu item
    $('body').on('keydown', '.navPages-list [data-collapsible][data-collapsible-disabled-breakpoint="medium"]', (event) => {
        if (!mq.matches) return;

        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
            const $a = $(event.target);

            // press second time to open link
            if ($a.hasClass('is-focus')) return;

            // stop if level-2 menu item of mega menu, which already opened
            if ($a.is('.navPage-subMenu-action') && $a.closest('.navPage-subMenu--standard').length === 0) return;

            // stop open link
            event.preventDefault();

            // open the menu
            $a.addClass('is-focus');

            const targetId = $a.data('collapsible');
            const $target = $(`#${targetId}`);
            $target.addClass('is-focus-open').attr('aria-hidden', 'false');
        }
    });

    // Listen Enter | Space keydown on .navPages-action--fitNav-more menu item
    $('body').on('keydown', '.navPages-list .navPages-action--fitNav-more', (event) => {
        if (!mq.matches) return;

        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
            const $a = $(event.target);
            // stop open link
            event.preventDefault();

            // open the menu
            $a.toggleClass('is-focus');

            // open or close the categories menu
            const $target = $a.siblings('.navPage-subMenu');
            if ($a.hasClass('is-focus')) {
                $target.addClass('is-focus-open').attr('aria-hidden', 'false');
            } else {
                $target.removeClass('is-focus-open');
                $target.find('.is-focus').removeClass('is-focus');
                $target.find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
            }
        }
    });

    // Listen Enter | Space keydown on "Categories" button
    $('body').on('keydown', '.navPages-action._fixGroupedMenuADA', (event) => {
        if (!mq.matches) return;

        if (event.key === 'Enter' || event.key === ' ') {
            const $a = $(event.target);
            // stop open link
            event.preventDefault();

            // open the menu
            $a.toggleClass('is-focus');

            // open or close the categories menu
            const $target = $('#emthemesModez-verticalCategories');
            if ($a.hasClass('is-focus')) {
                $target.addClass('is-focus-open').attr('aria-hidden', 'false');
            } else {
                $target.removeClass('is-focus-open');
                $target.find('.is-focus').removeClass('is-focus');
                $target.find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
            }
        }
    });

    // Listen 'focus' on menu item
    $('body').on('focus', '.navPages-action', (event) => {
        if (!mq.matches) return;

        const $a = $(event.target);
        // close siblings menu and descendants when focus on another menu item
        $a.parent().siblings().find('.is-focus').removeClass('is-focus');
        $a.parent().siblings().find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
    });

    // Listen Escape keydown on menu item
    $('body').on('keydown', '.navPages-action', (event) => {
        if (!mq.matches) return;

        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
            const $a = $(event.target);

            if ($a.is('.is-focus[data-collapsible]')) {
                // close the current menu and descendants
                $a.parent().find('.is-focus').removeClass('is-focus');
                $a.parent().find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
            } else {
                const menuId = $a.closest('.is-focus-open').attr('id');
                let $item;

                if (menuId === 'emthemesModez-verticalCategories') {
                    $item = $a.closest('.emthemesModez-navPages-verticalCategories-container').find('.navPages-action._fixGroupedMenuADA');
                } else if (menuId) {
                    $item = $(`.is-focus[data-collapsible="${menuId}"]`);
                } else {
                    $item = $a.closest('.is-focus-open').siblings('.is-focus');

                    // close the submenu of the current focus menu item
                    if ($item.length === 0) {
                        $item = $a;
                    }
                }

                // back to the parent menu item and close the parent menu & descendants
                $item.parent().find('.is-focus').removeClass('is-focus');
                $item.parent().find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
                $item.trigger('focus');
            }
        }
    });

    $('body').on('click', (event) => {
        if (!mq.matches) return;

        const $el = $(event.target);
        // Close all menus when click outside
        if ($el.closest('.navPages-list').length === 0) {
            $('.navPages-list').find('.is-focus').removeClass('is-focus');
            $('.navPages-list').find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
        }

        // close the 'categories' grouped vertical menu
        if ($el.closest('.emthemesModez-navPages-verticalCategories-container').length === 0) {
            $('.emthemesModez-navPages-verticalCategories-container').find('.is-focus').removeClass('is-focus');
            $('.emthemesModez-navPages-verticalCategories-container').find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
        }
    });

    $('body').on('focusout', '.navPages-action', (event) => {
        if (!mq.matches) return;

        const $a = $(event.target);

        // Close all menus when focus out the latest menu item
        setTimeout(() => {
            const $navPagesList = $a.closest('.navPages-list');
            const $verticalCategoriesContainer = $a.closest('.emthemesModez-navPages-verticalCategories-container');
            const $containers = $().add($navPagesList).add($verticalCategoriesContainer);
            const focusEl = $(':focus')[0];
            const contain = focusEl && $containers.find(focusEl).length > 0;

            if (!contain) {
                $containers.find('.is-focus').removeClass('is-focus');
                $containers.find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
            }
        }, 500);
    });

    mq.addListener((media) => {
        if (!media.matches) {
            $('.navPages-list').find('.is-focus').removeClass('is-focus');
            $('.navPages-list').find('.is-focus-open').removeClass('is-focus-open').attr('aria-hidden', 'true');
        }
    });
}
