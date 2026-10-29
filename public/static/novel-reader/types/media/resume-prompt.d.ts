export declare class ResumePrompt {
    private awaiting;
    private answer;
    private readonly onPlay;
    constructor(onPlay: (video: HTMLMediaElement) => void);
    tryPlay(video: HTMLMediaElement, log: (message: string) => void): void;
    cancel(): void;
    offer(video: HTMLMediaElement, overlay: HTMLElement | null, seconds: number): void;
}
