/**
 * Theme-editor "demo preview" notice.
 *
 * Appended or inserted at the bottom of each widget whose settings came
 * from DEMO_OVERRIDES (flagged with `__demo: true`). The note is
 * intentionally small / secondary so it reads as a label, not a CTA —
 * it just tells the merchant they are looking at preview content and
 * where to configure real values.
 *
 * Only called by widget builders when `config.__demo === true`. That
 * flag only survives onto a feature config when the merchant has NOT
 * set that feature in Script Manager AND the storefront is inside the
 * theme editor (see isInThemeEditor() + getSettings()), so a shopper
 * can never see this note even if the detection misfires: the flag
 * simply would not be present on a merchant-provided config.
 */

function buildNoteEl(opts) {
    const align = (opts && opts.align) || 'center';
    const note = document.createElement('div');
    note.setAttribute('data-papathemes-demo-note', '');
    note.style.cssText = [
        'margin-bottom:0.75rem',
        'font-size:11px',
        'line-height:1.4',
        'color:#6c757d',
        'font-style:italic',
        `text-align:${align}`,
        'opacity:0.85',
    ].join(';');
    note.textContent = 'Theme editor preview — demo content. Configure via Script Manager to show to shoppers. See the Social Proof user guide.';
    return note;
}

/**
 * Append a demo-preview note as the last child of `containerEl`.
 *
 * Use when the widget's render container can grow in height without
 * affecting its siblings' layout (modals, block-level goal bars,
 * recent-sales popup).
 *
 * @param {HTMLElement} containerEl
 * @param {{align?: 'left'|'center'|'right'}} [opts]
 * @returns {() => void}
 */
export function appendDemoNote(containerEl, opts) {
    if (!containerEl || typeof document === 'undefined') return () => {};
    const existing = containerEl.querySelector(':scope > [data-papathemes-demo-note]');
    if (existing) {
        return () => { if (existing.parentNode) existing.parentNode.removeChild(existing); };
    }
    const note = buildNoteEl(opts);
    containerEl.appendChild(note);
    return () => { if (note.parentNode) note.parentNode.removeChild(note); };
}

/**
 * Insert a demo-preview note as the next sibling of `referenceEl`.
 *
 * Use when the widget's own container is an inline-block flex item
 * (e.g. the PDP urgency row) — appending inside would widen the
 * inline-block and wrap the flex row onto multiple lines. Inserting
 * after the row's outer container keeps the row's single-line layout
 * intact and drops the note block-level beneath it.
 *
 * @param {HTMLElement} referenceEl
 * @param {{align?: 'left'|'center'|'right'}} [opts]
 * @returns {() => void}
 */
export function insertDemoNoteAfter(referenceEl, opts) {
    if (!referenceEl || !referenceEl.parentNode || typeof document === 'undefined') return () => {};
    const next = referenceEl.nextElementSibling;
    if (next && next.hasAttribute && next.hasAttribute('data-papathemes-demo-note')) {
        return () => { if (next.parentNode) next.parentNode.removeChild(next); };
    }
    const note = buildNoteEl(opts);
    referenceEl.parentNode.insertBefore(note, referenceEl.nextSibling);
    return () => { if (note.parentNode) note.parentNode.removeChild(note); };
}
