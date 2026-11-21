import type { LayoutController } from '../layout/types.ts';
export declare function findChapterAnchor(chapter: Element, name: string): Element | null;
/** Keeps fragment resolution inside its chapter, avoiding duplicate IDs in loaded chapters. */
export declare function installScopedAnchors(root: HTMLElement, getLayout: () => LayoutController | null): () => void;
