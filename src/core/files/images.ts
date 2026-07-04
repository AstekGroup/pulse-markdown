function dirnameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

export function isExternalOrDataSrc(src: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('blob:');
}

/** Résout un `src` d'image relatif (`./`, `../`, sous-dossiers) par rapport au
 * chemin du document courant, en un chemin relatif à la racine du dossier ouvert. */
export function resolveRelativeImagePath(docPath: string, src: string): string {
  const baseDir = dirnameOf(docPath);
  const combined = baseDir ? `${baseDir}/${src}` : src;
  const rawSegments = combined.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  const segments: string[] = [];
  for (const segment of rawSegments) {
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const fileName = segments[segments.length - 1];
  if (!fileName) throw new Error('Chemin d’image invalide.');
  let dir = root;
  for (const segment of segments.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(segment);
  }
  return dir.getFileHandle(fileName);
}

export interface ResolvedImages {
  count: number;
  revokeAll(): void;
}

/** Remplace, dans `containerHTML`, les `src` relatifs des images par des blob
 * URLs résolues via `rootHandle` (dossier ouvert). Sans dossier, les `src`
 * restent inchangés. */
export async function resolveImages(
  rootHandle: FileSystemDirectoryHandle | null,
  docPath: string,
  containerHTML: HTMLElement,
): Promise<ResolvedImages> {
  const blobUrls: string[] = [];
  if (!rootHandle) {
    return { count: 0, revokeAll: () => {} };
  }

  const images = Array.from(containerHTML.querySelectorAll('img[src]'));
  for (const img of images) {
    const src = img.getAttribute('src');
    if (!src || isExternalOrDataSrc(src) || src.startsWith('/')) continue;
    let decodedSrc = src;
    try {
      decodedSrc = decodeURIComponent(src);
    } catch {
      decodedSrc = src;
    }
    const targetPath = resolveRelativeImagePath(docPath, decodedSrc);
    try {
      const handle = await resolveFileHandle(rootHandle, targetPath);
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      blobUrls.push(url);
      img.setAttribute('src', url);
    } catch {
      // image introuvable dans le dossier ouvert : le src d'origine est conservé
    }
  }

  return {
    count: blobUrls.length,
    revokeAll: () => {
      for (const url of blobUrls) URL.revokeObjectURL(url);
    },
  };
}
