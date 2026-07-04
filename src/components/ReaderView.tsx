import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Plus } from 'lucide-react';
import { useStore } from '../store';
import { useSelectionAnchor, detectBlockType, nearestHeadingAbove, prefersReducedMotion } from '../hooks/useSelectionAnchor';
import { resolveAnchor, buildAnchor, wrapMatchInMark } from '../core/comments/anchors';
import { hydrateMermaid } from '../core/markdown/mermaid';
import { resolveImages, isExternalOrDataSrc, resolveRelativeImagePath } from '../core/files/images';
import type { FileEntry, TocItem, TreeNode } from '../types';

const COPY_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function findEntryByPath(node: TreeNode | null, path: string): FileEntry | null {
  if (!node) return null;
  if (node.kind === 'file') return node.entry && node.entry.path === path ? node.entry : null;
  for (const child of node.children ?? []) {
    const found = findEntryByPath(child, path);
    if (found) return found;
  }
  return null;
}

function isRelativeMarkdownHref(href: string): boolean {
  if (!href || href.startsWith('#')) return false;
  if (isExternalOrDataSrc(href)) return false;
  if (/^(mailto|tel):/i.test(href)) return false;
  const path = href.split(/[?#]/)[0];
  return /\.(md|markdown)$/i.test(path);
}

function addCopyButtons(container: HTMLElement): void {
  const blocks = container.querySelectorAll<HTMLPreElement>('pre:not(.mermaid-src)');
  blocks.forEach((pre) => {
    if (pre.querySelector('.code-copy-btn')) return;
    const code = pre.querySelector('code');
    if (!code) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-btn';
    button.setAttribute('aria-label', 'Copier le code');
    button.innerHTML = `${COPY_ICON}<span>Copier</span>`;
    button.addEventListener('click', () => {
      const label = button.querySelector('span');
      navigator.clipboard
        .writeText(code.textContent ?? '')
        .then(() => {
          if (label) label.textContent = 'Copié';
          setTimeout(() => {
            if (label) label.textContent = 'Copier';
          }, 1500);
        })
        .catch(() => {});
    });
    pre.appendChild(button);
  });
}

/** Retire tous les enrobages `.pulse-anchor` posés par un rendu précédent, en
 * réinsérant leurs enfants à leur place (texte fusionné via `normalize()`) —
 * et retire aussi les marquages `.pulse-anchor-block` (ancrage de bloc, ex.
 * diagrammes Mermaid) posés directement sur le bloc — préalable à un
 * ré-enrobage complet des ancres. */
function unwrapAnchors(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.pulse-anchor').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
  container.querySelectorAll<HTMLElement>('.pulse-anchor-block').forEach((el) => {
    el.classList.remove('pulse-anchor-block', 'is-active', 'is-pulsing');
    delete el.dataset.commentId;
  });
}

function effectiveTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Vue de lecture rendue (SPEC §5) : injecte `rendered.html` (déjà sanitisé)
 * dans `.pulse-doc`, hydrate Mermaid et les images relatives, ancre tous les
 * commentaires, gère la sélection → pilule, le survol de bloc → gouttière,
 * la TOC flottante et l'interception des liens `.md` relatifs.
 */
export function ReaderView() {
  const doc = useStore((s) => s.doc);
  const rendered = useStore((s) => s.rendered);
  const docFont = useStore((s) => s.docFont);
  const theme = useStore((s) => s.theme);
  const rootHandle = useStore((s) => s.rootHandle);
  const currentEntry = useStore((s) => s.currentEntry);
  const tree = useStore((s) => s.tree);
  const openEntry = useStore((s) => s.openEntry);
  const activeCommentId = useStore((s) => s.activeCommentId);
  const setActiveComment = useStore((s) => s.setActiveComment);
  const setPendingAnchor = useStore((s) => s.setPendingAnchor);

  const docRef = useRef<HTMLDivElement | null>(null);
  const pill = useSelectionAnchor(docRef);

  const [hover, setHover] = useState<{ line: number; top: number } | null>(null);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const prevActiveCommentRef = useRef<string | null>(null);

  // ——— Rendu + hydratation (mermaid, images, boutons copier) ———
  //
  // Ne dépend PAS de `doc` : une mutation de commentaire (ajout/réponse/
  // résolution/suppression) laisse `content` — donc `rendered` — inchangé
  // (voir store.applySource), et ne doit surtout pas provoquer une reconstruction
  // de l'innerHTML ni une réhydratation Mermaid/images à chaque interaction.
  // L'enrobage des ancres est découplé dans l'effet suivant.
  //
  // `useLayoutEffect` obligatoire : l'effet d'ancrage ci-dessous est un
  // layout effect, et React exécute TOUS les layout effects avant le moindre
  // useEffect du même commit — si celui-ci était un useEffect, l'ancrage
  // s'exécuterait sur un conteneur encore vide au montage (aucune ancre).
  // En layout effect tous les deux, l'ordre de déclaration fait foi.
  useLayoutEffect(() => {
    const container = docRef.current;
    if (!container || !rendered) return;
    let cancelled = false;
    let cleanupImages: (() => void) | null = null;

    container.innerHTML = rendered.html;
    const theme2 = effectiveTheme(theme);

    async function hydrate() {
      await hydrateMermaid(container as HTMLElement, theme2);
      if (cancelled) return;
      const resolved = await resolveImages(rootHandle, currentEntry?.path ?? '', container as HTMLElement);
      if (cancelled) {
        resolved.revokeAll();
        return;
      }
      cleanupImages = resolved.revokeAll;
      addCopyButtons(container as HTMLElement);
    }
    void hydrate();

    return () => {
      cancelled = true;
      cleanupImages?.();
    };
  }, [rendered, theme, rootHandle, currentEntry]);

  // ——— Ancrage des commentaires : ré-enrobe `.pulse-anchor` sur le DOM courant ———
  //
  // Dépend de `doc` (ré-exécuté à chaque mutation, même quand `rendered` ne
  // change pas) et s'exécute, au sein d'un même commit React, APRÈS l'effet
  // ci-dessus (ordre de déclaration) : le innerHTML de `container` reflète
  // donc toujours `rendered.html` avant tout enrobage — indépendant, lui, de
  // l'hydratation asynchrone de Mermaid/images.
  //
  // `useLayoutEffect` (et non `useEffect`) : le désenrobage/ré-enrobage
  // mutate le DOM et peut transitoirement affecter le scroll de `.app-content`
  // (ex. ajout d'un commentaire) — on capture/restaure son `scrollTop` de
  // façon synchrone, AVANT que le navigateur ne peigne, pour qu'aucun saut
  // vers le haut ne soit jamais visible. L'effet suivant (carte active ⇄
  // ancre), lui, veut scroller délibérément vers une nouvelle ancre : il
  // s'exécute après celui-ci et n'est pas concerné par cette restauration.
  useLayoutEffect(() => {
    const container = docRef.current;
    if (!container || !doc || !rendered) return;
    const scrollHost = container.closest<HTMLElement>('.app-content');
    const scrollTop = scrollHost?.scrollTop;
    unwrapAnchors(container);
    for (const parsedComment of doc.comments) {
      const match = resolveAnchor(doc, container, parsedComment);
      if (match) wrapMatchInMark(match, parsedComment.comment.id);
    }
    if (scrollHost && scrollTop !== undefined) scrollHost.scrollTop = scrollTop;
    // Mêmes dépendances (en sus de `doc`) que l'effet innerHTML ci-dessus :
    // quand il reconstruit le DOM (thème, dossier, fichier), il faut ré-enrober.
  }, [doc, rendered, theme, rootHandle, currentEntry]);

  // ——— Carte active ⇄ ancre : surbrillance + scroll doux + pulsation ———
  //
  // Dépend aussi de `doc` pour réappliquer `is-active` après un ré-enrobage
  // (l'effet précédent recrée les <mark>, perdant leurs classes) — mais ne
  // relance le scroll/la pulsation que lorsque `activeCommentId` change
  // réellement, pas à chaque mutation touchant un commentaire déjà actif.
  useEffect(() => {
    const container = docRef.current;
    if (!container) return;
    container
      .querySelectorAll('.pulse-anchor.is-active, .pulse-anchor-block.is-active')
      .forEach((el) => el.classList.remove('is-active'));
    if (!activeCommentId) {
      prevActiveCommentRef.current = null;
      return;
    }
    const id = CSS.escape(activeCommentId);
    // `~=` : data-comment-id peut être une liste (plusieurs commentaires sur
    // un même bloc, ex. deux remarques sur un diagramme).
    const mark = container.querySelector<HTMLElement>(
      `.pulse-anchor[data-comment-id~="${id}"], .pulse-anchor-block[data-comment-id~="${id}"]`,
    );
    if (!mark) {
      prevActiveCommentRef.current = activeCommentId;
      return;
    }
    mark.classList.add('is-active');
    const justActivated = prevActiveCommentRef.current !== activeCommentId;
    prevActiveCommentRef.current = activeCommentId;
    if (!justActivated) return;
    mark.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    mark.classList.remove('is-pulsing');
    void mark.offsetWidth;
    mark.classList.add('is-pulsing');
    const onEnd = () => mark.classList.remove('is-pulsing');
    mark.addEventListener('animationend', onEnd, { once: true });
    return () => mark.removeEventListener('animationend', onEnd);
  }, [activeCommentId, doc, rendered, theme, rootHandle, currentEntry]);

  // ——— TOC : item actif au scroll ———
  useEffect(() => {
    const container = docRef.current;
    if (!container || !rendered || rendered.toc.length === 0) return;
    const root = container.closest('.app-content');
    const headings = rendered.toc
      .map((item) => container.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveTocId(visible[0].target.id);
      },
      { root, rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [rendered]);

  function handleDocMouseOver(e: React.MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
    if (!target || !docRef.current?.contains(target)) return;
    const line = Number(target.getAttribute('data-line'));
    if (Number.isNaN(line)) return;
    setHover((prev) => (prev && prev.line === line ? prev : { line, top: target.offsetTop }));
  }

  function handleDocClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;

    const mark = target.closest('.pulse-anchor, .pulse-anchor-block');
    if (mark) {
      const ids = (mark.getAttribute('data-comment-id') ?? '').split(/\s+/).filter(Boolean);
      if (ids.length) {
        // Plusieurs commentaires sur le même bloc : chaque clic passe au
        // suivant, pour pouvoir tous les atteindre depuis le document.
        const current = ids.indexOf(useStore.getState().activeCommentId ?? '');
        setActiveComment(ids[(current + 1) % ids.length]);
      }
      return;
    }

    const link = target.closest('a');
    if (link) {
      const href = link.getAttribute('href') ?? '';
      if (isRelativeMarkdownHref(href)) {
        const rawPath = href.split(/[?#]/)[0];
        const targetPath = resolveRelativeImagePath(currentEntry?.path ?? '', decodeURIComponent(rawPath));
        const entry = findEntryByPath(tree, targetPath);
        if (entry) {
          e.preventDefault();
          void openEntry(entry);
        }
      }
    }
  }

  function handleBlockComment(line: number) {
    const container = docRef.current;
    if (!container) return;
    const block = container.querySelector<HTMLElement>(`[data-line="${line}"]`);
    if (!block) return;
    const quote = (block.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!quote) return;
    const heading = nearestHeadingAbove(container, block);
    const blockType = detectBlockType(block);
    const anchor = buildAnchor(quote, '', '', heading, blockType);
    setPendingAnchor({ mode: 'block', anchor, contentLine: line, rectTop: block.getBoundingClientRect().top });
  }

  function goToToc(item: TocItem) {
    const container = docRef.current;
    const heading = container?.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`);
    if (!heading) return;
    heading.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    setActiveTocId(item.id);
  }

  if (!doc || !rendered) {
    return (
      <div className="reader-view">
        <p>Aucun document.</p>
      </div>
    );
  }

  return (
    <div className="reader-view">
      {rendered.toc.length > 0 && (
        <nav className="pulse-toc" aria-label="Table des matières">
          <ul>
            {rendered.toc.map((item) => (
              <li key={item.id} className={`pulse-toc__level-${item.level}`}>
                <button
                  type="button"
                  className={activeTocId === item.id ? 'is-active' : ''}
                  onClick={() => goToToc(item)}
                  aria-current={activeTocId === item.id ? 'location' : undefined}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="pulse-doc-wrapper">
        <div
          className="pulse-doc"
          lang="fr"
          data-font={docFont}
          ref={docRef}
          onMouseOver={handleDocMouseOver}
          onMouseLeave={() => setHover(null)}
          onClick={handleDocClick}
        />
        {hover && (
          <button
            type="button"
            className="pulse-gutter-btn"
            style={{ top: hover.top }}
            onClick={() => handleBlockComment(hover.line)}
            aria-label="Commenter ce bloc"
            title="Commenter ce bloc"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {pill && (
        <button
          type="button"
          className="selection-pill"
          style={{ top: pill.top, left: pill.left }}
          // Un mousedown ordinaire efface la sélection du navigateur avant
          // même que le clic n'aboutisse (→ selectionchange → clear() → la
          // pilule est démontée) : on neutralise ce comportement par défaut
          // pour conserver la sélection, et on valide dès le pointerdown
          // plutôt que d'attendre un click qui pourrait ne jamais survenir.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={pill.commit}
        >
          <MessageSquarePlus size={14} />
          Commenter
        </button>
      )}
    </div>
  );
}
