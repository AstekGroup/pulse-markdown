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

export async function saveFile(entry: FileEntry, content: string): Promise<SaveMode> {
  if (entry.handle && typeof entry.handle.createWritable === 'function') {
    try {
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
