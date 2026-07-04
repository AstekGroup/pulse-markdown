export interface FileCapabilities {
  showOpenFilePicker: boolean;
  showDirectoryPicker: boolean;
  createWritable: boolean;
}

export function detectFileCapabilities(): FileCapabilities {
  const w = typeof window !== 'undefined' ? window : undefined;
  const showOpenFilePicker = typeof w?.showOpenFilePicker === 'function';
  const showDirectoryPicker = typeof w?.showDirectoryPicker === 'function';
  const fileHandleProto = (
    globalThis as {
      FileSystemFileHandle?: { prototype?: { createWritable?: unknown } };
    }
  ).FileSystemFileHandle?.prototype;
  const createWritable = typeof fileHandleProto?.createWritable === 'function';
  return { showOpenFilePicker, showDirectoryPicker, createWritable };
}
