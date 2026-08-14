import { StoreCreator } from '.';

export type NavigationStore = {
  parseNovelPath?: string;
  parseChapterPath?: string;
  /** "Novel name - Chapter name", carried over for the preview window title. */
  parseChapterTitle?: string;
  shouldAutoSubmitNovel: boolean;
  shouldAutoSubmitChapter: boolean;
  setParseNovelPath(path: string, autoSubmit?: boolean): void;
  clearParseNovelPath(): void;
  setParseChapterPath(path: string, autoSubmit?: boolean, title?: string): void;
  clearParseChapterPath(): void;
};

/**
 * @param set State setter for use inside actions
 * @param get State getter for use inside actions, outside of State setter
 */
export const NavigationStore: StoreCreator<NavigationStore> = set => ({
  parseNovelPath: undefined,
  parseChapterPath: undefined,
  parseChapterTitle: undefined,
  shouldAutoSubmitNovel: false,
  shouldAutoSubmitChapter: false,

  setParseNovelPath(path: string, autoSubmit = true) {
    set(state => ({
      ...state,
      parseNovelPath: path,
      shouldAutoSubmitNovel: autoSubmit,
    }));
  },

  clearParseNovelPath() {
    set(state => ({
      ...state,
      parseNovelPath: undefined,
      shouldAutoSubmitNovel: false,
    }));
  },

  setParseChapterPath(path: string, autoSubmit = true, title?: string) {
    set(state => ({
      ...state,
      parseChapterPath: path,
      parseChapterTitle: title,
      shouldAutoSubmitChapter: autoSubmit,
    }));
  },

  clearParseChapterPath() {
    set(state => ({
      ...state,
      parseChapterPath: undefined,
      parseChapterTitle: undefined,
      shouldAutoSubmitChapter: false,
    }));
  },
});
