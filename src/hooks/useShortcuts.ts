import { useEffect } from 'react';
import { useStore } from '../store';
import { buildPendingAnchorFromSelection } from './useSelectionAnchor';

/**
 * Table centralisée des raccourcis (DESIGN-BRIEF §6). Source unique consommée
 * par le listener global ci-dessous, la palette de commandes et l'aide « ? ».
 */
export type ShortcutGroup = 'fichiers' | 'affichage' | 'commentaires' | 'aide';

export interface ShortcutDef {
  id: string;
  description: string;
  group: ShortcutGroup;
  /** touche principale (lettre, symbole ou nom : 'O', '\\', 'Enter', 'Escape', '?'…) */
  key: string;
  mod?: boolean;
  shift?: boolean;
  /** intercepté par le listener global de cette table (sinon, purement documentaire) */
  global: boolean;
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPod|iPad/.test(platform);
}

export const IS_MAC = detectMac();
export const MOD_SYMBOL = IS_MAC ? '⌘' : 'Ctrl';
export const SHIFT_SYMBOL = IS_MAC ? '⇧' : 'Maj';

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'open-file', description: 'Ouvrir un fichier', group: 'fichiers', key: 'O', mod: true, global: true },
  { id: 'open-folder', description: 'Ouvrir un dossier', group: 'fichiers', key: 'O', mod: true, shift: true, global: true },
  { id: 'save', description: 'Enregistrer', group: 'fichiers', key: 'S', mod: true, global: true },
  { id: 'print', description: 'Imprimer', group: 'fichiers', key: 'P', mod: true, global: true },
  { id: 'palette', description: 'Palette de commandes', group: 'affichage', key: 'K', mod: true, global: true },
  { id: 'source-view', description: 'Vue source ⇄ rendu', group: 'affichage', key: 'E', mod: true, global: true },
  { id: 'library', description: 'Bibliothèque', group: 'affichage', key: '\\', mod: true, global: true },
  { id: 'comments-panel', description: 'Panneau commentaires', group: 'affichage', key: 'C', mod: true, shift: true, global: true },
  { id: 'comment', description: 'Commenter la sélection ou le bloc', group: 'commentaires', key: 'c', global: true },
  { id: 'next-comment', description: 'Commentaire suivant', group: 'commentaires', key: 'n', global: true },
  { id: 'prev-comment', description: 'Commentaire précédent', group: 'commentaires', key: 'p', global: true },
  { id: 'submit-composer', description: 'Envoyer (composer)', group: 'commentaires', key: 'Enter', mod: true, global: false },
  { id: 'help', description: 'Aide raccourcis', group: 'aide', key: '?', global: true },
  { id: 'close', description: 'Fermer (palette, composer, aide)', group: 'aide', key: 'Échap', global: true },
];

export const GROUP_LABELS: Record<ShortcutGroup, string> = {
  fichiers: 'Fichiers',
  affichage: 'Affichage',
  commentaires: 'Commentaires',
  aide: 'Aide',
};

/** Jetons individuels à afficher (un par touche) — pour un rendu en `<kbd>`. */
export function shortcutTokens(def: ShortcutDef): string[] {
  const tokens: string[] = [];
  if (def.mod) tokens.push(MOD_SYMBOL);
  if (def.shift) tokens.push(SHIFT_SYMBOL);
  if (def.key === 'Enter') tokens.push('⏎');
  else if (def.key === 'Échap') tokens.push('Échap');
  else tokens.push(def.key.toUpperCase());
  return tokens;
}

/** Libellé compact pour une seule ligne (palette, tooltips). */
export function shortcutLabel(def: ShortcutDef): string {
  return shortcutTokens(def).join(IS_MAC ? '' : '+');
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Fait défiler l'ensemble de fils vers le commentaire suivant/précédent
 * (respecte le filtre courant), avec bouclage. Exposé pour la palette.
 */
export function navigateComment(direction: 1 | -1): void {
  const { doc, commentFilter, activeCommentId, setActiveComment, pushToast } = useStore.getState();
  if (!doc || doc.comments.length === 0) {
    pushToast('info', 'Aucun commentaire dans ce document.');
    return;
  }
  const visible = doc.comments.filter((c) => commentFilter === 'all' || c.comment.status === commentFilter);
  if (visible.length === 0) {
    pushToast('info', 'Aucun commentaire pour ce filtre.');
    return;
  }
  const index = visible.findIndex((c) => c.comment.id === activeCommentId);
  const nextIndex = index === -1 ? 0 : (index + direction + visible.length) % visible.length;
  setActiveComment(visible[nextIndex].comment.id);
}

/**
 * Reproduit l'action du bouton « Commenter » : ouvre le panneau et, s'il y a
 * une sélection valide dans le document (invisible du reste de l'appli, elle
 * ne vivait que dans l'état interne de `useSelectionAnchor`), la promeut en
 * ancre en attente — un utilisateur clavier doit pouvoir commenter sans
 * passer par la pilule flottante (A5). Sinon, guide via un toast.
 */
function triggerComment(): void {
  const { pendingAnchor, commentsOpen, toggle, pushToast, setPendingAnchor } = useStore.getState();
  if (!commentsOpen) toggle('comments');
  if (pendingAnchor) return;

  const container = document.querySelector<HTMLElement>('.pulse-doc');
  const pending = container ? buildPendingAnchorFromSelection(container) : null;
  if (pending) {
    setPendingAnchor(pending);
    window.getSelection()?.removeAllRanges();
    return;
  }
  pushToast('info', 'Sélectionnez un passage du document pour le commenter.');
}

/**
 * Listener global (SPEC §6, DESIGN-BRIEF §6). Les raccourcis à lettre seule
 * (c, n, p, ?) sont inactifs si le focus est dans un champ de saisie.
 */
export function useShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const modPressed = IS_MAC ? e.metaKey : e.ctrlKey;

      if (modPressed && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'o' && e.shiftKey) {
          e.preventDefault();
          void useStore.getState().openFolderPicker();
          return;
        }
        if (key === 'o') {
          e.preventDefault();
          void useStore.getState().openFilePicker();
          return;
        }
        if (key === 's') {
          e.preventDefault();
          void useStore.getState().save();
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          window.print();
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          useStore.getState().toggle('palette');
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          useStore.getState().toggle('source');
          return;
        }
        if (key === '\\') {
          e.preventDefault();
          useStore.getState().toggle('library');
          return;
        }
        if (key === 'c' && e.shiftKey) {
          e.preventDefault();
          useStore.getState().toggle('comments');
          return;
        }
        return;
      }

      if (e.key === 'Escape') {
        const { paletteOpen, shortcutsOpen, toggle } = useStore.getState();
        if (paletteOpen) toggle('palette');
        else if (shortcutsOpen) toggle('shortcuts');
        return;
      }

      if (e.altKey || isEditableTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        useStore.getState().toggle('shortcuts');
        return;
      }
      if (e.key === 'c') {
        e.preventDefault();
        triggerComment();
        return;
      }
      if (e.key === 'n') {
        e.preventDefault();
        navigateComment(1);
        return;
      }
      if (e.key === 'p') {
        e.preventDefault();
        navigateComment(-1);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
