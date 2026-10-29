import { appendDemoNote, insertDemoNoteAfter } from '../../../../theme/papathemes/socialproof/demoNote';

describe('appendDemoNote()', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container.parentNode) container.parentNode.removeChild(container);
    });

    it('returns a noop destroy when given no container', () => {
        expect(typeof appendDemoNote(null)).toBe('function');
        expect(typeof appendDemoNote(undefined)).toBe('function');
    });

    it('appends a demo note as the last child of the container', () => {
        const existing = document.createElement('p');
        container.appendChild(existing);
        appendDemoNote(container);
        const notes = container.querySelectorAll('[data-papathemes-demo-note]');
        expect(notes.length).toBe(1);
        expect(container.lastElementChild).toBe(notes[0]);
        expect(notes[0].textContent).toContain('Theme editor preview');
        expect(notes[0].textContent).toContain('Script Manager');
        expect(notes[0].textContent).toContain('Social Proof');
    });

    it('is idempotent — second call does not add a duplicate note', () => {
        appendDemoNote(container);
        appendDemoNote(container);
        expect(container.querySelectorAll('[data-papathemes-demo-note]').length).toBe(1);
    });

    it('destroy removes the appended note', () => {
        const destroy = appendDemoNote(container);
        expect(container.querySelector('[data-papathemes-demo-note]')).not.toBeNull();
        destroy();
        expect(container.querySelector('[data-papathemes-demo-note]')).toBeNull();
    });
});

describe('insertDemoNoteAfter()', () => {
    let parent;
    let reference;

    beforeEach(() => {
        parent = document.createElement('div');
        reference = document.createElement('section');
        reference.className = 'reference';
        parent.appendChild(reference);
        document.body.appendChild(parent);
    });

    afterEach(() => {
        if (parent.parentNode) parent.parentNode.removeChild(parent);
    });

    it('returns a noop destroy when reference is missing or detached', () => {
        expect(typeof insertDemoNoteAfter(null)).toBe('function');
        const detached = document.createElement('div');
        expect(typeof insertDemoNoteAfter(detached)).toBe('function');
    });

    it('inserts the note as the next sibling of the reference element', () => {
        insertDemoNoteAfter(reference);
        const note = parent.querySelector('[data-papathemes-demo-note]');
        expect(note).not.toBeNull();
        expect(reference.nextElementSibling).toBe(note);
    });

    it('does NOT nest the note inside the reference element', () => {
        insertDemoNoteAfter(reference);
        expect(reference.querySelector('[data-papathemes-demo-note]')).toBeNull();
    });

    it('is idempotent — second call does not add a duplicate', () => {
        insertDemoNoteAfter(reference);
        insertDemoNoteAfter(reference);
        const notes = parent.querySelectorAll('[data-papathemes-demo-note]');
        expect(notes.length).toBe(1);
    });

    it('preserves existing siblings after the reference', () => {
        const trailing = document.createElement('footer');
        parent.appendChild(trailing);
        insertDemoNoteAfter(reference);
        // DOM order: reference → note → trailing
        expect(reference.nextElementSibling.hasAttribute('data-papathemes-demo-note')).toBe(true);
        expect(reference.nextElementSibling.nextElementSibling).toBe(trailing);
    });

    it('destroy removes the inserted note', () => {
        const destroy = insertDemoNoteAfter(reference);
        expect(parent.querySelector('[data-papathemes-demo-note]')).not.toBeNull();
        destroy();
        expect(parent.querySelector('[data-papathemes-demo-note]')).toBeNull();
    });
});
