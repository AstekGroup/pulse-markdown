import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStore } from '../store';
import { buildAnchor } from '../core/comments/anchors';
import type { PendingAnchor } from '../types';

/** Position (coordonnées viewport) et action de validation de la pilule
 * flottante « Commenter » affichée au-dessus d'une sélection de texte. */
export interface SelectionPill {
  top: number;
  left: number;
  commit(): void;
}

const MAX_QUOTE = 200;

/** Détermine le type de bloc (COMMENT-SPEC anchor.blockType) à partir de
 * l'élément racine rendu (porteur de `data-line`). */
export function detectBlockType(el: Element): string {
  // Diagramme Mermaid : `.mermaid-diagram` (hydraté, DIV) ou `.mermaid-src`
  // (avant hydratation, PRE) — ni l'un ni l'autre n'est identifiable par tag.
  if (el.matches('.mermaid-diagram, .mermaid-src')) return 'diagram';
  // HTML brut embarqué directement dans le Markdown (render.ts,
  // markHtmlBlockRenderer) : ni paragraphe ni aucun autre type reconnu, quel
  // que soit ce qu'il enveloppe visuellement (ex. un <blockquote> écrit à la
  // main).
  if (el.classList.contains('pulse-html-block')) return 'other';
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'UL' || tag === 'OL') return 'list';
  if (tag === 'TABLE') return 'table';
  if (tag === 'PRE') return 'code';
  if (tag === 'BLOCKQUOTE') return 'blockquote';
  if (tag === 'HR') return 'other';
  if (tag === 'P' && el.querySelector('img') && !(el.textContent ?? '').trim()) return 'image';
  return 'paragraph';
}

/** Remonte les blocs racines (porteurs de `data-line`) affichés avant `block`
 * pour trouver le titre de section le plus proche au-dessus. */
export function nearestHeadingAbove(container: HTMLElement, block: Element): string | null {
  const roots = Array.from(container.children);
  const index = roots.indexOf(block);
  const start = index === -1 ? roots.length - 1 : index;
  for (let i = start; i >= 0; i--) {
    const el = roots[i];
    if (/^H[1-6]$/.test(el.tagName)) return el.textContent?.trim() || null;
  }
  return null;
}

/** Bloc racine (porteur de `data-line`) englobant un nœud quelconque du DOM
 * rendu — un item de liste ou une cellule de tableau remonte jusqu'à la
 * liste/le tableau, jamais un marqueur n'est ancré à l'intérieur. */
export function enclosingRootBlock(container: HTMLElement, node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const found = el?.closest<HTMLElement>('[data-line]');
  if (found && container.contains(found)) return found;
  return null;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Candidate {
  pending: PendingAnchor;
}

/**
 * Construit un `PendingAnchor` (SPEC §3, COMMENT-SPEC §3) à partir de la
 * sélection de texte courante du document, si elle est valide et contenue
 * dans `container` — sinon `null`. Réutilisé par la pilule flottante
 * « Commenter » (ci-dessous) ET par le raccourci clavier « c » (A5), qui n'a
 * pas accès à l'état interne de ce hook et doit pouvoir relire la sélection
 * à la volée au moment où la touche est pressée.
 */
export function buildPendingAnchorFromSelection(container: HTMLElement): PendingAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const quote = normalizeText(selection.toString());
  if (!quote) return null;

  const block = enclosingRootBlock(container, range.commonAncestorContainer);
  if (!block) return null;
  const lineAttr = block.getAttribute('data-line');
  const line = lineAttr === null ? NaN : Number(lineAttr);
  if (Number.isNaN(line)) return null;

  const heading = nearestHeadingAbove(container, block);
  const blockType = detectBlockType(block);

  let contextBefore = '';
  let contextAfter = '';
  // Diagramme (Mermaid) : les nœuds texte du SVG sont concaténés sans espace
  // (labels adjacents) — le contexte avant/après produit serait du bruit
  // (ex. « arrage L1 retardéAdoption faible ») plutôt qu'un contexte utile ;
  // la quote seule (informative) suffit.
  if (blockType !== 'diagram') {
    try {
      const before = document.createRange();
      before.setStart(block, 0);
      before.setEnd(range.startContainer, range.startOffset);
      contextBefore = before.toString();

      const after = document.createRange();
      after.setStart(range.endContainer, range.endOffset);
      after.setEnd(block, block.childNodes.length);
      contextAfter = after.toString();
    } catch {
      contextBefore = '';
      contextAfter = '';
    }
  }

  const anchor = buildAnchor(quote.slice(0, MAX_QUOTE), contextBefore, contextAfter, heading, blockType);
  const rect = range.getBoundingClientRect();

  return { mode: 'selection', anchor, contentLine: line, rectTop: rect.top };
}

/**
 * Transforme une sélection de texte dans `containerRef` en `PendingAnchor`
 * (SPEC §3, COMMENT-SPEC §3) et expose la position de la pilule flottante
 * « Commenter ». La sélection n'est envoyée à `store.setPendingAnchor` qu'au
 * moment où l'utilisateur valide la pilule (`commit`).
 */
export function useSelectionAnchor(containerRef: RefObject<HTMLElement | null>): SelectionPill | null {
  const [pill, setPill] = useState<{ top: number; left: number } | null>(null);
  const candidateRef = useRef<Candidate | null>(null);
  const setPendingAnchor = useStore((s) => s.setPendingAnchor);

  useEffect(() => {
    function clear() {
      candidateRef.current = null;
      setPill(null);
    }

    function onSelectionChange() {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        clear();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        clear();
        return;
      }

      const pending = buildPendingAnchorFromSelection(container);
      if (!pending) {
        clear();
        return;
      }

      candidateRef.current = { pending };
      setPill({ top: rect.top, left: rect.left + rect.width / 2 });
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [containerRef]);

  useEffect(() => {
    const scrollHost = containerRef.current?.closest('.app-content');
    if (!scrollHost) return;
    function onScroll() {
      candidateRef.current = null;
      setPill(null);
    }
    scrollHost.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollHost.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  if (!pill) return null;

  return {
    top: pill.top,
    left: pill.left,
    commit() {
      const candidate = candidateRef.current;
      if (!candidate) return;
      setPendingAnchor(candidate.pending);
      candidateRef.current = null;
      setPill(null);
      window.getSelection()?.removeAllRanges();
    },
  };
}

export { prefersReducedMotion };

/**
 * Progression de défilement (0..1) de `.app-content` — mutualisé entre la
 * barre de progression 2px (TopBar) et le pourcentage (StatusBar). Le
 * défilement a lieu DANS `.app-content` (`.app-shell` est `overflow:hidden`),
 * jamais sur `window`/`documentElement` : lire ces derniers laissait la barre
 * et le pourcentage bloqués à 0 en permanence.
 */
export function useAppContentScrollFraction(): number {
  const [fraction, setFraction] = useState(0);

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('.app-content');
    if (!host) return;

    function update() {
      const max = host!.scrollHeight - host!.clientHeight;
      setFraction(max > 0 ? Math.min(1, Math.max(0, host!.scrollTop / max)) : 0);
    }

    update();
    host.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    resizeObserver?.observe(host);

    return () => {
      host.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resizeObserver?.disconnect();
    };
  }, []);

  return fraction;
}
