export declare function fixationLength(word: string): number;
export interface BionicReading {
    setEnabled(enabled: boolean): void;
    setEditing(editing: boolean): void;
    dispose(): void;
}
export declare function createBionicReading(root: HTMLElement, initiallyEnabled: boolean, editing: () => boolean): BionicReading;
