export interface LayoutObservers {
    observe(element: Element): void;
    dispose(): void;
}
export declare function observeLayout(root: HTMLElement, scheduleReflow: () => void): LayoutObservers;
