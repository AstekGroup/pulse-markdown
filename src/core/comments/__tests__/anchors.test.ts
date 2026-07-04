import { describe, expect, it, vi } from 'vitest';
import { resolveAnchor, wrapMatchInMark, type AnchorMatch } from '../anchors';
import { parseDocument } from '../parser';
import type { ParsedComment, ParsedDoc } from '../../../types';

// `useSelectionAnchor.ts` importe `../store` (pour le hook React `useStore`),
// dont le chargement du module déclenche des effets de bord asynchrones
// (`loadRecents`/`pruneDeadRecents`, IndexedDB via idb-keyval) sans rapport
// avec `detectBlockType` — inutile et absent de jsdom (`indexedDB is not
// defined`), d'où ce mock minimal qui n'affecte pas la fonction testée.
vi.mock('../../../store', () => ({ useStore: () => null }));
const { detectBlockType } = await import('../../../hooks/useSelectionAnchor');

/** Assertion de type utilitaire : la plupart des tests ci-dessous portent sur
 * une ancre `text` (le cas `block` est testé séparément). */
function asText(match: AnchorMatch | null) {
  if (!match || match.kind !== 'text') throw new Error('attendu : ancre de type "text"');
  return match;
}

function makeParsedComment(overrides: Partial<ParsedComment> = {}): ParsedComment {
  return {
    comment: {
      v: 1,
      id: 'pc-test01',
      status: 'open',
      author: 'Marie Dupont',
      createdAt: '2026-07-04T14:32:00+02:00',
      text: 'Un commentaire',
      anchor: { quote: 'progresse de 12 %' },
      replies: [],
    },
    markerLines: [0, 0],
    anchorLines: null,
    raw: '',
    ...overrides,
  };
}

const emptyDoc: ParsedDoc = { source: '', content: '', comments: [], eol: '\n', hadBom: false };

describe('resolveAnchor', () => {
  it('trouve la quote dans le bloc désigné par anchorLines/data-line', () => {
    document.body.innerHTML = `
      <div id="root">
        <p data-line="0">Le CA du T3 progresse de 12 % sur la région Nord.</p>
        <p data-line="2">Un autre paragraphe, sans rapport.</p>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const pc = makeParsedComment({ anchorLines: [0, 1] });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).not.toBeNull();
    expect(asText(match).node.data).toContain('progresse de 12 %');
    expect(asText(match).container.getAttribute('data-line')).toBe('0');
  });

  it('départage les occurrences multiples via prefix/suffix puis proximité', () => {
    document.body.innerHTML = `
      <div id="root">
        <p data-line="0">Un chiffre progresse de 12 % ici, hors contexte.</p>
        <p data-line="2">Le CA du T3 progresse de 12 % sur la région Nord.</p>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const pc = makeParsedComment({
      comment: {
        ...makeParsedComment().comment,
        anchor: { quote: 'progresse de 12 %', prefix: 'T3 ', suffix: ' sur la région' },
      },
      anchorLines: null,
    });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).not.toBeNull();
    expect(asText(match).container.getAttribute('data-line')).toBe('2');
  });

  it('retourne null (orphelin) quand la quote est introuvable', () => {
    document.body.innerHTML = `
      <div id="root">
        <p data-line="0">Ce texte a complètement changé depuis.</p>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const pc = makeParsedComment({ anchorLines: [0, 1] });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).toBeNull();
  });

  it('retombe sur tout le conteneur si la quote a bougé de bloc (résilience)', () => {
    document.body.innerHTML = `
      <div id="root">
        <p data-line="0">Un paragraphe sans le passage visé.</p>
        <p data-line="2">Le CA du T3 progresse de 12 % sur la région Nord, désormais ici.</p>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const pc = makeParsedComment({ anchorLines: [0, 1] });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).not.toBeNull();
    expect(asText(match).container.getAttribute('data-line')).toBe('2');
  });
});

describe('wrapMatchInMark', () => {
  it("n'enveloppe jamais un <td> entier — seuls les segments de texte sont marqués (structure de tableau intacte)", () => {
    document.body.innerHTML = `
      <table id="root" data-line="0">
        <tbody>
          <tr>
            <td>Lot 2</td>
            <td>Refonte des parcours mobiles</td>
            <td>12 jours</td>
          </tr>
        </tbody>
      </table>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const rowsBefore = root.querySelectorAll('tr').length;
    const cellsBefore = root.querySelectorAll('td').length;

    const pc = makeParsedComment({
      comment: {
        ...makeParsedComment().comment,
        anchor: { quote: 'Refonte des parcours mobiles' },
      },
      anchorLines: [0, 4],
    });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).not.toBeNull();
    wrapMatchInMark(match!, pc.comment.id);

    // La structure du tableau est intacte : même nombre de lignes/cellules,
    // aucune cellule fantôme ou vide créée par un enrobage qui aurait
    // capturé l'élément <td> lui-même.
    expect(root.querySelectorAll('tr').length).toBe(rowsBefore);
    const cellsAfter = Array.from(root.querySelectorAll('td'));
    expect(cellsAfter.length).toBe(cellsBefore);
    expect(cellsAfter.every((td) => (td.textContent ?? '').trim() !== '')).toBe(true);
    // Aucun <mark> ne doit envelopper un <td> : chaque <mark> a un <td> pour
    // ancêtre, jamais l'inverse.
    root.querySelectorAll('mark.pulse-anchor').forEach((mark) => {
      expect(mark.closest('td')).not.toBeNull();
      expect(mark.querySelector('td')).toBeNull();
    });

    const targetCell = cellsAfter[1];
    expect(targetCell.textContent).toContain('Refonte des parcours mobiles');
    const markInCell = targetCell.querySelector('mark.pulse-anchor');
    expect(markInCell).not.toBeNull();
    expect(markInCell!.getAttribute('data-comment-id')).toBe(pc.comment.id);
    expect(markInCell!.textContent).toBe('Refonte des parcours mobiles');
  });
});

describe('resolveAnchor — intégration avec parseDocument', () => {
  it('résout un anchorLines calculé par le parseur réel', () => {
    const source = [
      '## Résultats commerciaux',
      '',
      "Le chiffre d'affaires du T3 progresse de 12 % sur la région Nord.",
      '',
      '<!--pulse:comment',
      JSON.stringify(
        {
          v: 1,
          id: 'pc-x7k2m9',
          status: 'open',
          author: 'Marie Dupont',
          createdAt: '2026-07-04T14:32:00+02:00',
          text: 'Peut-on préciser la source ?',
          anchor: {
            quote: 'progresse de 12 % sur la région Nord',
            prefix: "d'affaires du T3 ",
            suffix: '.',
            heading: 'Résultats commerciaux',
            blockType: 'paragraph',
          },
          replies: [],
        },
        null,
        2,
      ),
      '-->',
      '',
    ].join('\n');

    const doc = parseDocument(source);
    const pc = doc.comments[0];
    expect(pc.anchorLines).toEqual([2, 3]);

    document.body.innerHTML = `
      <div id="root">
        <h2 data-line="0">Résultats commerciaux</h2>
        <p data-line="2">Le chiffre d'affaires du T3 progresse de 12 % sur la région Nord.</p>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const match = resolveAnchor(doc, root, pc);
    expect(match).not.toBeNull();
    expect(asText(match).container.getAttribute('data-line')).toBe('2');
  });
});

describe('resolveAnchor — diagrammes Mermaid (ancrage de bloc)', () => {
  it('retourne kind "block" pour un diagramme désigné, et wrapMatchInMark ne pose aucun <mark> dans le SVG', () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="mermaid-diagram" data-line="0">
          <svg>
            <text>Adoption faible</text>
          </svg>
        </div>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const pc = makeParsedComment({
      comment: { ...makeParsedComment().comment, anchor: { quote: 'Adoption faible', blockType: 'diagram' } },
      anchorLines: [0, 6],
    });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).not.toBeNull();
    expect(match!.kind).toBe('block');

    wrapMatchInMark(match!, pc.comment.id);

    const block = root.querySelector('.mermaid-diagram') as HTMLElement;
    expect(block.classList.contains('pulse-anchor-block')).toBe(true);
    expect(block.getAttribute('data-comment-id')).toBe(pc.comment.id);
    expect(block.querySelector('svg mark.pulse-anchor')).toBeNull();
    expect(block.querySelector('svg text')?.textContent).toBe('Adoption faible');
  });

  it('dégrade en ancrage de bloc quand la recherche plein-document aboutit dans un SVG', () => {
    document.body.innerHTML = `
      <div id="root">
        <p data-line="0">Un paragraphe sans rapport.</p>
        <div class="mermaid-diagram" data-line="2">
          <svg>
            <text>Adoption faible</text>
          </svg>
        </div>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    // anchorLines pointe vers un bloc qui ne contient pas la quote : le
    // fallback plein-document doit la trouver dans le SVG et dégrader.
    const pc = makeParsedComment({
      comment: { ...makeParsedComment().comment, anchor: { quote: 'Adoption faible' } },
      anchorLines: [0, 1],
    });

    const match = resolveAnchor(emptyDoc, root, pc);
    expect(match).not.toBeNull();
    expect(match!.kind).toBe('block');
    if (match!.kind === 'block') {
      expect(match!.el.classList.contains('mermaid-diagram')).toBe(true);
    }
  });
});

describe('locateInRanges — cas limite frontière entre deux nœuds texte adjacents', () => {
  it('quand la quote correspond exactement au second de deux nœuds texte adjacents sans espace, le wrap enveloppe le second nœud (pas la fin du premier)', () => {
    document.body.innerHTML = `
      <div id="root" data-line="0">
        <span>Adoption faible</span><span>Démo/training intensif</span>
      </div>
    `;
    const root = document.getElementById('root') as HTMLElement;
    const pc = makeParsedComment({
      comment: {
        ...makeParsedComment().comment,
        anchor: { quote: 'Démo/training intensif' },
      },
      anchorLines: [0, 1],
    });

    const match = resolveAnchor(emptyDoc, root, pc);
    const text = asText(match);
    expect(text.node.data).toBe('Démo/training intensif');
    expect(text.startOffset).toBe(0);

    wrapMatchInMark(match!, pc.comment.id);

    const spans = root.querySelectorAll('span');
    expect(spans[0].textContent).toBe('Adoption faible');
    expect(spans[0].querySelector('mark.pulse-anchor')).toBeNull();
    const markInSecond = spans[1].querySelector('mark.pulse-anchor');
    expect(markInSecond).not.toBeNull();
    expect(markInSecond!.textContent).toBe('Démo/training intensif');
  });
});

describe('detectBlockType', () => {
  it("détecte un diagramme Mermaid ('.mermaid-diagram') comme blockType 'diagram'", () => {
    const el = document.createElement('div');
    el.className = 'mermaid-diagram';
    expect(detectBlockType(el)).toBe('diagram');
  });

  it("détecte un bloc source Mermaid non hydraté ('.mermaid-src') comme blockType 'diagram'", () => {
    const el = document.createElement('pre');
    el.className = 'mermaid-src';
    expect(detectBlockType(el)).toBe('diagram');
  });
});
