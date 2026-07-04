import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Reply,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import type { CommentFilter, ParsedComment } from '../types';

/** Seuil de glissement (px) à partir duquel relâcher referme la feuille du bas mobile. */
const SHEET_DISMISS_THRESHOLD = 90;

/**
 * Marge commentaires (DESIGN-BRIEF §7) : entête + segmented control, composer
 * inline sur `pendingAnchor`, cartes triées par position (déjà l'ordre de
 * `doc.comments`), actions au survol, réponses repliées, orphelins, résolution.
 */

const FILTERS: { value: CommentFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'open', label: 'Ouverts' },
  { value: 'resolved', label: 'Résolus' },
];

const RTF = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent ?? '');
}

function relativeDate(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const diff = time - Date.now();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return "à l'instant";
  if (abs < HOUR) return RTF.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return RTF.format(Math.round(diff / HOUR), 'hour');
  if (abs < WEEK) return RTF.format(Math.round(diff / DAY), 'day');
  if (abs < MONTH) return RTF.format(Math.round(diff / WEEK), 'week');
  if (abs < YEAR) return RTF.format(Math.round(diff / MONTH), 'month');
  return RTF.format(Math.round(diff / YEAR), 'year');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

function autoGrow(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function Composer() {
  const pendingAnchor = useStore((s) => s.pendingAnchor);
  const addComment = useStore((s) => s.addComment);
  const setPendingAnchor = useStore((s) => s.setPendingAnchor);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hadAnchorRef = useRef(false);
  const mac = isMacPlatform();

  useEffect(() => {
    if (pendingAnchor) {
      hadAnchorRef.current = true;
      textareaRef.current?.focus();
    } else if (hadAnchorRef.current) {
      hadAnchorRef.current = false;
      setDraft('');
    }
  }, [pendingAnchor]);

  useEffect(() => {
    autoGrow(textareaRef.current);
  }, [draft, pendingAnchor]);

  if (!pendingAnchor) return null;

  function cancel() {
    setPendingAnchor(null);
  }

  function submit() {
    if (!draft.trim()) return;
    addComment(draft);
  }

  return (
    <div className="mb-4 flex-none rounded-[var(--radius-m)] border border-[var(--paper-edge)] bg-[var(--paper-raised)] p-3 shadow-[var(--shadow-card)]">
      <p className="m-0 mb-2 line-clamp-2 border-l-2 border-[var(--pulse)] pl-2 text-[12px] italic text-[var(--text-muted)]">
        « {truncate(pendingAnchor.anchor.quote, 140)} »
      </p>
      <textarea
        ref={textareaRef}
        value={draft}
        rows={2}
        placeholder="Votre commentaire…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        className="w-full resize-none rounded-[var(--radius-s)] border border-[var(--paper-edge)] bg-[var(--paper)] p-2 text-[13px] text-[var(--text)] outline-none focus-visible:border-[var(--pulse-bright)]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--text-muted)]">{mac ? '⌘' : 'Ctrl'}+Entrée pour envoyer</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!draft.trim()}>
            Commenter
          </button>
        </div>
      </div>
    </div>
  );
}

interface CommentCardProps {
  pc: ParsedComment;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}

function CommentCard({ pc, registerRef, onHoverEnter, onHoverLeave }: CommentCardProps) {
  const activeCommentId = useStore((s) => s.activeCommentId);
  const setActiveComment = useStore((s) => s.setActiveComment);
  const addReply = useStore((s) => s.addReply);
  const setCommentStatus = useStore((s) => s.setCommentStatus);
  const deleteComment = useStore((s) => s.deleteComment);

  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);

  const comment = pc.comment;
  const isActive = activeCommentId === comment.id;
  const isOrphan = pc.anchorLines === null;
  const isResolved = comment.status === 'resolved';

  useEffect(() => {
    autoGrow(replyRef.current);
  }, [replyDraft, replying]);

  if (pc.malformed) {
    return (
      <article
        ref={(el) => registerRef(comment.id, el)}
        className="mb-3 flex items-center gap-2 rounded-[var(--radius-m)] border border-dashed border-[var(--paper-edge)] bg-[var(--paper-raised)] px-3 py-2.5 text-[12px] text-[var(--text-muted)]"
      >
        <AlertTriangle size={14} className="flex-none text-[var(--warn)]" aria-hidden="true" />
        Commentaire illisible
      </article>
    );
  }

  function submitReply() {
    if (!replyDraft.trim()) return;
    addReply(comment.id, replyDraft);
    setReplyDraft('');
    setReplying(false);
  }

  function stop(e: SyntheticEvent) {
    e.stopPropagation();
  }

  return (
    <article
      ref={(el) => registerRef(comment.id, el)}
      onMouseEnter={() => onHoverEnter(comment.id)}
      onMouseLeave={onHoverLeave}
      onClick={() => setActiveComment(comment.id)}
      className={[
        'group mb-3 cursor-pointer rounded-[var(--radius-m)] border p-3 transition-colors duration-150',
        isResolved ? 'opacity-60' : '',
        isActive
          ? 'border-[var(--pulse)] bg-[var(--pulse-soft)]'
          : 'border-[var(--paper-edge)] bg-[var(--paper-raised)] hover:border-[var(--ink-300)]',
      ].join(' ')}
    >
      {isOrphan && (
        <div className="mb-2 flex items-center gap-1.5 rounded-[var(--radius-s)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-2 py-1 text-[11px] font-medium text-[var(--warn)]">
          <AlertTriangle size={12} aria-hidden="true" />
          Repère perdu — le texte visé a changé
        </div>
      )}

      <header className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--pulse)] text-[10px] font-semibold text-white"
          aria-hidden="true"
        >
          {initials(comment.author)}
        </span>
        <span className="truncate text-[13px] font-semibold text-[var(--text)]">{comment.author}</span>
        <span className="ml-auto flex-none text-[11px] text-[var(--text-muted)]">{relativeDate(comment.createdAt)}</span>
        {isResolved && <Check size={14} className="flex-none text-[var(--pulse)]" aria-label="Résolu" />}
      </header>

      <p className="m-0 mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text)]">{comment.text}</p>

      <p className="m-0 mt-2 border-l-2 border-[var(--paper-edge)] pl-2 text-[12px] italic text-[var(--text-muted)]">
        « {truncate(comment.anchor.quote, 100)} »
      </p>

      {comment.replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-l border-[var(--paper-edge)] pl-3">
          {comment.replies.length > 2 && !repliesExpanded ? (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                setRepliesExpanded(true);
              }}
              className="flex w-fit items-center gap-1 text-[12px] font-medium text-[var(--pulse)]"
            >
              <ChevronDown size={12} aria-hidden="true" /> {comment.replies.length} réponses
            </button>
          ) : (
            <>
              {comment.replies.map((reply, i) => (
                <div key={i} className="text-[12px] text-[var(--text)]">
                  <span className="font-semibold">{reply.author}</span>{' '}
                  <span className="text-[11px] text-[var(--text-muted)]">{relativeDate(reply.createdAt)}</span>
                  <p className="m-0 whitespace-pre-wrap">{reply.text}</p>
                </div>
              ))}
              {comment.replies.length > 2 && (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    setRepliesExpanded(false);
                  }}
                  className="flex w-fit items-center gap-1 text-[12px] text-[var(--text-muted)]"
                >
                  <ChevronUp size={12} aria-hidden="true" /> Réduire
                </button>
              )}
            </>
          )}
        </div>
      )}

      {replying && (
        <div className="mt-2" onClick={stop}>
          <textarea
            ref={replyRef}
            autoFocus
            rows={2}
            value={replyDraft}
            placeholder="Votre réponse…"
            onChange={(e) => setReplyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setReplying(false);
                setReplyDraft('');
              } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submitReply();
              }
            }}
            className="w-full resize-none rounded-[var(--radius-s)] border border-[var(--paper-edge)] bg-[var(--paper)] p-2 text-[12px] text-[var(--text)] outline-none focus-visible:border-[var(--pulse-bright)]"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setReplying(false);
                setReplyDraft('');
              }}
            >
              Annuler
            </button>
            <button type="button" className="btn btn--primary" onClick={submitReply} disabled={!replyDraft.trim()}>
              <Send size={13} aria-hidden="true" />
              Répondre
            </button>
          </div>
        </div>
      )}

      {confirmingDelete ? (
        <div
          className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-s)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-2 text-[12px]"
          onClick={stop}
        >
          <span className="text-[var(--danger)]">Supprimer ce commentaire ?</span>
          <div className="flex flex-none gap-2">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmingDelete(false)}>
              Non
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ color: 'var(--danger)' }}
              onClick={() => deleteComment(comment.id)}
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100"
          onClick={stop}
        >
          <button type="button" className="btn btn--ghost btn--icon" onClick={() => setReplying(true)}>
            <Reply size={14} aria-hidden="true" />
            Répondre
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => setCommentStatus(comment.id, isResolved ? 'open' : 'resolved')}
          >
            {isResolved ? <RotateCcw size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
            {isResolved ? 'Rouvrir' : 'Résoudre'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon ml-auto"
            aria-label="Supprimer"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}

export function CommentsPanel() {
  const commentsOpen = useStore((s) => s.commentsOpen);
  const doc = useStore((s) => s.doc);
  const commentFilter = useStore((s) => s.commentFilter);
  const setCommentFilter = useStore((s) => s.setCommentFilter);
  const activeCommentId = useStore((s) => s.activeCommentId);
  const setActiveComment = useStore((s) => s.setActiveComment);
  const pendingAnchor = useStore((s) => s.pendingAnchor);

  const cardsRef = useRef<Map<string, HTMLElement>>(new Map());
  const lastSelectedRef = useRef<string | null>(null);
  const suppressScrollRef = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStartY = useRef<number | null>(null);

  // Mobile (< 768px, DESIGN-BRIEF §3) : le panneau devient une feuille du bas
  // ouverte via un bouton flottant, indépendante du toggle desktop ⌘⇧C
  // (`commentsOpen`) — cf. B6. Réutilise ce même composant (pas de duplication) :
  // en desktop, `sheetOpen` reste sans effet (la CSS ne le lit qu'en mobile).
  const [sheetOpen, setSheetOpen] = useState(false);

  const comments = useMemo(() => doc?.comments ?? [], [doc]);
  const openCount = useMemo(() => comments.filter((c) => c.comment.status === 'open').length, [comments]);
  const filtered = useMemo(
    () => comments.filter((c) => commentFilter === 'all' || c.comment.status === commentFilter),
    [comments, commentFilter],
  );
  const commentsLabel = `${comments.length} ${comments.length > 1 ? 'commentaires' : 'commentaire'}`;

  useEffect(() => {
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    lastSelectedRef.current = activeCommentId;
    if (!activeCommentId) return;
    cardsRef.current.get(activeCommentId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeCommentId]);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSheetOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  if (!commentsOpen) return null;

  function registerRef(id: string, el: HTMLElement | null) {
    if (el) cardsRef.current.set(id, el);
    else cardsRef.current.delete(id);
  }

  function handleHoverEnter(id: string) {
    suppressScrollRef.current = true;
    setActiveComment(id);
  }

  function handleHoverLeave() {
    suppressScrollRef.current = true;
    setActiveComment(lastSelectedRef.current);
  }

  // ——— Fermeture par glissement (feuille du bas mobile) ———
  function handleHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null || !panelRef.current) return;
    const delta = Math.max(0, e.clientY - dragStartY.current);
    panelRef.current.style.transform = delta > 0 ? `translateY(${delta}px)` : '';
  }
  function handleHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (panelRef.current) panelRef.current.style.transform = '';
    if (delta > SHEET_DISMISS_THRESHOLD) setSheetOpen(false);
  }

  return (
    <>
      {!sheetOpen && (
        <button
          type="button"
          className="comments-fab"
          onClick={() => setSheetOpen(true)}
          aria-label={`Ouvrir les commentaires — ${commentsLabel}`}
        >
          <MessageSquare size={15} aria-hidden="true" />
          {commentsLabel}
        </button>
      )}
      {sheetOpen && (
        <div className="comments-sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />
      )}
      <aside
        ref={panelRef}
        className={`comments-panel flex flex-col${sheetOpen ? ' comments-panel--sheet-open' : ''}`}
        aria-label="Commentaires"
      >
        <div
          className="comments-panel__handle"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          aria-hidden="true"
        />
        <header className="mb-4 flex flex-none flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="m-0 font-[var(--font-display)] text-[15px] font-semibold text-[var(--text)]">Commentaires</h2>
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-[var(--text-muted)]">{commentsLabel}</span>
              <button
                type="button"
                className="comments-panel__close"
                onClick={() => setSheetOpen(false)}
                aria-label="Fermer les commentaires"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div
            className="flex gap-1 rounded-[var(--radius-m)] bg-[var(--paper-edge)] p-1"
            role="group"
            aria-label="Filtrer les commentaires"
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={commentFilter === f.value}
                onClick={() => setCommentFilter(f.value)}
                className={[
                  'flex-1 rounded-[var(--radius-s)] px-2 py-1.5 text-[12px] font-medium transition-colors duration-150',
                  commentFilter === f.value
                    ? 'bg-[var(--paper-raised)] text-[var(--pulse)] shadow-[var(--shadow-card)]'
                    : 'text-[var(--text-muted-strong)] hover:text-[var(--text)]',
                ].join(' ')}
              >
                {f.label}
                {f.value === 'open' ? ` (${openCount})` : ''}
              </button>
            ))}
          </div>
        </header>

        <Composer />

        {comments.length === 0 ? (
          !pendingAnchor && (
            <p className="comments-empty">Aucun commentaire — sélectionnez un passage pour commencer.</p>
          )
        ) : filtered.length === 0 ? (
          <p className="comments-empty">
            {commentFilter === 'open' ? 'Aucun commentaire ouvert.' : 'Aucun commentaire résolu.'}
          </p>
        ) : (
          <div className="flex flex-col">
            {filtered.map((pc) => (
              <CommentCard
                key={pc.comment.id}
                pc={pc}
                registerRef={registerRef}
                onHoverEnter={handleHoverEnter}
                onHoverLeave={handleHoverLeave}
              />
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
