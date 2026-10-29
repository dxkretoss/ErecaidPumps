import { lockBodyScroll, unlockBodyScroll, copyToClipboard } from '../../../../theme/papathemes/socialproof/popupUtils';

describe('popupUtils', () => {
    // Calling unlockBodyScroll() restores overflow AND removes every
    // dataset attr lockBodyScroll set (marker + prev-overflow +
    // had-prev-overflow). Using it here instead of manual resets
    // guarantees cross-test cleanup stays in sync with whatever
    // attrs the lock helper decides to manage over time.
    afterEach(() => {
        unlockBodyScroll();
    });

    it('lockBodyScroll sets overflow hidden and marker attr', () => {
        lockBodyScroll();
        expect(document.body.style.overflow).toBe('hidden');
        expect(document.body.dataset.papathemesScrollLock).toBe('1');
    });

    it('unlockBodyScroll restores overflow', () => {
        lockBodyScroll();
        unlockBodyScroll();
        expect(document.body.style.overflow).toBe('');
        expect(document.body.dataset.papathemesScrollLock).toBeUndefined();
    });

    it('copyToClipboard resolves true when clipboard API available', async () => {
        const originalClipboard = navigator.clipboard;
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: jest.fn().mockResolvedValue() },
            configurable: true,
        });
        const ok = await copyToClipboard('HELLO10');
        expect(ok).toBe(true);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('HELLO10');
        if (originalClipboard === undefined) {
            delete navigator.clipboard;
        } else {
            Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
        }
    });
});
