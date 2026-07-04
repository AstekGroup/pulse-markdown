declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';

  interface MarkdownItTaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  export default function markdownItTaskLists(md: MarkdownIt, options?: MarkdownItTaskListsOptions): void;
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';

  export default function markdownItFootnote(md: MarkdownIt): void;
}
