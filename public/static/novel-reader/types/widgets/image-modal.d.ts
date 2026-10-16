export interface ImageModal {
    close(): void;
    setCloseLabel(label: string): void;
    dispose(): void;
}
export declare function createImageModal(root: HTMLElement, closeLabel: string): ImageModal;
