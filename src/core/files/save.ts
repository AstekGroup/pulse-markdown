import type { FileEntry } from '../../types';

export type SaveMode = 'inplace' | 'download';

function downloadAsFile(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Vérifie (et si besoin redemande) la permission d'écriture avant d'écrire.
 *
 * En principe déjà acquise à l'ouverture (cf. `requestWritePermission` dans
 * open.ts) : ce second contrôle est un filet pour les handles restaurés
 * autrement (ex. avant l'appel à `ensureRecentPermission`) et rend le résultat
 * explicite plutôt que de dépendre du comportement implicite, variable selon
 * les navigateurs, de `createWritable()` sur un handle en lecture seule.
 */
async function hasWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  if (typeof handle.queryPermission !== 'function') return true;
  const current = await handle.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return true;
  if (typeof handle.requestPermission !== 'function') return false;
  const requested = await handle.requestPermission({ mode: 'readwrite' });
  return requested === 'granted';
}

export async function saveFile(entry: FileEntry, content: string): Promise<SaveMode> {
  if (entry.handle && typeof entry.handle.createWritable === 'function') {
    try {
      if (!(await hasWritePermission(entry.handle))) throw new Error('permission refusée');
      const writable = await entry.handle.createWritable();
      await writable.write(content);
      await writable.close();
      return 'inplace';
    } catch {
      downloadAsFile(entry.name, content);
      return 'download';
    }
  }
  downloadAsFile(entry.name, content);
  return 'download';
}
