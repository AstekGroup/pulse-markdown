// Chargement du document d'exemple embarqué (?demo, bouton « Voir un exemple »).
// Le contenu est inliné au build (vite ?raw) : aucune requête réseau à l'exécution.

import demoSource from './assets/demo.md?raw';
import type { FileEntry } from './types';

export interface DemoDocument {
  entry: FileEntry;
  source: string;
}

/** Construit l'entrée et le texte source du document d'exemple. Sans handle ni
 * fichier réel : l'enregistrement se fera systématiquement par téléchargement. */
export function loadDemo(): DemoDocument {
  const entry: FileEntry = {
    id: 'demo',
    name: 'exemple.md',
    path: 'exemple.md',
    source: 'demo',
  };
  return { entry, source: demoSource };
}
