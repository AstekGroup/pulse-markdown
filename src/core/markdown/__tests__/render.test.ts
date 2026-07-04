import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../render';

function openingTags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'g');
  return html.match(re) ?? [];
}

describe('renderMarkdown — rendu basique', () => {
  it('rend un titre et un paragraphe', () => {
    const { html } = renderMarkdown('# Titre\n\nUn paragraphe.');
    expect(html).toContain('<h1');
    expect(html).toContain('Titre');
    expect(html).toContain('<p');
    expect(html).toContain('Un paragraphe.');
  });

  it('respecte typographer/linkify/breaks:false', () => {
    const { html } = renderMarkdown('Voir https://example.com pour "les guillemets".\nSuite sur la même ligne.');
    expect(html).toContain('href="https://example.com"');
    // typographer: les guillemets droits sont convertis en typographiques
    expect(html).not.toContain('"les guillemets"');
    // breaks:false : un simple retour à la ligne ne devient pas <br>
    expect(html).not.toContain('<br>');
  });
});

describe('renderMarkdown — data-line sur les blocs racine', () => {
  const content = [
    '# Titre', // 0
    '', // 1
    'Un paragraphe.', // 2
    '', // 3
    '- item un', // 4
    '- item deux', // 5
    '', // 6
    '1. premier', // 7
    '2. second', // 8
    '', // 9
    '> Une citation', // 10
    '', // 11
    '```js', // 12
    'const x = 1;', // 13
    '```', // 14
    '', // 15
    '    code indente', // 16
    '', // 17
    '| a | b |', // 18
    '| - | - |', // 19
    '', // 20
    '---', // 21
    '',
  ].join('\n');

  const { html } = renderMarkdown(content);

  it('porte data-line sur le heading', () => {
    expect(openingTags(html, 'h1')[0]).toContain('data-line="0"');
  });

  it('porte data-line sur le paragraphe racine uniquement', () => {
    const paragraphsWithLine = openingTags(html, 'p').filter((tag) => tag.includes('data-line='));
    expect(paragraphsWithLine).toHaveLength(1);
    expect(paragraphsWithLine[0]).toContain('data-line="2"');
  });

  it('porte data-line sur la liste à puces (pas sur ses items)', () => {
    expect(openingTags(html, 'ul')[0]).toContain('data-line="4"');
  });

  it('porte data-line sur la liste ordonnée', () => {
    expect(openingTags(html, 'ol')[0]).toContain('data-line="7"');
  });

  it('porte data-line sur la citation', () => {
    expect(openingTags(html, 'blockquote')[0]).toContain('data-line="10"');
  });

  it('porte data-line sur le fence et sur le bloc de code indenté', () => {
    const preTags = openingTags(html, 'pre');
    const fenceTag = preTags.find((t) => t.includes('data-lang'));
    const indentedTag = preTags.find((t) => !t.includes('data-lang'));
    expect(fenceTag).toContain('data-line="12"');
    expect(indentedTag).toContain('data-line="16"');
  });

  it('porte data-line sur le tableau', () => {
    expect(openingTags(html, 'table')[0]).toContain('data-line="18"');
  });

  it('porte data-line sur le hr', () => {
    expect(openingTags(html, 'hr')[0]).toContain('data-line="21"');
  });
});

describe('renderMarkdown — HTML brut embarqué (html_block)', () => {
  it('enveloppe un bloc HTML brut racine dans un conteneur data-line', () => {
    const { html } = renderMarkdown(
      'Avant.\n\n<blockquote>Écrit à la main, pas en syntaxe native.</blockquote>\n\nAprès.',
    );
    expect(html).toContain('class="pulse-html-block"');
    const wrapper = openingTags(html, 'div').find((tag) => tag.includes('pulse-html-block'));
    expect(wrapper).toContain('data-line="2"');
    // Le contenu HTML brut lui-même reste inchangé, seulement enveloppé.
    expect(html).toContain('<blockquote>Écrit à la main, pas en syntaxe native.</blockquote>');
  });

  it("n'enveloppe pas un bloc HTML brut imbriqué dans une liste (seul le bloc racine porte data-line)", () => {
    const { html } = renderMarkdown('- item\n  <blockquote>Imbriqué</blockquote>\n- autre item');
    expect(html).not.toContain('pulse-html-block');
    expect(openingTags(html, 'ul')[0]).toContain('data-line="0"');
  });
});

describe('renderMarkdown — XSS neutralisé', () => {
  it('neutralise une balise <script>', () => {
    const { html } = renderMarkdown('<script>alert(1)</script>\n\nTexte.');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('neutralise un onerror sur une image', () => {
    const { html } = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).toContain('<img');
    expect(html.toLowerCase()).not.toContain('onerror');
  });

  it('neutralise un lien javascript: en syntaxe Markdown', () => {
    const { html } = renderMarkdown('[cliquez](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('href="javascript:');
  });

  it('neutralise un href javascript: en HTML brut', () => {
    const { html } = renderMarkdown('<a href="javascript:alert(1)">cliquez</a>');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });
});

describe('renderMarkdown — table des matières', () => {
  it("n'expose que les titres h1 à h3", () => {
    const { toc } = renderMarkdown('# Un\n\n## Deux\n\n### Trois\n\n#### Quatre\n');
    expect(toc).toHaveLength(3);
    expect(toc.map((item) => item.level)).toEqual([1, 2, 3]);
    expect(toc.map((item) => item.text)).toEqual(['Un', 'Deux', 'Trois']);
    expect(toc.every((item) => item.id.length > 0)).toBe(true);
  });

  it('génère des ids ascii uniques et stables même avec des accents', () => {
    const { toc } = renderMarkdown('# Étude générale\n\n# Étude générale\n');
    expect(toc[0]?.id).toBe('etude-generale');
    expect(toc[1]?.id).toBe('etude-generale-1');
  });
});

describe('renderMarkdown — task list', () => {
  it('rend des cases à cocher désactivées', () => {
    const { html } = renderMarkdown('- [ ] Tâche ouverte\n- [x] Tâche faite\n');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled');
    expect(html).toContain('checked=""');
    expect(html).toContain('task-list-item');
  });
});

describe('renderMarkdown — fence mermaid', () => {
  it('ne rend jamais le diagramme (source encodée, pas de SVG)', () => {
    const { html } = renderMarkdown('```mermaid\ngraph TD; A-->B;\n```');
    expect(html).toContain('class="mermaid-src"');
    expect(html).not.toContain('<svg');

    const match = html.match(/data-graph="([^"]*)"/);
    expect(match).not.toBeNull();
    expect(decodeURIComponent(match?.[1] ?? '')).toBe('graph TD; A-->B;');
  });
});

describe('renderMarkdown — liens externes', () => {
  it('ajoute target=_blank rel=noopener noreferrer sur les liens http(s)', () => {
    const { html } = renderMarkdown('[Externe](https://example.com) et [Interne](./autre.md)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');

    const internalLink = openingTags(html, 'a').find((tag) => tag.includes('autre.md'));
    expect(internalLink).toBeDefined();
    expect(internalLink).not.toContain('target="_blank"');
  });
});

describe('renderMarkdown — mots et temps de lecture', () => {
  it('compte les mots et arrondit le temps de lecture au-dessus, minimum 1', () => {
    const { words, minutes } = renderMarkdown('mot '.repeat(450).trim());
    expect(words).toBe(450);
    expect(minutes).toBe(3);
  });

  it('retourne un minimum de 1 minute même pour un document vide', () => {
    const { words, minutes } = renderMarkdown('');
    expect(words).toBe(0);
    expect(minutes).toBe(1);
  });
});
