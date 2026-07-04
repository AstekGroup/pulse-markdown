import type { FileEntry, TreeNode } from '../../types';
import { buildTreeFromFiles, buildTreeFromHandle, isMarkdownFile } from './tree';

const ACCEPT_TYPES: FilePickerAcceptType[] = [
  {
    description: 'Documents Markdown',
    accept: {
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.txt'],
    },
  },
];

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function pickMarkdownFileFallback(): Promise<FileEntry | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.style.display = 'none';
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0] ?? null;
        cleanup();
        resolve(file ? { id: file.name, name: file.name, path: file.name, file, source: 'picker' } : null);
      },
      { once: true },
    );
    input.addEventListener(
      'cancel',
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickMarkdownFile(): Promise<FileEntry | null> {
  if (typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker({ types: ACCEPT_TYPES, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { id: handle.name, name: handle.name, path: handle.name, handle, file, source: 'picker' };
    } catch (error) {
      if (isAbortError(error)) return null;
      return pickMarkdownFileFallback();
    }
  }
  return pickMarkdownFileFallback();
}

export interface FolderOpenResult {
  tree: TreeNode;
  rootHandle: FileSystemDirectoryHandle | null;
}

function pickMarkdownFolderFallback(): Promise<FolderOpenResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.addEventListener(
      'change',
      () => {
        const files = input.files ? Array.from(input.files) : [];
        cleanup();
        resolve(files.length > 0 ? { tree: buildTreeFromFiles(files), rootHandle: null } : null);
      },
      { once: true },
    );
    input.addEventListener(
      'cancel',
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickMarkdownFolder(): Promise<FolderOpenResult | null> {
  if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      return { tree: await buildTreeFromHandle(handle), rootHandle: handle };
    } catch (error) {
      if (isAbortError(error)) return null;
      return pickMarkdownFolderFallback();
    }
  }
  return pickMarkdownFolderFallback();
}

export type DropResult =
  | { kind: 'file'; entry: FileEntry }
  | { kind: 'dir'; tree: TreeNode; rootHandle: FileSystemDirectoryHandle | null };

async function tryGetHandle(
  item: DataTransferItem,
): Promise<FileSystemFileHandle | FileSystemDirectoryHandle | null> {
  if (typeof item.getAsFileSystemHandle !== 'function') return null;
  try {
    const handle = await item.getAsFileSystemHandle();
    return handle as FileSystemFileHandle | FileSystemDirectoryHandle | null;
  } catch {
    return null;
  }
}

export async function openDroppedItems(items: DataTransferItemList): Promise<DropResult | null> {
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;

    const handle = await tryGetHandle(item);
    if (handle?.kind === 'directory') {
      return { kind: 'dir', tree: await buildTreeFromHandle(handle), rootHandle: handle };
    }
    if (handle?.kind === 'file') {
      if (!isMarkdownFile(handle.name)) continue;
      const file = await handle.getFile();
      return {
        kind: 'file',
        entry: { id: handle.name, name: handle.name, path: handle.name, handle, file, source: 'drop' },
      };
    }

    const file = item.getAsFile();
    if (file && isMarkdownFile(file.name)) {
      return {
        kind: 'file',
        entry: { id: file.name, name: file.name, path: file.name, file, source: 'drop' },
      };
    }
  }
  return null;
}
