import { createStorage } from '../../../../theme/papathemes/socialproof/storage';

describe('storage', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
    });

    it('uses sessionStorage by default when available', () => {
        const s = createStorage('session');
        s.set('key1', 'v1');
        expect(window.sessionStorage.getItem('key1')).toBe('v1');
        expect(s.get('key1')).toBe('v1');
    });

    it('uses localStorage when kind=local', () => {
        const s = createStorage('local');
        s.set('keyLocal', 'vL');
        expect(window.localStorage.getItem('keyLocal')).toBe('vL');
    });

    it('falls back to in-memory when storage API throws', () => {
        const real = window.sessionStorage.setItem.bind(window.sessionStorage);
        window.sessionStorage.setItem = () => { throw new Error('QuotaExceeded'); };
        const s = createStorage('session');
        s.set('mem', 'x');
        expect(s.get('mem')).toBe('x');
        window.sessionStorage.setItem = real;
    });

    it('returns null for missing keys', () => {
        const s = createStorage('session');
        expect(s.get('nonexistent-key-xyz')).toBeNull();
    });

    it('remove deletes value', () => {
        const s = createStorage('session');
        s.set('toRemove', 'bye');
        s.remove('toRemove');
        expect(s.get('toRemove')).toBeNull();
    });
});
