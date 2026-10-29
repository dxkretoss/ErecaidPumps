import { PopupManager } from '../../../../theme/papathemes/socialproof/popupManager';

describe('PopupManager', () => {
    afterEach(() => {
        document.body.className = '';
        document.body.removeAttribute('data-papathemes-scroll-lock');
        document.body.style.overflow = '';
        document.body.innerHTML = '';
    });

    it('sorts popups by priority ascending on start', () => {
        const mgr = new PopupManager();
        const make = (type, priority) => ({
            type,
            priority,
            delay: 0,
            canShow: () => false, // prevent auto-show during the sort assertion
            show: () => () => {},
            markShown: () => {},
            isExitIntent: false,
        });
        mgr.register(make('newsletter', 3));
        mgr.register(make('promo', 2));
        mgr.register(make('exit', 1));
        mgr.start();
        expect(mgr.popups.map(p => p.type)).toEqual(['exit', 'promo', 'newsletter']);
        mgr.destroy();
    });

    it('tryShow defers if another popup is already active', () => {
        const mgr = new PopupManager();
        const shown = [];
        mgr.register({
            type: 'a',
            priority: 1,
            delay: 0,
            canShow: () => true,
            show: () => { shown.push('a'); return () => {}; },
            markShown: () => {},
            isExitIntent: false,
        });
        mgr.register({
            type: 'b',
            priority: 2,
            delay: 0,
            canShow: () => true,
            show: () => { shown.push('b'); return () => {}; },
            markShown: () => {},
            isExitIntent: false,
        });
        mgr.popups.sort((x, y) => x.priority - y.priority);
        mgr.tryShow(mgr.popups[0]);
        expect(shown).toEqual(['a']);
        // Active popup should block the second show.
        mgr.tryShow(mgr.popups[1]);
        expect(shown).toEqual(['a']);
    });

    it('canShow returning false skips popup', () => {
        const mgr = new PopupManager();
        let shownCalled = false;
        mgr.register({
            type: 'x',
            priority: 1,
            delay: 0,
            canShow: () => false,
            show: () => { shownCalled = true; return () => {}; },
            markShown: () => {},
            isExitIntent: false,
        });
        mgr.popups.sort((x, y) => x.priority - y.priority);
        mgr.tryShow(mgr.popups[0]);
        expect(shownCalled).toBe(false);
    });

    it('hasConflictingOverlay detects activeModal body class', () => {
        const mgr = new PopupManager();
        document.body.classList.add('has-activeModal');
        expect(mgr.hasConflictingOverlay()).toBe(true);
        document.body.classList.remove('has-activeModal');
        expect(mgr.hasConflictingOverlay()).toBe(false);
    });

    it('queues a popup blocked by a conflict and retries it after the conflict clears', (done) => {
        jest.useFakeTimers();
        const mgr = new PopupManager();
        let shown = false;
        const popup = {
            type: 'promo',
            priority: 2,
            delay: 0,
            canShow: () => true,
            show: () => { shown = true; return () => {}; },
            markShown: () => {},
            isExitIntent: false,
        };
        mgr.register(popup);
        mgr.popups.sort((a, b) => a.priority - b.priority);

        // Simulate a conflicting overlay (e.g., cart drawer open) at
        // the moment the timer-based popup fires.
        document.body.classList.add('has-activeModal');
        mgr.tryShow(popup);
        expect(shown).toBe(false);
        expect(mgr._pending.has(popup)).toBe(true);

        // User closes the overlay a little later.
        document.body.classList.remove('has-activeModal');

        // Advance through one retry interval; the popup should now fire.
        jest.advanceTimersByTime(1100);
        expect(shown).toBe(true);
        expect(mgr._pending.has(popup)).toBe(false);

        mgr.destroy();
        jest.useRealTimers();
        done();
    });

    it('does NOT retry popups vetoed by their own canShow (frequency cap)', (done) => {
        jest.useFakeTimers();
        const mgr = new PopupManager();
        let shownCount = 0;
        const popup = {
            type: 'exit',
            priority: 1,
            delay: 0,
            // canShow returns false — this is a popup-side veto (e.g.,
            // frequency cap), NOT a transient conflict. Manager must not
            // queue for retry.
            canShow: () => false,
            show: () => { shownCount += 1; return () => {}; },
            markShown: () => {},
            isExitIntent: false,
        };
        mgr.register(popup);
        mgr.popups.sort((a, b) => a.priority - b.priority);
        mgr.tryShow(popup);
        expect(shownCount).toBe(0);
        expect(mgr._pending.has(popup)).toBe(false);

        // No retry timer should exist.
        expect(mgr._retryTimer).toBeNull();

        jest.advanceTimersByTime(5000);
        expect(shownCount).toBe(0);

        mgr.destroy();
        jest.useRealTimers();
        done();
    });

    it('destroy clears pending retry timer + pending set', () => {
        jest.useFakeTimers();
        const mgr = new PopupManager();
        const popup = {
            type: 'promo',
            priority: 2,
            delay: 0,
            canShow: () => true,
            show: () => () => {},
            markShown: () => {},
            isExitIntent: false,
        };
        mgr.register(popup);
        document.body.classList.add('has-activeModal');
        mgr.tryShow(popup);
        expect(mgr._pending.size).toBe(1);
        expect(mgr._retryTimer).not.toBeNull();

        mgr.destroy();
        expect(mgr._pending.size).toBe(0);
        expect(mgr._retryTimer).toBeNull();

        document.body.classList.remove('has-activeModal');
        jest.useRealTimers();
    });
});
