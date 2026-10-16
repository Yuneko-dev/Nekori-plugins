import type { LayoutController, LayoutHost } from './types.ts';
export interface LayoutOptions {
    readonly root: HTMLElement;
    readonly host: LayoutHost;
}
export declare function createLayout({ root, host }: LayoutOptions): LayoutController;
