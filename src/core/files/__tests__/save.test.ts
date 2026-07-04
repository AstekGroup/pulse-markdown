import { describe, expect, it, vi } from 'vitest';
import { saveFile } from '../save';
import type { FileEntry } from '../../../types';

function fakeHandle(overrides: Partial<FileSystemFileHandle> = {}): FileSystemFileHandle {
  return {
    kind: 'file',
    name: 'rapport.md',
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() }),
    ...overrides,
  } as unknown as FileSystemFileHandle;
}

function entryWithHandle(handle: FileSystemFileHandle): FileEntry {
  return { id: 'rapport.md', name: 'rapport.md', path: 'rapport.md', handle, source: 'picker' };
}

describe('saveFile', () => {
  it('écrit directement quand la permission est déjà accordée', async () => {
    const handle = fakeHandle();
    const mode = await saveFile(entryWithHandle(handle), 'contenu');
    expect(mode).toBe('inplace');
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
  });

  it('redemande la permission si elle n’est plus accordée, puis écrit', async () => {
    const handle = fakeHandle({ queryPermission: vi.fn().mockResolvedValue('prompt') });
    const mode = await saveFile(entryWithHandle(handle), 'contenu');
    expect(mode).toBe('inplace');
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
  });

  it('bascule sur le téléchargement sans jamais rester bloqué si la permission est refusée', async () => {
    const handle = fakeHandle({
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });
    const mode = await saveFile(entryWithHandle(handle), 'contenu');
    expect(mode).toBe('download');
    // La permission ayant été refusée, `createWritable` ne doit jamais être
    // appelé : c'est lui qui, sur un handle en lecture seule, redemanderait
    // la permission une seconde fois côté navigateur (double prompt).
    expect(handle.createWritable).not.toHaveBeenCalled();
  });

  it('bascule sur le téléchargement si `createWritable` échoue malgré une permission accordée', async () => {
    const handle = fakeHandle({ createWritable: vi.fn().mockRejectedValue(new Error('disque plein')) });
    const mode = await saveFile(entryWithHandle(handle), 'contenu');
    expect(mode).toBe('download');
  });
});
