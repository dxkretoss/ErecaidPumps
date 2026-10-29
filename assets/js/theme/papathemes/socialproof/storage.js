/**
 * Thin storage wrapper with in-memory fallback.
 *
 * Private-browsing / quota-exceeded scenarios can make sessionStorage /
 * localStorage throw. We probe once at construction time and, on any
 * runtime failure, fall back transparently to an in-memory object so the
 * social-proof module keeps working (just without cross-page persistence).
 *
 * Fallback memory is MODULE-SCOPED, not per-call. initUrgency() is called
 * once for the main PDP and again inside Quick View; both pass kind='session'
 * and must observe the same session key / per-product seeds so the "viewing
 * now" number does not jump between PDP and Quick View when storage APIs
 * are blocked. A per-call `const memory = {}` would break that guarantee
 * on Safari private mode, storage.setItem() quota-exceeded, and any other
 * environment where getBackend() returns null.
 *
 * Keyed by `kind` so 'session' and 'local' do not share a namespace —
 * matching how the browser itself partitions sessionStorage vs localStorage.
 */

const sharedMemory = {
    session: {},
    local: {},
};

function getBackend(kind) {
    try {
        const store = (kind === 'local') ? window.localStorage : window.sessionStorage;
        // Randomize the probe key so we never collide with a store or
        // customization that happens to use `__papathemes_probe__` for
        // its own data. Math.random().toString(36) is sufficient
        // uniqueness for a one-shot existence check — the key lives
        // in storage for a single setItem→removeItem pair inside this
        // try block (microseconds) and is not referenced elsewhere.
        const testKey = `__papathemes_probe_${ Math.random().toString(36).slice(2, 10) }__`;
        store.setItem(testKey, '1');
        store.removeItem(testKey);
        return store;
    } catch (e) {
        return null;
    }
}

export function createStorage(kind) {
    const backend = getBackend(kind);
    // Normalize to the two buckets we track; unknown kinds get coerced to
    // 'session' so we never return undefined when indexing sharedMemory.
    const memoryKey = kind === 'local' ? 'local' : 'session';
    const memory = sharedMemory[memoryKey];
    return {
        get(key) {
            if (backend) {
                try { return backend.getItem(key); } catch (e) { /* fallthrough */ }
            }
            return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
        },
        set(key, value) {
            if (backend) {
                try { backend.setItem(key, value); return; } catch (e) { /* fallthrough */ }
            }
            memory[key] = value;
        },
        remove(key) {
            if (backend) {
                try { backend.removeItem(key); return; } catch (e) { /* fallthrough */ }
            }
            delete memory[key];
        },
    };
}

/**
 * Test helper: reset the module-level fallback memory. Intended for unit
 * tests that exercise the fallback path; production callers never need this.
 */
export function __resetSharedMemoryForTests() {
    sharedMemory.session = {};
    sharedMemory.local = {};
}
