import { sanitizeMermaidSvg } from './sanitize';

let renderCounter = 0;

/**
 * Hydrate les diagrammes Mermaid après rendu : remplace chaque
 * `<pre class="mermaid-src" data-graph="…">` produit par render.ts par le SVG
 * correspondant. Import dynamique (mermaid n'est chargé que si un diagramme
 * est présent). Une erreur de rendu affiche un message discret sans jamais
 * interrompre le reste de la page.
 */
export async function hydrateMermaid(root: HTMLElement, theme: 'light' | 'dark'): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  if (nodes.length === 0) return;

  const { default: mermaid } = await import('mermaid');

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'neutral',
    fontFamily: 'inherit',
    // Étiquettes en <text> SVG natif : les labels HTML de Mermaid passent par
    // des <foreignObject>, que sanitizeMermaidSvg interdit — ils seraient
    // strippés et les nœuds apparaîtraient vides. Le drapeau existe en deux
    // endroits selon le type de diagramme, on force les deux.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  } as Parameters<typeof mermaid.initialize>[0]);

  for (const node of nodes) {
    const encodedGraph = node.getAttribute('data-graph') ?? '';
    const graphSource = encodedGraph ? decodeURIComponent(encodedGraph) : '';
    const dataLine = node.getAttribute('data-line');

    const container = document.createElement('div');
    container.className = 'mermaid-diagram';
    if (dataLine !== null) container.setAttribute('data-line', dataLine);
    // L'ancrage de bloc (commentaire sur un diagramme) a pu être posé sur le
    // <pre class="mermaid-src"> AVANT cette hydratation asynchrone : le
    // remplacement du nœud doit préserver l'ancre, sinon elle disparaît.
    for (const cls of ['pulse-anchor-block', 'is-active'] as const) {
      if (node.classList.contains(cls)) container.classList.add(cls);
    }
    const commentId = node.getAttribute('data-comment-id');
    if (commentId !== null) container.setAttribute('data-comment-id', commentId);

    if (!graphSource.trim()) {
      node.replaceWith(container);
      continue;
    }

    renderCounter += 1;
    const renderId = `pulse-mermaid-${renderCounter}`;

    try {
      const { svg } = await mermaid.render(renderId, graphSource);
      container.innerHTML = sanitizeMermaidSvg(svg);
    } catch {
      container.classList.add('mermaid-diagram-error');
      container.textContent = 'Diagramme illisible';
      document.getElementById(renderId)?.remove();
    }

    node.replaceWith(container);
  }
}
