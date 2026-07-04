import type { FileEntry, TreeNode } from '../../types';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
const SKIPPED_DIR_NAMES = new Set(['node_modules']);

export function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isSkippedName(name: string): boolean {
  return name.startsWith('.') || SKIPPED_DIR_NAMES.has(name);
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

function sortChildren(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return naturalCompare(a.name, b.name);
  });
}

export async function buildTreeFromHandle(
  rootHandle: FileSystemDirectoryHandle,
): Promise<TreeNode> {
  return walkDirectoryHandle(rootHandle, rootHandle.name, '');
}

async function walkDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  name: string,
  parentPath: string,
): Promise<TreeNode> {
  const path = parentPath ? `${parentPath}/${name}` : name;
  const children: TreeNode[] = [];
  for await (const [childName, childHandle] of handle.entries()) {
    if (isSkippedName(childName)) continue;
    if (childHandle.kind === 'directory') {
      const childNode = await walkDirectoryHandle(childHandle, childName, path);
      if (childNode.children && childNode.children.length > 0) {
        children.push(childNode);
      }
      continue;
    }
    if (!isMarkdownFile(childName)) continue;
    const childPath = `${path}/${childName}`;
    const entry: FileEntry = {
      id: childPath,
      name: childName,
      path: childPath,
      handle: childHandle,
      source: 'tree',
    };
    children.push({ kind: 'file', name: childName, path: childPath, entry });
  }
  return { kind: 'dir', name, path, children: sortChildren(children) };
}

function relativePathOf(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function buildTreeFromFiles(files: File[]): TreeNode {
  const markdownFiles = files.filter((file) => isMarkdownFile(file.name));
  const rootName = markdownFiles.length > 0 ? relativePathOf(markdownFiles[0]).split('/')[0] : 'Dossier';
  const root: TreeNode = { kind: 'dir', name: rootName, path: rootName, children: [] };
  const dirsByPath = new Map<string, TreeNode>([[rootName, root]]);

  for (const file of markdownFiles) {
    const segments = relativePathOf(file).split('/');
    const dirSegments = segments.slice(1, -1);
    const fileName = segments[segments.length - 1];
    if (dirSegments.some((segment) => isSkippedName(segment))) continue;

    let parent = root;
    let currentPath = rootName;
    for (const segment of dirSegments) {
      currentPath = `${currentPath}/${segment}`;
      let dirNode = dirsByPath.get(currentPath);
      if (!dirNode) {
        dirNode = { kind: 'dir', name: segment, path: currentPath, children: [] };
        dirsByPath.set(currentPath, dirNode);
        parent.children = parent.children ?? [];
        parent.children.push(dirNode);
      }
      parent = dirNode;
    }

    const filePath = `${currentPath}/${fileName}`;
    const entry: FileEntry = { id: filePath, name: fileName, path: filePath, file, source: 'tree' };
    parent.children = parent.children ?? [];
    parent.children.push({ kind: 'file', name: fileName, path: filePath, entry });
  }

  sortTreeRecursive(root);
  return root;
}

function sortTreeRecursive(node: TreeNode): void {
  if (!node.children) return;
  for (const child of node.children) sortTreeRecursive(child);
  node.children = sortChildren(node.children);
}

function collectFileEntries(node: TreeNode): FileEntry[] {
  const result: FileEntry[] = [];
  if (node.kind === 'file' && node.entry) result.push(node.entry);
  for (const child of node.children ?? []) result.push(...collectFileEntries(child));
  return result;
}

const COMMENT_MARKER_RE = /<!--pulse:comment\s*\n([\s\S]*?)\n-->/g;

function countCommentsInText(text: string): { open: number; total: number } {
  let open = 0;
  let total = 0;
  COMMENT_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null = COMMENT_MARKER_RE.exec(text);
  while (match !== null) {
    total += 1;
    if (/"status"\s*:\s*"open"/.test(match[1])) open += 1;
    match = COMMENT_MARKER_RE.exec(text);
  }
  return { open, total };
}

export type ReadEntryText = (entry: FileEntry) => Promise<string>;

export async function scanCommentCounts(
  tree: TreeNode,
  readText: ReadEntryText,
  concurrency = 3,
): Promise<void> {
  const entries = collectFileEntries(tree);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      try {
        const text = await readText(entry);
        entry.commentCounts = countCommentsInText(text);
      } catch {
        entry.commentCounts = undefined;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, entries.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
