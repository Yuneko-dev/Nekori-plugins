export declare class PlayerDebugOverlay {
    private readonly document;
    private readonly onToggle;
    private overlay;
    private toggle;
    constructor(document: Document, onToggle: () => void);
    attach(enabled: boolean): void;
    set(enabled: boolean): void;
    log(message: string): void;
    dispose(): void;
}
