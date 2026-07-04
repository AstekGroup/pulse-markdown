import { describe, expect, it, vi } from 'vitest';

// Cf. anchors.test.ts : useSelectionAnchor.ts importe ../store (hook React),
// dont le chargement déclenche des effets de bord (IndexedDB) absents de
// jsdom — sans rapport avec les fonctions pures testées ici.
vi.mock('../../store', () => ({ useStore: () => null }));
const { enclosingRootBlock, enclosingBlockForRange, detectBlockType } = await import('../useSelectionAnchor');

/** Construit `<div class="pulse-doc">` + le HTML donné, tel que produirait
 * `container.innerHTML = rendered.html` dans ReaderView. */
function renderInto(html: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'pulse-doc';
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe('enclosingRootBlock', () => {
  it('remonte depuis un nœud texte jusqu’au paragraphe englobant', () => {
    const container = renderInto('<p data-line="0">Un paragraphe.</p>');
    const p = container.querySelector('p')!;
    const textNode = p.firstChild!;
    expect(enclosingRootBlock(container, textNode)).toBe(p);
  });

  it('remonte depuis un paragraphe imbriqué jusqu’à la citation racine', () => {
    const container = renderInto(
      '<blockquote data-line="2">\n<p>Une citation sur\nplusieurs lignes.</p>\n</blockquote>',
    );
    const bq = container.querySelector('blockquote')!;
    const p = container.querySelector('p')!;
    expect(enclosingRootBlock(container, p.firstChild!)).toBe(bq);
  });

  it('retourne null si aucun ancêtre ne porte data-line', () => {
    const container = renderInto('<p>Sans repère.</p>');
    const p = container.querySelector('p')!;
    expect(enclosingRootBlock(container, p.firstChild!)).toBeNull();
  });
});

describe('enclosingBlockForRange — triple-clic (sélectionner le paragraphe)', () => {
  it('retrouve le bloc racine quand commonAncestorContainer est le conteneur du document', () => {
    // Reproduit exactement le bogue signalé : un triple-clic sur une citation
    // sur deux lignes ("> ligne 1\n> ligne 2") produit, dans Chromium, un
    // Range dont les bornes sont exprimées en indices d'enfants du PARENT du
    // bloc (ici `.pulse-doc`) plutôt qu'en offsets dans le texte — son
    // `commonAncestorContainer` est alors `.pulse-doc` lui-même, qui ne porte
    // jamais `data-line`. `.closest()` (le chemin rapide) ne peut alors rien
    // trouver : il ne remonte que vers le haut, jamais vers le bas dans les
    // enfants pour identifier lequel des blocs a été sélectionné.
    const container = renderInto(
      [
        '<p data-line="0">Avant.</p>',
        '<blockquote data-line="2">\n<p>Une citation sur\nplusieurs lignes.</p>\n</blockquote>',
        '<h2 data-line="5">Après</h2>',
      ].join('\n'),
    );
    const blockquote = container.querySelector('blockquote')!;

    const range = document.createRange();
    const idx = Array.from(container.childNodes).indexOf(blockquote);
    range.setStart(container, idx);
    range.setEnd(container, idx + 1);

    // Vérifie l'hypothèse : le point commun est bien le conteneur, pas un
    // descendant — sinon ce test ne reproduirait pas le bon scénario.
    expect(range.commonAncestorContainer).toBe(container);
    expect(enclosingRootBlock(container, range.commonAncestorContainer)).toBeNull();

    expect(enclosingBlockForRange(container, range)).toBe(blockquote);
  });

  it('retourne null si le Range ne recoupe réellement aucun bloc racine', () => {
    const container = renderInto('<p data-line="0">Seul contenu.</p>');
    const range = document.createRange();
    range.setStart(container, 0);
    range.setEnd(container, 0);
    expect(enclosingBlockForRange(container, range)).toBeNull();
  });

  it('privilégie le chemin rapide (closest) quand il suffit, sans dépendre du repli', () => {
    const container = renderInto('<p data-line="0">Un mot cliqué.</p>');
    const p = container.querySelector('p')!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 2);
    expect(enclosingBlockForRange(container, range)).toBe(p);
  });
});

describe('detectBlockType', () => {
  it('reconnaît une citation', () => {
    const container = renderInto('<blockquote data-line="0"><p>Texte</p></blockquote>');
    expect(detectBlockType(container.querySelector('blockquote')!)).toBe('blockquote');
  });

  it('reconnaît un diagramme Mermaid (hydraté ou non)', () => {
    const container = renderInto(
      '<div class="mermaid-diagram" data-line="0"></div><pre class="mermaid-src" data-line="2"></pre>',
    );
    expect(detectBlockType(container.querySelector('.mermaid-diagram')!)).toBe('diagram');
    expect(detectBlockType(container.querySelector('.mermaid-src')!)).toBe('diagram');
  });
});
