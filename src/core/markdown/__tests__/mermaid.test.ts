import { describe, expect, it } from 'vitest';
import { hydrateMermaid } from '../mermaid';
import { renderMarkdown } from '../render';

describe('hydrateMermaid', () => {
  it("ne fait rien si aucun diagramme n'est présent (pas d'import mermaid)", async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Rien à faire ici.</p>';
    await expect(hydrateMermaid(root, 'light')).resolves.toBeUndefined();
    expect(root.innerHTML).toContain('Rien à faire ici.');
  });

  it('remplace le bloc source par un conteneur, sans jamais lever une exception', async () => {
    const { html } = renderMarkdown('```mermaid\ngraph TD; A-->B;\n```');
    const root = document.createElement('div');
    root.innerHTML = html;

    expect(root.querySelector('.mermaid-src')).not.toBeNull();

    await expect(hydrateMermaid(root, 'light')).resolves.toBeUndefined();

    expect(root.querySelector('.mermaid-src')).toBeNull();
    const container = root.querySelector('.mermaid-diagram');
    expect(container).not.toBeNull();
    // jsdom ne sait pas mesurer un SVG (pas de getBBox) : mermaid échoue au
    // rendu réel dans ce contexte de test, ce qui exerce précisément le
    // chemin d'erreur attendu — un message discret, jamais de page cassée.
    if (container?.classList.contains('mermaid-diagram-error')) {
      expect(container.textContent).toBe('Diagramme illisible');
    } else {
      expect(container?.innerHTML ?? '').toContain('<svg');
    }
  }, 15000);
});
