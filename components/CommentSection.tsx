/**
 * CommentSection — the notes/comments UI attached to a single parcel.
 *
 * It renders the existing comments (sorted oldest-first, each with a Swiss-
 * formatted timestamp), lets the user edit or delete any of them inline, and
 * offers a textarea to post a new one. It is "controlled" by its parent: the
 * comments are passed in, and all actual changes are reported back through the
 * onPost / onEdit / onRemove callbacks, so this component holds no comment data
 * of its own — only the temporary draft/edit text being typed.
 */
'use client'; // interactive component: relies on React state and events

import { useState } from 'react';
import type { ParcelComment } from '@/types/parcel';

// One shared formatter for all timestamps. Created once at module load (rather
// than per render) because Intl formatters are comparatively expensive to build.
// 'de-CH' gives Swiss-German date/time wording.
const dateTimeFormat = new Intl.DateTimeFormat('de-CH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface CommentSectionProps {
  comments: ParcelComment[];
  onPost: (text: string) => void; // create a new comment
  onEdit: (id: string, text: string) => void; // overwrite an existing one
  onRemove: (id: string) => void; // delete one
}

/**
 * A timestamped comment log: existing comments are listed with their post date
 * (and an "bearbeitet" marker once edited), each can be edited inline or
 * deleted, and a textarea at the bottom posts a new comment.
 */
export function CommentSection({ comments, onPost, onEdit, onRemove }: CommentSectionProps) {
  const [draft, setDraft] = useState(''); // text in the "new comment" box
  const [editingId, setEditingId] = useState<string | null>(null); // which comment is being edited (null = none)
  const [editText, setEditText] = useState(''); // working copy of that comment's text

  // Copy before sorting so we never mutate the prop array, and order chrono-
  // logically. createdAt is an ISO date string, so a plain string compare sorts
  // it correctly from oldest to newest.
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Post the draft, unless it is blank/whitespace-only; then clear the box.
  const post = () => {
    if (draft.trim() === '') return;
    onPost(draft);
    setDraft('');
  };

  // Switch a comment into edit mode and seed the editor with its current text.
  const startEdit = (comment: ParcelComment) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  // Save the edit (only if non-empty), then leave edit mode and reset the editor.
  const saveEdit = () => {
    if (editingId && editText.trim() !== '') onEdit(editingId, editText);
    setEditingId(null);
    setEditText('');
  };

  return (
    <div className="space-y-2">
      {sorted.length > 0 && (
        <ul className="space-y-1.5">
          {sorted.map((comment) => (
            <li
              key={comment.id}
              className="rounded-lg border border-ink-200 bg-white px-2.5 py-2 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium tabular-nums text-ink-400">
                  {dateTimeFormat.format(new Date(comment.createdAt))}
                  {/* Append "· bearbeitet" (edited) only if it was ever updated. */}
                  {comment.updatedAt && ' · bearbeitet'}
                </span>
                {editingId !== comment.id && (
                  <span className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(comment)}
                      className="text-[11px] font-medium text-ink-400 transition-colors hover:text-ink-700"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(comment.id)}
                      className="text-[11px] font-medium text-ink-400 transition-colors hover:text-red-600"
                    >
                      Löschen
                    </button>
                  </span>
                )}
              </div>
              {/* Show the inline editor for the comment being edited, or its
                  plain text otherwise. */}
              {editingId === comment.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={3}
                    autoFocus
                    className="field resize-y px-2.5 py-1.5"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="btn-primary px-2.5 py-1 text-xs"
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditText('');
                      }}
                      className="btn-secondary px-2.5 py-1 text-xs"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-800">
                  {comment.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Kommentar hinzufügen…"
        rows={2}
        className="field resize-y px-2.5 py-2"
      />
      {/* Disabled while the draft is empty, so blank comments can't be posted. */}
      <button
        type="button"
        onClick={post}
        disabled={draft.trim() === ''}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        Kommentar posten
      </button>
    </div>
  );
}
