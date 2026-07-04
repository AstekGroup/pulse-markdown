import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickMarkdownFile } from '../open';

function fakeFileHandle(overrides: Partial<FileSystemFileHandle> = {}): FileSystemFileHandle {
  return {
    kind: 'file',
    name: 'rapport.md',
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getFile: vi.fn().mockResolvedValue(new File(['# Titre'], 'rapport.md', { type: 'text/markdown' })),
    ...overrides,
  } as unknown as FileSystemFileHandle;
}

describe('pickMarkdownFile', () => {
  afterEach(() => {
    delete window.showOpenFilePicker;
  });

  it('demande la permission d’écriture dès l’ouverture, pendant que le geste utilisateur est encore actif', async () => {
    const handle = fakeFileHandle();
    window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);

    const entry = await pickMarkdownFile();

    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(entry?.handle).toBe(handle);
  });

  it('ouvre quand même le fichier si la permission d’écriture est refusée à l’ouverture', async () => {
    const handle = fakeFileHandle({ requestPermission: vi.fn().mockResolvedValue('denied') });
    window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);

    const entry = await pickMarkdownFile();

    expect(entry).not.toBeNull();
    expect(entry?.name).toBe('rapport.md');
  });

  it('ouvre quand même le fichier si la demande de permission lève une erreur', async () => {
    const handle = fakeFileHandle({ requestPermission: vi.fn().mockRejectedValue(new Error('refusé')) });
    window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);

    const entry = await pickMarkdownFile();

    expect(entry).not.toBeNull();
  });
});
