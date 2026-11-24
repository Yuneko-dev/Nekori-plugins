// src/layout/math.ts
var clamp = (value, low, high) => Math.min(Math.max(value, low), high);
function leavesPerUnit(spread) {
  return spread === "double" ? 2 : 1;
}
function unitCount(leafCount, spread) {
  return Math.max(1, Math.ceil(Math.max(0, leafCount) / leavesPerUnit(spread)));
}
function unitFromOffset(offset, viewport, count) {
  if (!(viewport > 0) || count < 2) return 0;
  return clamp(Math.round(Math.max(0, offset) / viewport), 0, count - 1);
}
function unitFromProgress(progress, count) {
  if (count < 2) return 0;
  return clamp(Math.round(clamp(progress, 0, 1) * (count - 1)), 0, count - 1);
}
function progressForUnit(unit, count) {
  if (count < 2) return 1;
  return clamp(unit, 0, count - 1) / (count - 1);
}
function leafRange(unit, leafCount, spread) {
  const perUnit = leavesPerUnit(spread);
  const first = clamp(unit, 0, unitCount(leafCount, spread) - 1) * perUnit;
  return {
    firstLeaf: first + 1,
    lastLeaf: Math.min(first + perUnit, Math.max(1, leafCount))
  };
}
function logicalOffset(scrollLeft, direction) {
  return direction === "rtl" ? -scrollLeft : scrollLeft;
}
function physicalOffset(offset, direction) {
  return direction === "rtl" ? -offset : offset;
}
function chapterForLeaf(chapters, leaf) {
  if (chapters.length === 0) return null;
  let match = chapters[0] ?? null;
  for (const chapter of chapters) {
    if (leaf < chapter.startLeaf) break;
    match = chapter;
    if (leaf < chapter.startLeaf + chapter.leafCount) break;
  }
  return match;
}

// src/layout/page-map.ts
function leafForRect(rect, hostRect, offset, leafSize, vertical, direction) {
  const position = vertical ? rect.top - hostRect.top + offset : direction === "rtl" ? hostRect.right - rect.right + offset : rect.left - hostRect.left + offset;
  return Math.max(0, Math.floor((position + 1) / leafSize));
}
function measureChapterMap(root, offset, leafSize, vertical, direction) {
  const hostRect = root.getBoundingClientRect();
  return Array.from(root.querySelectorAll(".nekori-chapter")).map((element) => {
    let rects = Array.from(element.getClientRects());
    if (rects.length === 0) rects = [element.getBoundingClientRect()];
    const leaves = rects.map((rect) => leafForRect(rect, hostRect, offset, leafSize, vertical, direction));
    const first = Math.min(...leaves);
    const last = Math.max(...leaves);
    return {
      chapterId: element.getAttribute("data-nekori-chapter-id") ?? "",
      startLeaf: first,
      leafCount: Math.max(1, last - first + 1),
      element
    };
  });
}
function rebuildBlankLeaves(root, chapters, double) {
  root.querySelectorAll(".nekori-layout-blank-leaf").forEach((blank) => blank.remove());
  if (!double) return;
  for (const chapter of chapters) {
    if (chapter.leafCount % 2 === 0) continue;
    const blank = root.ownerDocument.createElement("div");
    blank.className = "nekori-layout-blank-leaf";
    blank.setAttribute("aria-hidden", "true");
    chapter.element.insertAdjacentElement("afterend", blank);
  }
}

// src/layout/commands.ts
function createLayoutCommands(options) {
  const {
    root,
    getConfig,
    getPageMap,
    getTotalLeaves,
    getCurrentUnit,
    perUnit,
    viewport,
    scrollToUnit,
    requestNext,
    scheduleReflow,
    emitPosition,
    onProgress,
    transitions
  } = options;
  function rememberLeafProgress(leaf) {
    const config = getConfig();
    const chapter = chapterForLeaf(getPageMap(), leaf);
    if (!chapter) return;
    const localLeaf = Math.min(Math.max(leaf - chapter.startLeaf, 0), chapter.leafCount - 1);
    const localUnit = Math.floor(localLeaf / perUnit());
    onProgress(progressForUnit(localUnit, unitCount(chapter.leafCount, config.spread)));
  }
  return {
    moveBy(delta, behavior = "auto") {
      const source = transitions.silentSourceUnit ?? getCurrentUnit();
      const destination = source + Math.sign(Number(delta || 0));
      if (destination < 0) return false;
      if (destination >= unitCount(getTotalLeaves(), getConfig().spread)) {
        requestNext(true);
        return false;
      }
      rememberLeafProgress(destination * perUnit());
      scrollToUnit(destination, behavior);
      return true;
    },
    seekUnit(localUnit, behavior = "auto") {
      const config = getConfig();
      const chapter = chapterForLeaf(getPageMap(), getCurrentUnit() * perUnit());
      if (!chapter) return false;
      const count = unitCount(chapter.leafCount, config.spread);
      const target = Math.min(Math.max(Number(localUnit) || 0, 0), count - 1);
      const destination = Math.floor(chapter.startLeaf / perUnit()) + target;
      rememberLeafProgress(destination * perUnit());
      scrollToUnit(destination, behavior);
      return true;
    },
    seekPercent(percent) {
      const config = getConfig();
      const chapter = chapterForLeaf(getPageMap(), getCurrentUnit() * perUnit());
      if (!chapter) return false;
      const count = unitCount(chapter.leafCount, config.spread);
      const local = unitFromProgress(Number(percent) / 100, count);
      transitions.lastChapterProgress = progressForUnit(local, count);
      onProgress(transitions.lastChapterProgress);
      const destination = Math.floor(chapter.startLeaf / perUnit()) + local;
      rememberLeafProgress(destination * perUnit());
      scrollToUnit(destination);
      return true;
    },
    revealElement(element) {
      if (!element?.getBoundingClientRect) return false;
      const config = getConfig();
      const leaf = leafForRect(
        element.getBoundingClientRect(),
        root.getBoundingClientRect(),
        config.vertical ? root.scrollTop || 0 : logicalOffset(root.scrollLeft || 0, config.direction),
        viewport() / perUnit(),
        config.vertical,
        config.direction
      );
      const destination = Math.floor(leaf / perUnit());
      rememberLeafProgress(destination * perUnit());
      scrollToUnit(destination);
      return true;
    },
    reflow(preserveViewport = false) {
      if (preserveViewport && getConfig().enabled && !transitions.restore) {
        const currentUnit = getCurrentUnit();
        const chapter = chapterForLeaf(getPageMap(), currentUnit * perUnit());
        if (chapter) {
          transitions.restore = {
            chapterId: chapter.chapterId,
            progress: transitions.lastChapterProgress ?? 0,
            unitIndex: currentUnit - Math.floor(chapter.startLeaf / perUnit())
          };
        }
      }
      scheduleReflow();
      return true;
    },
    prepareSilentTurn(preserveViewport = true) {
      const chapter = chapterForLeaf(getPageMap(), getCurrentUnit() * perUnit());
      transitions.silentSourceUnit = getCurrentUnit();
      transitions.restore = preserveViewport && chapter ? { chapterId: chapter.chapterId, progress: transitions.lastChapterProgress ?? 0 } : null;
      transitions.silent = true;
      return true;
    },
    finishSilentTurn(reflow = true, commit = true) {
      if (!commit && transitions.silentSourceUnit !== null) scrollToUnit(transitions.silentSourceUnit);
      transitions.silentSourceUnit = null;
      transitions.silent = false;
      if (!reflow) emitPosition(commit);
      else scheduleReflow();
      return true;
    }
  };
}

// src/layout/publish-position.ts
function createPositionPublisher(options) {
  const { host, getConfig, getPageMap, getCurrentUnit, perUnit, isSilent, requestNext, onProgress } = options;
  let lastChapterId = null;
  let lastPositionKey = null;
  let lastPosition = null;
  let lastChapterProgress = null;
  return {
    get position() {
      return lastPosition;
    },
    get lastProgress() {
      return lastChapterProgress;
    },
    setLastProgress(progress) {
      lastChapterProgress = progress;
    },
    resetPositionKey() {
      lastPositionKey = null;
    },
    emitPosition(persist) {
      const config = getConfig();
      const pageMap = getPageMap();
      if (!config.enabled || isSilent() || pageMap.length === 0) return;
      const globalUnit = getCurrentUnit();
      const globalLeaf = globalUnit * perUnit();
      const chapter = chapterForLeaf(pageMap, globalLeaf);
      if (!chapter) return;
      const localLeaf = Math.min(Math.max(globalLeaf - chapter.startLeaf, 0), chapter.leafCount - 1);
      const unitIndex = Math.floor(localLeaf / perUnit());
      const count = unitCount(chapter.leafCount, config.spread);
      const progress = progressForUnit(unitIndex, count);
      const range = leafRange(unitIndex, chapter.leafCount, config.spread);
      const positionKey = [chapter.chapterId, unitIndex, count, chapter.leafCount].join(":");
      const position = {
        chapterId: chapter.chapterId,
        unitIndex,
        unitCount: count,
        firstPage: range.firstLeaf,
        lastPage: range.lastLeaf,
        totalPages: chapter.leafCount,
        progress
      };
      lastPosition = position;
      if (positionKey !== lastPositionKey) {
        lastPositionKey = positionKey;
        if (chapter.chapterId !== lastChapterId) host.emit("chapter.visible", { chapterId: chapter.chapterId, progress });
        host.emit("layout.positionChanged", position);
        host.emit("scroll.progressPreview", { progress });
      }
      if (persist) host.emit("scroll.progressPersist", { progress });
      if (config.infinite && chapter === pageMap.at(-1) && progress >= config.threshold) requestNext(false);
      lastChapterId = chapter.chapterId;
      lastChapterProgress = progress;
      onProgress(progress);
    }
  };
}

// src/layout/vertical-text.ts
function combineShortNumbers(root) {
  const document2 = root.ownerDocument;
  const showText = document2.defaultView?.NodeFilter.SHOW_TEXT;
  if (showText === void 0) return;
  const walker = document2.createTreeWalker(root, showText);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !/[0-9]{2}/.test(node.data)) continue;
    if (parent.closest(".tcy,script,style,textarea,code,pre,rt,rp,svg,math,[contenteditable]")) continue;
    if (document2.defaultView?.getComputedStyle(parent).textCombineUpright === "all") continue;
    nodes.push(node);
  }
  for (const node of nodes) {
    const pattern = /(^|[^0-9A-Za-z])([0-9]{2})(?![0-9A-Za-z])/g;
    const fragment = document2.createDocumentFragment();
    let cursor = 0;
    let matched = false;
    for (const match of node.data.matchAll(pattern)) {
      const index = match.index;
      const prefix = match[1] ?? "";
      const digits = match[2] ?? "";
      const start = index + prefix.length;
      fragment.append(document2.createTextNode(node.data.slice(cursor, start)));
      const span = document2.createElement("span");
      span.className = "tcy";
      span.textContent = digits;
      fragment.append(span);
      cursor = start + digits.length;
      matched = true;
    }
    if (!matched) continue;
    fragment.append(document2.createTextNode(node.data.slice(cursor)));
    node.replaceWith(fragment);
  }
}

// src/layout/reflow.ts
function performReflow(options) {
  const {
    root,
    config,
    pageMap,
    currentUnit,
    perUnit,
    viewport,
    extent,
    lastProgress,
    restore,
    measure,
    scrollToUnit,
    setPageMap,
    setTotalLeaves,
    clearRestore,
    clearLastProgress,
    resetPositionKey,
    emitPosition
  } = options;
  if (!config.enabled) return;
  const currentChapter = chapterForLeaf(pageMap, currentUnit * perUnit);
  const snapshot = restore ?? (currentChapter ? { chapterId: currentChapter.chapterId, progress: lastProgress ?? 0 } : null);
  if (config.vertical) combineShortNumbers(root);
  const beforeBlanks = measure();
  rebuildBlankLeaves(root, beforeBlanks, config.spread === "double");
  let measured = measure();
  const leafSize = viewport / perUnit;
  const contentLeaves = Math.max(1, Math.round(extent() / leafSize));
  if (measured.length === 0 && config.spread === "double" && contentLeaves % 2 !== 0) {
    const blank = root.ownerDocument.createElement("div");
    blank.className = "nekori-layout-blank-leaf";
    blank.setAttribute("aria-hidden", "true");
    root.append(blank);
  }
  setTotalLeaves(Math.max(1, Math.round(extent() / leafSize)));
  if (measured.length === 0) {
    measured = [{ chapterId: config.chapterId, startLeaf: 0, leafCount: contentLeaves, element: root }];
  }
  setPageMap(measured);
  if (snapshot) {
    const chapter = measured.find((entry) => entry.chapterId === snapshot.chapterId);
    if (chapter) {
      const count = unitCount(chapter.leafCount, config.spread);
      const local = snapshot.unitIndex === void 0 ? unitFromProgress(snapshot.progress, count) : Math.min(Math.max(snapshot.unitIndex, 0), count - 1);
      scrollToUnit(Math.floor(chapter.startLeaf / perUnit) + local);
    }
  }
  clearRestore();
  if (restore) clearLastProgress();
  resetPositionKey();
  emitPosition(false);
}

// src/layout/observers.ts
function observeLayout(root, scheduleReflow) {
  const document2 = root.ownerDocument;
  const activeWindow = document2.defaultView;
  if (!activeWindow) throw new Error("Layout observers require an active document window");
  const view = activeWindow;
  const observed = /* @__PURE__ */ new WeakSet();
  const resizeObserver = view.ResizeObserver ? new view.ResizeObserver(scheduleReflow) : null;
  const mutationObserver = view.MutationObserver ? new view.MutationObserver((mutations) => {
    const external = mutations.some(
      (mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) => node.nodeType !== 1 || !node.classList.contains("nekori-layout-blank-leaf")
      )
    );
    if (external) scheduleReflow();
  }) : null;
  const onResourceLoad = (event) => {
    if (event.target instanceof view.HTMLImageElement) scheduleReflow();
  };
  const fonts = document2.fonts;
  mutationObserver?.observe(root, { childList: true, subtree: true });
  document2.addEventListener("load", onResourceLoad, true);
  void fonts?.ready.then(scheduleReflow);
  fonts?.addEventListener("loadingdone", scheduleReflow);
  return {
    observe(element) {
      if (!resizeObserver || observed.has(element)) return;
      resizeObserver.observe(element);
      observed.add(element);
    },
    dispose() {
      document2.removeEventListener("load", onResourceLoad, true);
      fonts?.removeEventListener("loadingdone", scheduleReflow);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    }
  };
}

// src/layout/create-layout.ts
var DEFAULT_CONFIG = {
  enabled: false,
  spread: "single",
  direction: "ltr",
  vertical: false,
  infinite: false,
  threshold: 0.8,
  chapterId: ""
};
function createLayout({ root, host }) {
  const document2 = root.ownerDocument;
  const activeWindow = document2.defaultView;
  if (!activeWindow) throw new Error("Layout requires an active document window");
  const view = activeWindow;
  let config = DEFAULT_CONFIG;
  let pageMap = [];
  let totalLeaves = 1;
  let framePending = false;
  let reflowPending = false;
  const transitions = {
    silent: false,
    restore: null,
    silentSourceUnit: null,
    lastChapterProgress: null
  };
  let settleTimer = null;
  let animationFrame = null;
  let silentScrollTarget = null;
  const perUnit = () => config.spread === "double" ? 2 : 1;
  const viewport = () => Math.max(config.vertical ? root.clientHeight : root.clientWidth, 1);
  const extent = () => config.vertical ? root.scrollHeight : root.scrollWidth;
  const readOffset = () => config.vertical ? root.scrollTop || 0 : logicalOffset(root.scrollLeft || 0, config.direction);
  const writeOffset = (offset, behavior = "auto") => {
    if (config.vertical) root.scrollTo({ top: offset, behavior });
    else root.scrollTo({ left: physicalOffset(offset, config.direction), behavior });
  };
  const currentUnit = () => unitFromOffset(readOffset(), viewport(), unitCount(totalLeaves, config.spread));
  const scrollToUnit = (unit, behavior = "auto") => {
    const max = unitCount(totalLeaves, config.spread) - 1;
    writeOffset(Math.min(Math.max(unit, 0), max) * viewport(), behavior);
  };
  const measure = () => {
    const map = measureChapterMap(root, readOffset(), viewport() / perUnit(), config.vertical, config.direction);
    map.forEach((chapter) => {
      observers.observe(chapter.element);
      chapter.element.querySelectorAll("nekori-chapter-summary").forEach((element) => observers.observe(element));
    });
    return map;
  };
  function requestNext(atBoundary) {
    if (!config.infinite) {
      host.emit("navigation.loadNext", {});
      return;
    }
    if (root.dataset.nekoriLoadingNext === "true" || root.dataset.nekoriNoMoreChapters === "true" && !atBoundary) return;
    root.dataset.nekoriLoadingNext = "true";
    try {
      host.emit("navigation.loadNext", {});
    } catch {
      root.dataset.nekoriLoadingNext = "false";
    }
  }
  const publisher = createPositionPublisher({
    host,
    getConfig: () => config,
    getPageMap: () => pageMap,
    getCurrentUnit: currentUnit,
    perUnit,
    isSilent: () => transitions.silent,
    requestNext,
    onProgress: (progress) => {
      transitions.lastChapterProgress = progress;
    }
  });
  const emitPosition = publisher.emitPosition;
  const resetPositionKey = publisher.resetPositionKey;
  function clampPageBounds() {
    const pageCount = unitCount(totalLeaves, config.spread);
    const offset = readOffset();
    const clamped = Math.min(Math.max(offset, 0), Math.max(0, (pageCount - 1) * viewport()));
    if (Math.abs(offset - clamped) > 0.5) writeOffset(clamped);
  }
  function onScroll() {
    clampPageBounds();
    if (!framePending) {
      framePending = true;
      animationFrame = view.requestAnimationFrame(() => {
        framePending = false;
        emitPosition(false);
      }) ?? null;
    }
    if (settleTimer !== null && view) view.clearTimeout(settleTimer);
    settleTimer = null;
    if (!view) return;
    if (transitions.silent) return;
    if (silentScrollTarget !== null) {
      if (Math.abs(readOffset() - silentScrollTarget) <= 1) return;
      silentScrollTarget = null;
    }
    settleTimer = view.setTimeout(() => {
      settleTimer = null;
      const unit = currentUnit();
      if (Math.abs(readOffset() - unit * viewport()) > 1) scrollToUnit(unit);
      emitPosition(true);
    }, 180);
  }
  function doReflow() {
    reflowPending = false;
    performReflow({
      root,
      config,
      pageMap,
      currentUnit: currentUnit(),
      perUnit: perUnit(),
      viewport: viewport(),
      extent,
      lastProgress: transitions.lastChapterProgress,
      restore: transitions.restore,
      measure,
      scrollToUnit,
      setPageMap: (value) => {
        pageMap = value;
      },
      setTotalLeaves: (value) => {
        totalLeaves = value;
      },
      clearRestore: () => {
        transitions.restore = null;
      },
      clearLastProgress: () => {
        transitions.lastChapterProgress = null;
      },
      resetPositionKey,
      emitPosition
    });
  }
  function scheduleReflow() {
    if (!config.enabled || reflowPending) return;
    reflowPending = true;
    animationFrame = view.requestAnimationFrame(doReflow);
  }
  const observers = observeLayout(root, scheduleReflow);
  observers.observe(root);
  root.classList.add("nekori-reader");
  root.addEventListener("scroll", onScroll, { passive: true });
  const commands = createLayoutCommands({
    root,
    getConfig: () => config,
    getPageMap: () => pageMap,
    getTotalLeaves: () => totalLeaves,
    getCurrentUnit: currentUnit,
    perUnit,
    viewport,
    scrollToUnit,
    requestNext,
    scheduleReflow,
    emitPosition,
    onProgress: (progress) => {
      transitions.lastChapterProgress = progress;
    },
    transitions
  });
  const controller = {
    get enabled() {
      return config.enabled;
    },
    get position() {
      return publisher.position;
    },
    configure(value) {
      config = {
        enabled: Boolean(value.enabled),
        vertical: Boolean(value.vertical),
        spread: !value.vertical && value.spread === "double" ? "double" : "single",
        direction: value.direction === "rtl" ? "rtl" : "ltr",
        infinite: Boolean(value.infinite),
        chapterId: value.chapterId,
        threshold: Number.isFinite(value.threshold) ? Math.min(Math.max(value.threshold, 0), 1) : 0.8
      };
      root.classList.toggle("is-paged", config.enabled);
      root.dataset.readerSpread = config.spread;
      root.dataset.readerWritingMode = config.vertical ? "vertical-rl" : "horizontal-tb";
      if (config.enabled) root.dir = config.vertical ? "ltr" : config.direction;
      else root.removeAttribute("dir");
      if (config.enabled) scheduleReflow();
      else root.querySelectorAll(".nekori-layout-blank-leaf").forEach((blank) => blank.remove());
    },
    ...commands,
    prepareSilentTurn(preserveViewport = true) {
      if (settleTimer !== null) view.clearTimeout(settleTimer);
      settleTimer = null;
      return commands.prepareSilentTurn(preserveViewport);
    },
    finishSilentTurn(reflow = true, commit = true) {
      if (settleTimer !== null) view.clearTimeout(settleTimer);
      settleTimer = null;
      const finished = commands.finishSilentTurn(reflow, commit);
      silentScrollTarget = readOffset();
      return finished;
    },
    dispose() {
      root.removeEventListener("scroll", onScroll);
      observers.dispose();
      if (settleTimer !== null) view?.clearTimeout(settleTimer);
      if (animationFrame !== null) view?.cancelAnimationFrame(animationFrame);
    }
  };
  return controller;
}

// src/layout/progress.ts
function computeVerticalProgress(scrollTop, documentHeight, viewportHeight, boundaries, enabled, doneThreshold) {
  const scrollable = documentHeight - viewportHeight;
  let progress = scrollable > 0 ? scrollTop / scrollable : 1;
  if (scrollable > 0 && scrollTop >= scrollable - 2) progress = 1;
  if (progress >= doneThreshold) progress = 1;
  progress = Math.max(progress, 0);
  let chapterProgress = progress;
  let boundaryIndex = 0;
  let chapterId = null;
  let isLast = true;
  if (enabled && boundaries.length > 1) {
    for (let index = 0; index < boundaries.length; index += 1) {
      const boundary2 = boundaries[index];
      if (boundary2 && scrollTop >= boundary2.startOffset) boundaryIndex = index;
      else break;
    }
    if (scrollable <= 0 || scrollTop >= scrollable - 2) boundaryIndex = boundaries.length - 1;
    const boundary = boundaries[boundaryIndex];
    if (boundary) {
      chapterId = boundary.chapterId;
      const chapterScrollTop = Math.max(scrollTop - boundary.startOffset, 0);
      isLast = boundaryIndex === boundaries.length - 1;
      if (isLast && boundary.height <= viewportHeight) {
        chapterProgress = progress;
      } else {
        const effectiveHeight = Math.max(boundary.height - (isLast ? viewportHeight : 0), 1);
        chapterProgress = Math.min(chapterScrollTop / effectiveHeight, 1);
        if (chapterProgress >= doneThreshold) chapterProgress = 1;
      }
    }
  }
  return { progress, chapterProgress, boundaryIndex, chapterId, isLast };
}
function shouldLoadNextChapter(state2, boundaries, threshold) {
  return boundaries.length > 1 ? state2.boundaryIndex === boundaries.length - 1 && state2.chapterProgress >= threshold : state2.progress >= threshold;
}
function boundariesFromOffsets(chapterIds, offsets, documentEnd) {
  return chapterIds.map((chapterId, index) => {
    const startOffset = offsets[index] ?? 0;
    const endOffset = offsets[index + 1] ?? documentEnd;
    return { chapterId, startOffset, height: endOffset - startOffset };
  });
}

// src/chapters/metadata.ts
var CHAPTER_TAG_NAME = "nekori-chapter";
var CHAPTER_ID_ATTR = "data-nekori-chapter-id";
var CHAPTER_TITLE_ATTR = "data-nekori-chapter-name";
var CHAPTER_NUMBER_ATTR = "data-nekori-chapter-number";
var CHAPTER_PATH_ATTR = "data-nekori-chapter-path";
var CHAPTER_URL_ATTR = "data-nekori-chapter-url";
var CHAPTER_DIVIDER_CLASS = "nekori-chapter-divider";
var CHAPTER_CLASS = "nekori-chapter";
var PLAIN_TEXT_CLASS = "nekori-plain-text";
var PLAIN_TEXT_ATTR = "data-nekori-plain-text";

// src/layout/boundary-measurement.ts
function measureChapterBoundaries(root) {
  const document2 = root.ownerDocument;
  const view = document2.defaultView;
  if (!view) return [];
  const dividers = Array.from(root.querySelectorAll(`.${CHAPTER_DIVIDER_CLASS}`));
  const scrollY = view.scrollY || view.pageYOffset || 0;
  const banner = document2.getElementById("inline-loading") ?? document2.getElementById("inline-error");
  const lastDivider = dividers.at(-1);
  const bannerTrails = !!banner && (!lastDivider || Boolean(
    lastDivider.compareDocumentPosition(banner) & view.Node.DOCUMENT_POSITION_FOLLOWING
  ));
  const documentEnd = bannerTrails ? banner.getBoundingClientRect().top + scrollY : document2.body?.scrollHeight ?? Math.max(document2.documentElement.scrollHeight, 0);
  const ids = dividers.map((divider) => divider.getAttribute(CHAPTER_ID_ATTR) ?? "");
  const offsets = dividers.map((divider) => divider.getBoundingClientRect().top + scrollY);
  return boundariesFromOffsets(ids, offsets, documentEnd);
}

// src/layout/scroll-tracking.ts
function createScrollTracking({ root, host, isPaged = () => false }) {
  const document2 = root.ownerDocument;
  const activeWindow = document2.defaultView;
  if (!activeWindow) throw new Error("Scroll tracking requires an active document window");
  const view = activeWindow;
  let config = {
    infiniteScrollEnabled: false,
    loadThreshold: 0.8,
    doneThreshold: 0.95
  };
  let boundaries = [];
  let loadingNext = false;
  let noMoreChapters = false;
  let lastVisibleChapterId = null;
  let lastSliderProgress = -1;
  let lastSliderUpdateAt = 0;
  let lastBodyResizeAt = 0;
  let frame = null;
  let boundaryFrame = null;
  let settleTimer = null;
  let rebuildPending = false;
  let disposed = false;
  const settleMs = 400;
  const scrollingElement = document2.scrollingElement ?? document2.documentElement;
  const scrollTop = () => view.scrollY || scrollingElement.scrollTop || document2.body?.scrollTop || 0;
  const documentHeight = () => Math.max(scrollingElement.scrollHeight, document2.body?.scrollHeight ?? 0);
  const viewportHeight = () => view.innerHeight || scrollingElement.clientHeight;
  const state2 = () => computeVerticalProgress(
    scrollTop(),
    documentHeight(),
    viewportHeight(),
    boundaries,
    config.infiniteScrollEnabled,
    config.doneThreshold
  );
  function dispatchProgress(progress) {
    view.dispatchEvent(new view.CustomEvent("nekori:progress", {
      detail: {
        progress: progress.progress,
        chapterProgress: progress.chapterProgress,
        chapterId: progress.chapterId,
        isLast: progress.isLast
      }
    }));
  }
  function publishProgress(progress) {
    if (Math.abs(progress.chapterProgress - lastSliderProgress) > 0.01 && Date.now() - lastSliderUpdateAt > 50) {
      lastSliderProgress = progress.chapterProgress;
      lastSliderUpdateAt = Date.now();
      host.emit("scroll.progressPreview", { progress: progress.chapterProgress });
      dispatchProgress(progress);
    }
    if (progress.isLast && progress.chapterProgress >= 1 && lastSliderProgress !== 1) {
      lastSliderProgress = 1;
      host.emit("scroll.progressPreview", { progress: 1 });
      host.emit("scroll.progressPersist", { progress: 1 });
      dispatchProgress(progress);
    }
  }
  function requestNextChapter() {
    if (loadingNext || !config.infiniteScrollEnabled || noMoreChapters) return;
    loadingNext = true;
    try {
      host.emit("navigation.loadNext", {});
    } catch {
      loadingNext = false;
    }
  }
  function sample() {
    frame = null;
    if (disposed || isPaged()) return;
    const current = state2();
    if (config.infiniteScrollEnabled && current.chapterId !== null && current.chapterId !== lastVisibleChapterId) {
      lastVisibleChapterId = current.chapterId;
      host.emit("chapter.visible", { chapterId: current.chapterId, progress: current.chapterProgress });
    }
    publishProgress(current);
    if (shouldLoadNextChapter(current, boundaries, config.loadThreshold)) requestNextChapter();
  }
  function onScroll() {
    if (frame === null) frame = view.requestAnimationFrame(sample);
    if (settleTimer !== null) view.clearTimeout(settleTimer);
    settleTimer = view.setTimeout(persistCurrent, 250);
  }
  function persistCurrent(retriesLeft = 3) {
    if (disposed || isPaged()) return;
    if (retriesLeft > 0 && Date.now() - lastBodyResizeAt < settleMs) {
      settleTimer = view.setTimeout(() => persistCurrent(retriesLeft - 1), settleMs);
      return;
    }
    const current = state2();
    lastSliderProgress = current.chapterProgress;
    host.emit("scroll.progressPreview", { progress: current.chapterProgress });
    dispatchProgress(current);
    host.emit("scroll.progressPersist", { progress: current.chapterProgress });
  }
  const onScrollEnd = () => persistCurrent();
  function scheduleBoundaryRebuild() {
    if (!config.infiniteScrollEnabled || rebuildPending || disposed) return;
    rebuildPending = true;
    boundaryFrame = view.requestAnimationFrame(() => {
      boundaryFrame = null;
      rebuildPending = false;
      updateChapterBoundaries();
    });
  }
  function updateChapterBoundaries() {
    boundaries = measureChapterBoundaries(root);
    onScroll();
  }
  function onResize() {
    lastBodyResizeAt = Date.now();
    scheduleBoundaryRebuild();
  }
  view.addEventListener("scroll", onScroll, { passive: true });
  view.addEventListener("scrollend", onScrollEnd, { passive: true });
  const bodyResizeObserver = view.ResizeObserver && document2.body ? new view.ResizeObserver(onResize) : null;
  bodyResizeObserver?.observe(document2.body);
  const boundaryResizeObserver = view.ResizeObserver && root ? new view.ResizeObserver(scheduleBoundaryRebuild) : null;
  boundaryResizeObserver?.observe(root);
  const mutationObserver = view.MutationObserver ? new view.MutationObserver(scheduleBoundaryRebuild) : null;
  mutationObserver?.observe(root, { childList: true, subtree: true });
  const controller = {
    configure(value) {
      config = {
        infiniteScrollEnabled: Boolean(value.infiniteScrollEnabled),
        loadThreshold: Math.min(Math.max(Number(value.loadThreshold) || 0, 0), 1),
        doneThreshold: Math.min(Math.max(Number(value.doneThreshold) || 0, 0), 1)
      };
      if (config.infiniteScrollEnabled) updateChapterBoundaries();
    },
    setLoadingNext(value) {
      loadingNext = Boolean(value);
      root.dataset.nekoriLoadingNext = String(loadingNext);
      if (!loadingNext) onScroll();
    },
    setNoMoreChapters(value) {
      noMoreChapters = Boolean(value);
      root.dataset.nekoriNoMoreChapters = String(noMoreChapters);
    },
    resetChapterTracking() {
      lastVisibleChapterId = null;
      onScroll();
    },
    updateChapterBoundaries,
    dispose() {
      disposed = true;
      view.removeEventListener("scroll", onScroll);
      view.removeEventListener("scrollend", onScrollEnd);
      bodyResizeObserver?.disconnect();
      boundaryResizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (frame !== null) view.cancelAnimationFrame(frame);
      if (boundaryFrame !== null) view.cancelAnimationFrame(boundaryFrame);
      if (settleTimer !== null) view.clearTimeout(settleTimer);
    }
  };
  return controller;
}

// src/layout/short-chapter.ts
function observeShortChapter({ host, enabled }) {
  if (!enabled || host.root.classList.contains("is-paged")) return () => {
  };
  const document2 = host.root.ownerDocument;
  const view = document2.defaultView;
  if (!view) return () => {
  };
  let called = false;
  let disposed = false;
  let timeout = null;
  const check = () => {
    const documentHeight = Math.max(
      document2.documentElement.scrollHeight,
      document2.body?.scrollHeight ?? 0
    );
    const viewport = view.innerHeight || document2.documentElement.clientHeight;
    if (documentHeight - viewport > 0) return false;
    called = true;
    host.emit("chapter.markShort", {});
    observer?.disconnect();
    if (timeout !== null) view.clearTimeout(timeout);
    timeout = null;
    return true;
  };
  const observer = view.ResizeObserver && document2.body ? new view.ResizeObserver(() => {
    if (!called && !disposed) check();
  }) : null;
  observer?.observe(document2.body);
  timeout = view.setTimeout(() => {
    if (!called && !disposed) check();
    observer?.disconnect();
    timeout = null;
  }, 500);
  return () => {
    disposed = true;
    observer?.disconnect();
    if (timeout !== null) view.clearTimeout(timeout);
    timeout = null;
  };
}

// src/media/direct.ts
function buildHlsSource(_url, config, debug = Boolean(config.debug)) {
  return {
    preferPlayback: "mse",
    type: "application/vnd.apple.mpegurl",
    engine: {
      // Vendor HLS patch option; it stays paired with the upstream bundle's capture hook.
      hlsJs: { debug, ...config, tsundokuCaptureFragments: false }
    }
  };
}
function buildHlsDownloadConfig(config, debug) {
  return {
    debug,
    ...config,
    autoStartLoad: false,
    backBufferLength: 0,
    lowLatencyMode: false,
    progressive: false,
    startFragPrefetch: false,
    // Vendor HLS patch option; it stays paired with the upstream bundle's capture hook.
    tsundokuCaptureFragments: true
  };
}
function buildDashSource(settings, protectionData) {
  return {
    ...settings ? { settings } : {},
    ...protectionData ? { protectionData } : {}
  };
}

// src/media/debug-overlay.ts
var PlayerDebugOverlay = class {
  document;
  onToggle;
  overlay = null;
  toggle = null;
  constructor(document2, onToggle) {
    this.document = document2;
    this.onToggle = onToggle;
  }
  attach(enabled) {
    if (this.overlay) return;
    this.overlay = this.document.createElement("div");
    this.overlay.id = "nekori-debug-overlay";
    this.document.body.append(this.overlay);
    this.set(enabled);
  }
  set(enabled) {
    if (!this.overlay) return;
    if (enabled && !this.toggle) {
      this.toggle = this.document.createElement("button");
      this.toggle.id = "nekori-debug-toggle";
      this.toggle.type = "button";
      this.toggle.addEventListener("click", this.onToggle);
      this.document.body.append(this.toggle);
    }
    this.overlay?.classList.toggle("active", enabled);
    this.toggle?.setAttribute("aria-expanded", String(enabled));
    this.toggle?.setAttribute("aria-label", enabled ? "Hide player log" : "Show player log");
  }
  log(message) {
    if (!this.overlay) return;
    const line = this.document.createElement("div");
    line.className = "nekori-debug-msg";
    line.textContent = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${message}`;
    this.overlay.append(line);
    this.overlay.scrollTop = this.overlay.scrollHeight;
  }
  dispose() {
    this.overlay?.remove();
    this.toggle?.remove();
    this.overlay = null;
    this.toggle = null;
  }
};

// src/media/hls-activity.ts
function watchHlsActivity(view, hls, sink) {
  let loadingFragment;
  let loadedBytes = 0;
  const timer = view.setInterval(() => {
    try {
      const fragment = hls.inFlightFragments?.main?.frag;
      if (fragment !== loadingFragment) {
        loadingFragment = fragment;
        loadedBytes = 0;
        if (fragment) sink.activity();
      }
      const currentBytes = Number(fragment?.stats?.loaded) || 0;
      if (currentBytes > loadedBytes) {
        loadedBytes = currentBytes;
        sink.activity();
      }
    } catch {
    }
  }, 1e3);
  return () => view.clearInterval(timer);
}

// src/media/hls-fragment-bytes.ts
function toBytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
function boxType(bytes) {
  return String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
}
function sameBytes(left, right) {
  return Boolean(left && right && left.byteLength === right.byteLength && left.every((value, index) => value === right[index]));
}

// src/media/hls-download.ts
var FULL_SEGMENT_METHODS = /* @__PURE__ */ new Set(["AES-128", "AES-256", "AES-256-CTR"]);
var MFHD_SEQUENCE_OFFSET = 20;
async function downloadHls(options) {
  const { Hls, document: document2, sink, url, customConfig, debug, signal, log } = options;
  const view = document2.defaultView;
  if (!view) throw new Error("Reader document has no active window");
  const hls = new Hls(buildHlsDownloadConfig(customConfig, debug));
  const media = document2.createElement("video");
  media.hidden = true;
  media.muted = true;
  media.playsInline = true;
  document2.body.append(media);
  const abortListener = { remove: () => void 0 };
  const stopWatchingActivity = watchHlsActivity(view, hls, sink);
  try {
    await new Promise((resolve, reject) => {
      let fragments = null;
      let mapInitSegment = null;
      let mediaStarted = false;
      let active = null;
      let next = 0;
      let settled = false;
      let mode = null;
      let fmp4Init = null;
      let pendingPayload = null;
      let moofSequence = 0;
      let sinkQueue = Promise.resolve();
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const abort = () => fail(new DOMException("The operation was aborted", "AbortError"));
      if (signal?.aborted) {
        abort();
        return;
      }
      if (signal) {
        signal.addEventListener("abort", abort, { once: true });
        abortListener.remove = () => signal.removeEventListener("abort", abort);
      }
      const enqueue = (task) => {
        sinkQueue = sinkQueue.then(() => settled ? void 0 : task()).catch(fail);
      };
      const ready = (container) => enqueue(() => sink.ready(container));
      const write = (bytes) => enqueue(() => sink.put(bytes));
      const sameFragment = (left, right) => left === right || Boolean(left && right && left.level === right.level && left.sn === right.sn);
      const activeFor = (data) => active && sameFragment(data.frag, active.fragment) ? active : null;
      const advance = (capture) => {
        if (!capture || settled || capture !== active || !capture.buffered || !capture.written || capture.advancing) return;
        capture.advancing = true;
        void (async () => {
          await sinkQueue;
          if (settled || !fragments) return;
          next += 1;
          sink.progress(next, fragments.length);
          if (next === fragments.length) {
            await sink.commit();
            settled = true;
            resolve();
            return;
          }
          active = null;
          hls.resumeBuffering();
          media.currentTime = fragments[next]?.start ?? 0;
        })().catch(fail);
      };
      const writePlaintext = (payload) => {
        if (next === 0 && mapInitSegment) {
          if (!mapInitSegment.data) {
            fail(new Error("HLS init segment is unavailable"));
            return;
          }
          write(toBytes(mapInitSegment.data).slice());
        }
        write(payload);
        if (active) {
          active.written = true;
          advance(active);
        }
      };
      const on = (event, handler2) => hls.on(event, (_name, data) => {
        if (settled) return;
        try {
          handler2(data);
        } catch (error) {
          fail(error);
        }
      });
      const acceptPayload = (data) => {
        const fragment = data.frag;
        if (!fragment || fragment.type !== "main" || !data.payload || fragment.sn === "initSegment") return;
        if ((fragment.initSegment || null) !== mapInitSegment) {
          fail(new Error("HLS init segment changes cannot be downloaded"));
          return;
        }
        if (active || !sameFragment(fragment, fragments?.[next])) return;
        active = { fragment, buffered: false, written: false, advancing: false, chunks: 0 };
        hls.pauseBuffering();
        if (mode === "fmp4") return;
        const payload = toBytes(data.payload).slice();
        if (mode) writePlaintext(payload);
        else pendingPayload = payload;
      };
      const events = Hls.Events;
      on(events.FRAG_PARSING_INIT_SEGMENT, (data) => {
        const combined = data.tracks?.video?.tsundokuInitSegment;
        if (mode === "fmp4") {
          if (!sameBytes(combined, fmp4Init)) fail(new Error("HLS track configuration changed mid-stream"));
          return;
        }
        if (mode) return;
        if (combined) {
          mode = "fmp4";
          fmp4Init = combined.slice();
          pendingPayload = null;
          ready("mp4");
          write(fmp4Init);
          return;
        }
        log("HLS remuxer output is not usable as a file, keeping TS");
        mode = "plaintext";
        ready("ts");
        const payload = pendingPayload;
        pendingPayload = null;
        if (payload) writePlaintext(payload);
      });
      on(events.BUFFER_APPENDING, (data) => {
        if (mode !== "fmp4") return;
        const capture = activeFor(data);
        const bytes = data.data;
        if (!capture || !bytes || bytes.byteLength < MFHD_SEQUENCE_OFFSET + 4 || boxType(bytes) !== "moof") return;
        const chunk = bytes.slice();
        new DataView(chunk.buffer).setUint32(MFHD_SEQUENCE_OFFSET, ++moofSequence);
        write(chunk);
        capture.chunks += 1;
      });
      on(events.FRAG_PARSED, (data) => {
        const capture = mode === "fmp4" ? activeFor(data) : null;
        if (!capture || !capture.chunks) return;
        capture.written = true;
        advance(capture);
      });
      on(events.ERROR, (data) => {
        const detail = typeof data.details === "string" ? data.details : data.type;
        if (!data.fatal && detail !== "fragDecryptError") return;
        const status = data.response?.code ? ` (${data.response.code})` : "";
        fail(new Error(`HLS load failed: ${detail || "unknown"}${status}`));
      });
      on(events.FRAG_DECRYPTED, acceptPayload);
      on(events.FRAG_BUFFERED, (data) => {
        const capture = activeFor(data);
        if (!capture) return;
        capture.buffered = true;
        advance(capture);
      });
      on(events.MEDIA_ATTACHED, () => {
        if (mediaStarted || !fragments) return;
        mediaStarted = true;
        hls.startLoad(fragments[0]?.start);
      });
      on(events.MANIFEST_PARSED, (data) => {
        if (data.audioTracks?.some((track) => track.url)) fail(new Error("HLS with separate audio tracks cannot be downloaded"));
      });
      on(events.LEVEL_LOADED, (data) => {
        if (fragments) return;
        hls.stopLoad();
        const level = typeof data.details === "object" ? data.details : void 0;
        if (level?.live) {
          fail(new Error("Live HLS cannot be downloaded as a complete video"));
          return;
        }
        fragments = (level?.fragments || []).filter((fragment) => !fragment.gap);
        const selectedFragments = fragments;
        if (selectedFragments.length === 0) {
          fail(new Error("HLS playlist has no segments"));
          return;
        }
        const unsupported = selectedFragments.find((fragment) => {
          const method = fragment.decryptdata?.method;
          return method && method !== "NONE" && !FULL_SEGMENT_METHODS.has(method);
        });
        if (unsupported) {
          fail(new Error(`HLS encryption method ${unsupported.decryptdata?.method} cannot be downloaded without transcoding`));
          return;
        }
        mapInitSegment = selectedFragments[0]?.initSegment || null;
        if (typeof data.level === "number" && Number.isInteger(data.level)) hls.loadLevel = data.level;
        if (mapInitSegment) {
          mode = "plaintext";
          ready("mp4");
        } else if (selectedFragments.some((fragment) => fragment.cc !== selectedFragments[0]?.cc)) {
          log("HLS playlist has discontinuities, keeping TS");
          mode = "plaintext";
          ready("ts");
        }
        hls.attachMedia(media);
      });
      try {
        hls.loadSource(String(url));
        hls.startLoad();
      } catch (error) {
        fail(new Error(`HLS loadSource failed: ${errorMessage(error)}`));
      }
    });
  } finally {
    abortListener.remove();
    stopWatchingActivity();
    try {
      hls.destroy();
    } catch {
    }
    media.remove();
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/media/download-sink.ts
var DownloadSink = class {
  endpoint;
  host;
  signal;
  constructor(host, endpoint, signal) {
    this.host = host;
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.signal = signal;
  }
  start(task, errorCode = "plugin") {
    return task().catch(async (error) => {
      const message = errorMessage2(error);
      this.host.emit("media.download.error", { code: errorCode, message });
      await this.delete().catch(() => void 0);
    });
  }
  async request(route, init, label, useSignal = true) {
    let response;
    try {
      response = await this.host.fetchNative(`${this.endpoint}${route}`, {
        ...init,
        ...useSignal && this.signal ? { signal: this.signal } : {}
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new Error(`Download sink ${route} unreachable: ${errorMessage2(error)}`);
    }
    if (label && !response.ok) throw new Error(`Download sink rejected ${label}: ${response.status}`);
    return response;
  }
  async delete() {
    await this.request("/sink", { method: "DELETE" }, void 0, false);
  }
  async ready(container) {
    await this.request(`/sink?container=${encodeURIComponent(container)}`, { method: "POST" }, "ready");
    this.host.emit("media.download.ready", { container });
  }
  async put(bytes) {
    if (bytes.byteLength === 0) return;
    await this.request("/sink", { method: "PUT", body: bytes.slice().buffer }, "chunk");
  }
  async commit() {
    await this.request("/sink", { method: "POST" }, "commit");
    this.host.emit("media.download.complete", {});
  }
  progress(current, total) {
    this.host.emit("media.download.progress", { current, total });
  }
  activity() {
    this.host.emit("media.download.activity", {});
  }
};
async function writeResponseToSink(response, sink, totalBytes, signal) {
  let received = 0;
  let lastPercent = -1;
  const advance = (length) => {
    received += length;
    if (totalBytes <= 0) return;
    const percent = Math.min(100, Math.floor(received * 100 / totalBytes));
    if (percent !== lastPercent) {
      lastPercent = percent;
      sink.progress(percent, 100);
    }
  };
  if (response.body) {
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    for (; ; ) {
      try {
        if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
        const result = await reader.read();
        if (result.done) break;
        await sink.put(result.value);
        advance(result.value.byteLength);
      } catch (error) {
        await reader.cancel().catch(() => void 0);
        signal?.removeEventListener("abort", cancel);
        throw error;
      }
    }
    signal?.removeEventListener("abort", cancel);
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());
    await sink.put(bytes);
    advance(bytes.byteLength);
  }
  if (received === 0) throw new Error("Video stream was empty");
  await sink.commit();
  return received;
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/media/download.ts
var MIME_CONTAINERS = {
  "video/mp4": "mp4",
  "video/x-matroska": "mkv",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/mp2t": "ts"
};
var VIDEO_EXTENSIONS = /* @__PURE__ */ new Set(["mp4", "m4v", "mkv", "webm", "mov", "avi", "ts"]);
var VideoDownloader = class {
  host;
  document;
  directive;
  endpoint;
  log;
  abortController = new AbortController();
  download = null;
  constructor(host, directive, endpoint, log) {
    this.host = host;
    this.document = host.root.ownerDocument;
    this.directive = directive;
    this.endpoint = endpoint;
    this.log = log;
  }
  start(type, url, hlsConfig = {}) {
    if (this.download) return this.download;
    const sink = new DownloadSink(this.host, this.endpoint, this.abortController.signal);
    const task = type === "m3u8" ? this.downloadHls(sink, url, hlsConfig) : this.downloadDirect(sink, url);
    this.download = sink.start(() => task);
    return this.download;
  }
  cancel() {
    this.abortController.abort();
  }
  async downloadDirect(sink, url) {
    const response = await this.sourceFetch(url);
    if (!response.ok) throw new Error(`Video fetch failed: ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || response.headers.get("x-tsundoku-upstream-length"));
    const total = Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : 0;
    await sink.ready(videoContainer(url, response.headers.get("content-type"), this.document.baseURI));
    await writeResponseToSink(response, sink, total, this.abortController.signal);
  }
  async downloadHls(sink, url, config) {
    const view = this.document.defaultView;
    const Hls = view?.Hls;
    if (!Hls) throw new Error("hls.js is unavailable");
    await downloadHls({
      Hls,
      document: this.document,
      sink,
      url,
      customConfig: config,
      debug: Boolean(this.directive.debug),
      signal: this.abortController.signal,
      log: this.log
    });
  }
  sourceFetch(url) {
    const local = /^(blob:|data:|filesystem:)/i.test(url);
    const fetch = local ? this.host.fetchNative.bind(this.host) : this.host.fetch.bind(this.host);
    return fetch(url, { ...local ? {} : { headers: { Referer: this.document.baseURI } }, signal: this.abortController.signal });
  }
};
function videoContainer(url, contentType, baseURI) {
  const pathname = new URL(String(url), baseURI).pathname;
  const extension = pathname.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() || "";
  if (VIDEO_EXTENSIONS.has(extension)) return extension;
  const mime = String(contentType || "").split(";", 1)[0]?.toLowerCase() || "";
  return MIME_CONTAINERS[mime] || "mp4";
}

// src/media/errors.ts
async function reportPlayerFailure(options, message, code = "plugin") {
  if (options.mode === "playback") {
    options.emit("reader.error", { message });
    return;
  }
  if (!options.downloadEndpoint) {
    options.emit("media.download.error", { code, message });
    return;
  }
  const sink = new DownloadSink(options, options.downloadEndpoint);
  await sink.start(async () => {
    throw new Error(message);
  }, code);
}

// src/media/progress.ts
var VIDEO_FRACTION_KEY = "__tsundoku_video_fraction";
function readFractions(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(VIDEO_FRACTION_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function writeFraction(storage, path, fraction) {
  if (!path) return;
  try {
    const fractions = readFractions(storage);
    if (fraction > 0) fractions[path] = Math.round(fraction * 1e4) / 1e4;
    else delete fractions[path];
    storage.setItem(VIDEO_FRACTION_KEY, JSON.stringify(fractions));
  } catch {
  }
}
function combineResumeProgress(progress, path, fractions) {
  if (!(progress > 0 && progress < 100)) return progress;
  const fraction = fractions[path];
  return progress + (fraction !== void 0 && fraction > 0 && fraction < 1 ? fraction : 0);
}
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

// src/media/player-timing.ts
var NEXT_UP_WINDOW_SECONDS = 120;
function updateNextUp(video, popup, dismissed) {
  if (!popup || dismissed || !(video.duration > NEXT_UP_WINDOW_SECONDS)) return;
  const remaining = video.duration - video.currentTime;
  if (remaining > NEXT_UP_WINDOW_SECONDS || remaining <= 0) {
    popup.hidden = true;
    return;
  }
  const count = popup.querySelector(".nekori-nextup__count");
  if (count) count.textContent = `${Math.ceil(remaining)}s`;
  popup.hidden = false;
}

// src/media/playback-progress.ts
var PlaybackProgress = class {
  host;
  directive;
  storage;
  onResume;
  onDismissed;
  log;
  removeListeners = [];
  hasSeekedInitial = false;
  lastSaveTime = 0;
  constructor(options) {
    this.host = options.host;
    this.directive = options.directive;
    this.storage = options.storage;
    this.onResume = options.onResume;
    this.onDismissed = options.onDismissed;
    this.log = options.log;
  }
  attach(video, popup, fail) {
    const path = this.directive.path;
    const disable = Boolean(this.directive.disableProgress);
    const save = (progress, fraction = 0) => {
      if (this.storage && path) writeFraction(this.storage, path, fraction);
      this.host.emit("reader.saveVideoProgress", { chapterId: this.host.chapter.id, path, progress });
    };
    if (disable) save(0);
    this.listen(video, "loadedmetadata", () => {
      this.log("Video loadedmetadata");
      if (!Number.isFinite(video.duration)) {
        save(0);
        return;
      }
      if (this.hasSeekedInitial || disable || !(video.duration > 0)) return;
      const progress = this.directive.progress;
      if (progress > 0 && progress < 100) {
        const restored = combineResumeProgress(progress, path, this.storage ? readFractions(this.storage) : {});
        this.onResume(video, restored / 100 * video.duration);
      }
      this.hasSeekedInitial = true;
    });
    this.listen(video, "timeupdate", () => updateNextUp(video, popup, this.onDismissed()));
    this.listen(video, "timeupdate", () => {
      if (disable || !Number.isFinite(video.duration) || !(video.duration > 0)) return;
      const currentTime = video.currentTime;
      if (Math.abs(currentTime - this.lastSaveTime) < 3) return;
      this.lastSaveTime = currentTime;
      const exact = currentTime / video.duration * 100;
      const progress = Math.floor(exact);
      save(progress, exact - progress);
    });
    this.listen(video, "ended", () => {
      this.log("Video ended");
      save(disable || !Number.isFinite(video.duration) ? 0 : 100);
      if (this.host.nextChapter ?? this.directive.nextChapter) this.host.emit("navigation.next", {});
    });
    this.listen(video, "error", () => {
      const mediaError = video.error;
      fail(`Video playback failed: ${mediaError?.message || "unknown error"}`);
    }, { once: true });
  }
  dispose() {
    for (const remove of this.removeListeners.splice(0)) remove();
  }
  listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.removeListeners.push(() => target.removeEventListener(type, listener, options));
  }
};

// inline-css:X:\src\nekori\app\tools\reader-runtime\src\styles\player.css
var player_default = `/* Video chapters use a centered 16:9 surface above the reader's reserved bottom bar. */
body {
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: safe center;
}

:root { --reader-margin-right: 0px; --reader-margin-left: 0px; }

body:has(#nekori-player-container),
#nekori-reader:has(#nekori-player-container) {
  margin-inline: 0;
  padding-inline: 0;
}

#nekori-reader:has(> .local-video-button) { margin: 0 16px; text-align: center; }
#nekori-reader:has(> .local-video-button) > h2,
#nekori-reader:has(> .local-video-button) > h4 { margin: 0; }
#nekori-reader:has(> .local-video-button) > h4 { margin-top: 8px; font-weight: 400; opacity: .72; }
#nekori-reader:has(> .local-video-button) > .local-video-button { margin-top: 24px; }

#nekori-player-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  background-color: #000;
  position: relative;
  overflow: hidden;
}

#nekori-player-container video-skin,
#nekori-player-container live-video-skin,
#nekori-player-container media-container,
#nekori-player-container video,
#nekori-player-container hlsjs-video,
#nekori-player-container dash-video {
  display: block;
  width: 100%;
  height: 100%;
}

#nekori-player-container video,
#nekori-player-container hlsjs-video,
#nekori-player-container dash-video { object-fit: contain; }

#nekori-player-container iframe { width: 100%; height: 100%; border: none; }

#nekori-debug-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  max-height: 75vh;
  background-color: rgba(0, 0, 0, .85) !important;
  color: #00ff00 !important;
  font: 12px / normal monospace !important;
  text-align: left !important;
  padding: 10px;
  box-sizing: border-box;
  overflow-y: auto;
  z-index: 9999;
  overscroll-behavior: contain;
  pointer-events: none;
  touch-action: pan-y;
  display: none;
}
#nekori-debug-overlay.active { display: block; pointer-events: auto; }
#nekori-debug-overlay .nekori-debug-msg {
  border-bottom: 1px solid rgba(255, 255, 255, .2);
  padding: 2px 0;
  color: inherit !important;
  font: inherit !important;
  text-align: left !important;
  word-wrap: break-word;
}

#nekori-debug-toggle {
  position: fixed;
  top: 50%;
  right: 20px;
  z-index: 10000;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--reader-text-color) 30%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--reader-background-color) 85%, var(--reader-text-color) 15%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  color: var(--reader-text-color);
  opacity: .7;
}
#nekori-debug-toggle svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
#nekori-debug-toggle[aria-expanded="true"] { opacity: 1; }

/* Reader-owned prompts stay in the player skin so they remain visible in fullscreen. */
.nekori-overlay, .nekori-nextup { position: absolute; z-index: 35; color: oklch(1 0 0); }
.nekori-overlay[hidden], .nekori-nextup[hidden] { display: none; }
.nekori-overlay { inset: 0; display: grid; place-content: center; padding: .75rem; background: oklch(0 0 0 / .6); overflow: auto; }
.nekori-overlay__card { position: relative; display: grid; gap: .5rem; justify-items: center; text-align: center; padding: .75rem; border-radius: 1rem; max-width: 32rem; }
.nekori-overlay__time { font-size: 1.75rem; font-variant-numeric: tabular-nums; }
.nekori-overlay__actions { display: flex; gap: .75rem; flex-wrap: wrap; justify-content: center; }
.nekori-nextup { left: var(--inset, .75rem); bottom: 5rem; width: max-content; max-width: calc(100% - 1.5rem); display: grid; gap: .25rem; padding: .75rem 1rem; border-radius: .75rem; }
.nekori-nextup__head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.nekori-nextup__label { font-size: .8rem; opacity: .8; }
.nekori-nextup__count { font-size: .8rem; opacity: .6; font-variant-numeric: tabular-nums; }
.nekori-action { width: auto; flex: none; padding: .5rem 1rem; white-space: nowrap; }
.nekori-action--primary { background: var(--media-primary, white); color: var(--media-primary-foreground, black); }
.nekori-nextup__dismiss { padding: .5rem; line-height: 1; font-size: 1.1rem; }
.nekori-nextup__actions { display: flex; gap: .5rem; align-items: center; }
`;

// src/media/player-controls.ts
function decoratePlayerSkin(skin, media, document2, host, config, callbacks) {
  const shadow = skin.shadowRoot;
  const container = shadow?.querySelector("media-container");
  const resume = elementFromMarkup(document2, `
    <div class="nekori-overlay" hidden>
      <div class="nekori-overlay__card media-popup-surface">
        <div class="nekori-overlay__title"></div><div class="nekori-overlay__question"></div>
        <div class="nekori-overlay__time"></div><div class="nekori-overlay__actions">
          <button type="button" class="media-button nekori-action nekori-action--primary" data-action="continue"></button>
          <button type="button" class="media-button nekori-action" data-action="restart"></button>
        </div>
      </div>
    </div>`);
  const nextChapter = host.nextChapter ?? config.nextChapter;
  const next = !nextChapter ? null : elementFromMarkup(document2, `
    <div class="nekori-nextup media-popup-surface" hidden>
      <div class="nekori-nextup__head"><span class="nekori-nextup__label"></span><span class="nekori-nextup__count"></span></div>
      <div class="nekori-nextup__name"></div><div class="nekori-nextup__actions">
        <button type="button" class="media-button nekori-action nekori-action--primary" data-action="next"></button>
        <button type="button" class="media-button nekori-action nekori-nextup__dismiss" data-action="dismiss">&times;</button>
      </div>
    </div>`);
  if (!shadow || !container) return { resume: null, next: null };
  const strings = host.strings ?? {};
  installControlStyles(shadow, document2);
  setText(resume, ".nekori-overlay__title", strings.videoResumeTitle);
  setText(resume, ".nekori-overlay__question", strings.videoResumeQuestion);
  setText(resume, '[data-action="continue"]', strings.videoResumeContinue);
  setText(resume, '[data-action="restart"]', strings.videoResumeRestart);
  if (next && nextChapter) {
    setText(next, '[data-action="next"]', strings.videoNextPlay);
    setText(next, ".nekori-nextup__label", strings.videoNextUp);
    setText(next, ".nekori-nextup__name", nextChapter.name);
    const dismiss = required(next.querySelector('[data-action="dismiss"]'));
    if (strings.close) dismiss.setAttribute("aria-label", strings.close);
    required(next.querySelector('[data-action="next"]')).addEventListener("click", callbacks.onNext);
    dismiss.addEventListener("click", callbacks.onDismissNext);
  }
  const seek = document2.createElement("button");
  seek.type = "button";
  seek.className = "media-button nekori-action nekori-skip-intro";
  if (strings.videoSkipIntro) {
    seek.setAttribute("aria-label", strings.videoSkipIntro);
    seek.title = strings.videoSkipIntro;
  }
  seek.innerHTML = '<svg viewBox="0 0 24 24" class="media-button-icon" aria-hidden="true" fill="currentColor"><path d="M18.87 13c-.5 0-.91.37-.98.86-.48 3.37-3.77 5.84-7.42 4.96-2.25-.54-3.91-2.27-4.39-4.53C5.27 10.42 8.22 7 11.95 7v2.79c0 .45.54.67.85.35l3.79-3.79c.2-.2.2-.51 0-.71L12.8 1.85c-.31-.31-.85-.09-.85.35V5c-4.94 0-8.84 4.48-7.84 9.6.6 3.11 2.9 5.5 5.99 6.19 4.83 1.08 9.15-2.2 9.77-6.67.09-.59-.4-1.12-1-1.12z"></path><text x="12" y="16.6" text-anchor="middle" font-size="8" font-weight="600" fill="currentColor" stroke="none">85</text></svg>';
  seek.addEventListener("click", () => {
    const target = media.currentTime + 85;
    media.currentTime = Number.isFinite(media.duration) ? Math.min(target, media.duration) : target;
  });
  (shadow.querySelector(".video-controls-secondary") || shadow.querySelector(".video-controls-primary"))?.prepend(seek);
  container.append(resume);
  if (next) container.append(next);
  return { resume, next };
}
function stripUnsupportedControls(skin) {
  const shadow = skin.shadowRoot;
  if (!shadow) throw new Error(`${skin.localName} shadow root is unavailable`);
  shadow.querySelectorAll("media-cast-button, media-airplay-button, media-pip-button").forEach((control) => {
    shadow.querySelectorAll("media-tooltip[trigger]").forEach((tooltip) => {
      if (tooltip.getAttribute("trigger") === control.id) tooltip.remove();
    });
  });
  shadow.querySelectorAll(
    'media-cast-button, media-airplay-button, media-pip-button, #cast-tooltip, #airplay-tooltip, #pip-tooltip, media-hotkey[action="togglePictureInPicture"], media-icon[name="pip-enter"], media-icon[name="pip-exit"]'
  ).forEach((element) => element.remove());
  shadow.querySelectorAll("media-status-indicator[actions]").forEach((element) => {
    const actions = (element.getAttribute("actions") || "").split(/[\s,]+/).filter((action) => action && action !== "togglePictureInPicture");
    element.setAttribute("actions", actions.join(","));
  });
  const mediaContainer = shadow.querySelector("media-container");
  mediaContainer?.setAttribute("style", `${mediaContainer.getAttribute("style") || ""};--media-border-radius:0;--media-video-border-radius:0`);
}
function installControlStyles(shadow, document2) {
  const style = document2.createElement("style");
  style.textContent = player_default;
  shadow.prepend(style);
}
function elementFromMarkup(document2, markup) {
  const template = document2.createElement("template");
  template.innerHTML = markup;
  const element = template.content.firstElementChild;
  if (!element) throw new Error("Player control template is empty");
  return element;
}
function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = value || "";
}
function required(value) {
  if (!value) throw new Error("Player control markup is incomplete");
  return value;
}

// src/media/player-elements.ts
var PLAYER_TAGS = {
  live: { player: "live-video-player", skin: "live-video-skin" },
  vod: { player: "video-player", skin: "video-skin" }
};
var ELEMENT_DEFINE_TIMEOUT_MS = 1e4;
async function awaitPlayerElements(registry, tags, timeoutMs = ELEMENT_DEFINE_TIMEOUT_MS) {
  const pending = tags.filter((tag2) => tag2 !== "video" && !registry.get(tag2));
  if (pending.length === 0) return;
  let timeout;
  try {
    await Promise.race([
      Promise.all(pending.map((tag2) => registry.whenDefined(tag2))),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`custom element ${pending.join(", ")} is unavailable`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
}

// src/media/player-dom.ts
var PlayerDomFactory = class {
  document;
  host;
  config;
  callbacks;
  constructor(host, config, callbacks) {
    this.document = host.root.ownerDocument;
    this.host = host;
    this.config = config;
    this.callbacks = callbacks;
  }
  createContainer() {
    const container = this.document.createElement("div");
    container.id = "nekori-player-container";
    return container;
  }
  async build(mediaTag, live) {
    const view = this.document.defaultView;
    if (!view) throw new Error("Reader document has no active window");
    const tags = live ? PLAYER_TAGS.live : PLAYER_TAGS.vod;
    await awaitPlayerElements(view.customElements, [tags.player, tags.skin, "media-i18n", mediaTag]);
    const media = this.document.createElement(mediaTag);
    media.setAttribute("playsinline", "");
    media.setAttribute("preload", "auto");
    const thumbnailsVtt = this.config.thumbnailsVtt;
    if (mediaTag !== "video" || thumbnailsVtt) media.setAttribute("crossorigin", "anonymous");
    if (thumbnailsVtt) {
      const track = this.document.createElement("track");
      track.kind = "metadata";
      track.label = "thumbnails";
      track.src = thumbnailsVtt;
      track.default = true;
      media.append(track);
    }
    const skin = this.document.createElement(tags.skin);
    stripUnsupportedControls(skin);
    const controls = decoratePlayerSkin(skin, media, this.document, this.host, this.config, this.callbacks);
    skin.append(media);
    if (this.config.poster) {
      const image = this.document.createElement("img");
      image.slot = "poster";
      image.src = this.config.poster;
      image.alt = "";
      skin.append(image);
    }
    const player = this.document.createElement(tags.player);
    player.append(skin);
    const root = this.document.createElement("media-i18n");
    root.append(player);
    return { resumeOverlay: controls.resume, nextUpPopup: controls.next, root, media, skin };
  }
};

// src/media/resume-prompt.ts
var ResumePrompt = class {
  awaiting = false;
  answer = null;
  onPlay;
  constructor(onPlay) {
    this.onPlay = onPlay;
  }
  tryPlay(video, log) {
    if (this.awaiting) return;
    void video.play().catch((error) => log(`Auto-play prevented: ${errorMessage3(error)}`));
  }
  cancel() {
    this.answer?.();
    this.answer = null;
    this.awaiting = false;
  }
  offer(video, overlay, seconds) {
    if (!overlay) {
      video.currentTime = seconds;
      return;
    }
    const time = overlay.querySelector(".nekori-overlay__time");
    if (time) time.textContent = formatClock(seconds);
    overlay.hidden = false;
    this.awaiting = true;
    const answer = (resume) => {
      this.answer = null;
      overlay.hidden = true;
      this.awaiting = false;
      if (resume) video.currentTime = seconds;
      this.onPlay(video);
    };
    this.answer = () => {
      overlay.hidden = true;
      overlay.querySelector('[data-action="continue"]')?.removeEventListener("click", continueAnswer);
      overlay.querySelector('[data-action="restart"]')?.removeEventListener("click", restartAnswer);
    };
    const continueAnswer = () => answer(true);
    const restartAnswer = () => answer(false);
    overlay.querySelector('[data-action="continue"]')?.addEventListener("click", continueAnswer, { once: true });
    overlay.querySelector('[data-action="restart"]')?.addEventListener("click", restartAnswer, { once: true });
  }
};
function errorMessage3(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/media/subtitles.ts
function toWebVtt(text) {
  const body = text.trimStart();
  return body.startsWith("WEBVTT") ? body : `WEBVTT

${body.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2")}`;
}
var SubtitleManager = class {
  prepared = [];
  objectUrls = /* @__PURE__ */ new Set();
  host;
  document;
  log;
  abortController = new AbortController();
  disposed = false;
  constructor(host, document2, log) {
    this.host = host;
    this.document = document2;
    this.log = log;
  }
  async add(tracks, media) {
    if (this.disposed) return;
    for (const track of Array.isArray(tracks) ? tracks : [tracks]) {
      const label = track.label || "Subtitles";
      try {
        let text = track.content;
        if (!text) {
          if (!track.url) throw new Error("Subtitle URL is missing");
          const response = await this.host.fetch(track.url, {
            headers: { Referer: this.document.baseURI },
            signal: this.abortController.signal
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          text = await response.text();
        }
        if (this.disposed) return;
        const src = URL.createObjectURL(new Blob([toWebVtt(text)], { type: "text/vtt" }));
        const prepared = { label, lang: track.lang || "", src, default: Boolean(track.default) };
        this.prepared.push(prepared);
        this.objectUrls.add(src);
        if (media) this.append(media, prepared);
        this.log(`Subtitle added: ${label}`);
      } catch (error) {
        this.log(`Subtitle "${label}" failed: ${errorMessage4(error)}`);
      }
    }
  }
  attach(media) {
    for (const subtitle of this.prepared) this.append(media, subtitle);
  }
  dispose() {
    this.disposed = true;
    this.abortController.abort();
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.prepared.length = 0;
  }
  append(media, subtitle) {
    const element = this.document.createElement("track");
    element.kind = "subtitles";
    element.label = subtitle.label;
    element.srclang = subtitle.lang;
    element.src = subtitle.src;
    media.append(element);
    if (subtitle.default && element.track) element.track.mode = "showing";
  }
};
function errorMessage4(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/media/player-controller.ts
var PlayerController = class {
  host;
  config;
  document;
  view;
  domFactory;
  subtitles;
  debugOverlay;
  resumePrompt;
  downloader;
  playbackAbort = new AbortController();
  progressStorage;
  container = null;
  playerElement = null;
  videoElement = null;
  iframeElement = null;
  resumeOverlay = null;
  nextUpPopup = null;
  hlsInstance = null;
  dashInstance = null;
  progress = null;
  nextUpDismissed = false;
  debugEnabled;
  disposed = false;
  constructor(host, config) {
    this.host = host;
    this.config = config;
    this.document = host.root.ownerDocument;
    const view = this.document.defaultView;
    if (!view) throw new Error("Reader document has no active window");
    this.view = view;
    this.debugEnabled = Boolean(config.video.debug);
    this.debugOverlay = new PlayerDebugOverlay(this.document, () => this.toggleDebug());
    this.resumePrompt = new ResumePrompt((video) => this.tryPlay(video));
    this.domFactory = new PlayerDomFactory(host, config.video, {
      onNext: () => this.host.emit("navigation.next", {}),
      onDismissNext: () => {
        this.nextUpDismissed = true;
        if (this.nextUpPopup) this.nextUpPopup.hidden = true;
      }
    });
    this.subtitles = new SubtitleManager(host, this.document, (message) => this.log(message));
    this.progressStorage = this.getStorage();
    this.downloader = config.mode === "download" && config.downloadEndpoint ? new VideoDownloader(host, config.video, config.downloadEndpoint, (message) => this.log(message)) : null;
    if (config.mode === "playback" && config.video.type !== void 0) this.initializePlaybackDom();
    if (config.video.subtitles?.length) void this.subtitles.add(config.video.subtitles);
  }
  async playDirect(url) {
    if (this.disposed) return;
    if (this.config.mode === "download") return this.downloadRequired("video-file", url);
    const video = await this.mountVideo("video");
    if (!video) return;
    video.src = url;
    this.tryPlay(video);
  }
  async playHls(url, customConfig = {}) {
    if (this.disposed) return;
    if (this.config.mode === "download") return this.downloadRequired("m3u8", url, customConfig);
    return this.playAdaptive("HLS", "hlsjs-video", url, (video) => {
      const Hls = this.view.Hls;
      if (!Hls || !Hls.isSupported()) throw new Error("hls.js is unavailable");
      video.source = buildHlsSource(url, { debug: this.debugEnabled, ...customConfig });
      this.hlsInstance = video.engine || null;
    });
  }
  async playDash(url, dashConfig = {}) {
    if (this.disposed) return;
    if (this.config.mode === "download") return this.fail("DASH and DRM video downloads are not supported");
    return this.playAdaptive("DASH", "dash-video", url, async (video) => {
      const engine = video.engine;
      if (!engine) throw new Error("dash.js engine is unavailable");
      const { settings, protectionData } = buildDashSource(dashConfig.settings, dashConfig.protectionData);
      if (protectionData && Object.keys(protectionData).length > 0) {
        const granted = await this.host.request("media.requestProtectedPlayback", {});
        if (this.disposed) return;
        if (granted !== true) {
          throw new Error("DRM video needs the device media identifier, which is not shared while incognito is on");
        }
        if (!engine.setProtectionData) throw new Error("dash.js cannot configure protected playback");
        engine.setProtectionData(protectionData);
      }
      if (settings) video.source = { engine: { dashJs: settings } };
      this.dashInstance = engine;
      engine.on?.(engine.events?.ERROR || "error", (event) => {
        const detail = event.error?.message || event.event?.message || event.message || "unknown error";
        this.fail(`DASH playback failed: ${detail}`);
      });
    });
  }
  async playIframe(url) {
    if (this.disposed) return;
    if (this.config.mode === "download") {
      const message = "Iframe video downloads are not supported";
      return this.fail(message, "iframe");
    }
    let iframeUrl;
    try {
      iframeUrl = new URL(String(url), this.document.baseURI);
    } catch {
      return this.fail(`Invalid iframe URL: ${url}`);
    }
    if (iframeUrl.protocol !== "http:" && iframeUrl.protocol !== "https:") {
      return this.fail(`Unsupported iframe protocol: ${iframeUrl.protocol}`);
    }
    this.destroyCurrentMedia();
    const iframe = this.document.createElement("iframe");
    this.initializePlaybackDom();
    iframe.src = iframeUrl.href;
    iframe.sandbox.add("allow-scripts", "allow-same-origin", "allow-presentation");
    iframe.allowFullscreen = true;
    iframe.onload = () => this.log("Iframe loaded");
    iframe.onerror = () => {
      void this.fail("Iframe failed to load", "iframe");
    };
    this.container?.append(iframe);
    this.iframeElement = iframe;
  }
  setDebug(enabled) {
    this.debugEnabled = enabled;
    this.debugOverlay.set(enabled);
  }
  toggleDebug() {
    this.setDebug(!this.debugEnabled);
  }
  addSubtitles(tracks) {
    return this.subtitles.add(tracks, this.videoElement);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.playbackAbort.abort();
    this.downloader?.cancel();
    this.progress?.dispose();
    this.subtitles.dispose();
    this.destroyCurrentMedia();
    this.container?.remove();
    this.container = null;
    this.debugOverlay.dispose();
  }
  initializePlaybackDom() {
    if (this.container) return;
    this.container = this.domFactory.createContainer();
    this.host.root.prepend(this.container);
    this.debugOverlay.attach(this.debugEnabled);
  }
  fail(message, code = "plugin") {
    if (this.disposed) return Promise.resolve();
    this.log(message);
    return reportPlayerFailure({
      mode: this.config.mode,
      ...this.config.downloadEndpoint ? { downloadEndpoint: this.config.downloadEndpoint } : {},
      emit: (name, payload) => this.host.emit(name, payload),
      fetchNative: (input, init) => this.host.fetchNative(input, init)
    }, message, code);
  }
  async downloadRequired(type, url, config) {
    if (!this.downloader) return this.fail("Video download sink is unavailable");
    await this.downloader.start(type, url, config);
  }
  log(message) {
    if (this.disposed) return;
    console.log("[NekoriPlayer]", message);
    if (!this.debugEnabled) return;
    this.debugOverlay.attach(true);
    this.debugOverlay.log(message);
  }
  destroyCurrentMedia() {
    this.resumePrompt.cancel();
    this.dashInstance?.attachSource?.(null);
    this.hlsInstance = null;
    this.dashInstance = null;
    this.progress?.dispose();
    this.progress = null;
    this.playerElement?.remove();
    this.playerElement = null;
    this.videoElement = null;
    this.iframeElement?.remove();
    this.iframeElement = null;
    this.resumeOverlay = null;
    this.nextUpPopup = null;
    this.nextUpDismissed = false;
  }
  async mountVideo(mediaTag) {
    this.initializePlaybackDom();
    this.destroyCurrentMedia();
    try {
      const dom = await this.domFactory.build(mediaTag, Boolean(this.config.video.disableProgress));
      if (this.disposed) return null;
      this.playerElement = dom.root;
      this.videoElement = dom.media;
      this.resumeOverlay = dom.resumeOverlay;
      this.nextUpPopup = dom.nextUpPopup;
      this.container?.prepend(dom.root);
      this.progress = new PlaybackProgress({
        host: this.host,
        directive: this.config.video,
        storage: this.progressStorage,
        onResume: (video, seconds) => this.resumePrompt.offer(video, this.resumeOverlay, seconds),
        onDismissed: () => this.nextUpDismissed,
        log: (message) => this.log(message)
      });
      this.progress.attach(dom.media, dom.nextUpPopup, (message) => {
        void this.fail(message);
      });
      this.subtitles.attach(dom.media);
      return dom.media;
    } catch (error) {
      if (this.disposed) return null;
      await this.fail(`Video player initialization failed: ${errorMessage5(error)}`);
      return null;
    }
  }
  async playAdaptive(kind, mediaTag, url, configure) {
    const video = await this.mountVideo(mediaTag);
    if (!video) return;
    try {
      await configure(video);
      if (this.disposed) return;
      video.src = String(url);
      video.addEventListener("loadedmetadata", () => this.tryPlay(video), { once: true, signal: this.playbackAbort.signal });
    } catch (error) {
      if (this.disposed) return;
      await this.fail(`${kind} playback failed: ${errorMessage5(error)}`);
    }
  }
  tryPlay(video) {
    this.resumePrompt.tryPlay(video, (message) => this.log(message));
  }
  getStorage() {
    try {
      return this.view.localStorage;
    } catch {
      return null;
    }
  }
};
function createPlayer(host, config) {
  return new PlayerController(host, config);
}
function errorMessage5(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/document/anchors.ts
function findChapterAnchor(chapter, name) {
  for (const element of chapter.querySelectorAll("[id],a[name]")) {
    if (element.id === name || element.getAttribute("name") === name) return element;
  }
  return null;
}
function installScopedAnchors(root, getLayout) {
  const onClick = (rawEvent) => {
    const event = rawEvent;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    const targetElement = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    const link = targetElement?.closest('a[href^="#"]');
    if (!link || !root.contains(link)) return;
    const layout = getLayout();
    const paged = layout?.enabled ?? false;
    const chapter = link.closest(CHAPTER_TAG_NAME) ?? (paged ? root : null);
    if (!chapter) return;
    let fragment = link.getAttribute("href")?.slice(1) ?? "";
    if (!fragment && !paged) return;
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
    }
    event.preventDefault();
    const destination = fragment ? findChapterAnchor(chapter, fragment) : chapter;
    if (!destination) return;
    if (paged && layout) layout.revealElement(destination);
    else destination.scrollIntoView({ behavior: "auto", block: "start" });
  };
  root.addEventListener("click", onClick, true);
  return () => root.removeEventListener("click", onClick, true);
}

// src/interactions/editing.ts
var EDITABLE_ATTR = "data-nekori-editable";
function registerEditingCommands(host) {
  const document2 = host.root.ownerDocument;
  const snapshots = /* @__PURE__ */ new Map();
  let inputListener = null;
  const disable = () => {
    if (inputListener) document2.removeEventListener("input", inputListener);
    inputListener = null;
    host.root.querySelectorAll(`[${EDITABLE_ATTR}="1"]`).forEach((element) => {
      element.removeAttribute("contenteditable");
      element.removeAttribute(EDITABLE_ATTR);
      element.removeAttribute("tabindex");
    });
    document2.getElementById("nekori-edit-mode-style")?.remove();
  };
  const enter = () => {
    document2.designMode = "off";
    snapshots.clear();
    const chapters = Array.from(host.root.querySelectorAll(CHAPTER_TAG_NAME));
    for (const chapter of chapters) {
      const id = chapter.getAttribute(CHAPTER_ID_ATTR);
      if (id !== null) snapshots.set(id, chapter.innerHTML);
      chapter.setAttribute("contenteditable", "true");
      chapter.setAttribute(EDITABLE_ATTR, "1");
      chapter.setAttribute("tabindex", "0");
    }
    if (chapters.length === 0) {
      const fallback = document2.getElementById("nekori-reader");
      if (!fallback) return;
      snapshots.set(host.chapter.id, fallback.innerHTML);
      fallback.setAttribute("contenteditable", "true");
      fallback.setAttribute(EDITABLE_ATTR, "1");
      fallback.setAttribute("tabindex", "0");
    }
    installEditStyles(document2);
    if (!inputListener) {
      inputListener = () => host.emit("edit.changed", {});
      document2.addEventListener("input", inputListener);
    }
  };
  const saveAndExit = () => {
    const contents = Array.from(host.root.querySelectorAll(CHAPTER_TAG_NAME)).map((chapter) => ({
      id: chapter.getAttribute(CHAPTER_ID_ATTR) ?? "",
      content: chapter.innerHTML
    }));
    if (contents.length === 0) {
      const chapter = document2.getElementById("nekori-reader");
      if (chapter) contents.push({ id: host.chapter.id, content: chapter.innerHTML });
    }
    host.emit("edit.save", { content: JSON.stringify(contents) });
    disable();
    snapshots.clear();
  };
  const discard = () => {
    for (const [id, html] of snapshots) {
      const chapter = Array.from(host.root.querySelectorAll(CHAPTER_TAG_NAME)).find((item) => item.getAttribute(CHAPTER_ID_ATTR) === id);
      if (chapter) chapter.innerHTML = html;
      else if (id === host.chapter.id) {
        const fallback = document2.getElementById("nekori-reader");
        if (fallback) fallback.innerHTML = html;
      }
    }
    disable();
    snapshots.clear();
  };
  const remove = [
    host.onCommand("edit.enter", enter),
    host.onCommand("edit.exit", saveAndExit),
    host.onCommand("edit.discard", discard)
  ];
  return [() => {
    disable();
    snapshots.clear();
  }, ...remove];
}
function installEditStyles(document2) {
  if (document2.getElementById("nekori-edit-mode-style")) return;
  const style = document2.createElement("style");
  style.id = "nekori-edit-mode-style";
  style.textContent = 'nekori-chapter, #nekori-reader, [data-nekori-editable="1"] { -webkit-user-select:text!important; user-select:text!important; pointer-events:auto!important; -webkit-tap-highlight-color:transparent; outline:none; } body { padding-bottom:max(220px,38vh)!important; }';
  document2.head.append(style);
}

// src/interactions/selection.ts
var PARAGRAPH_SELECTOR = "p,li,blockquote,h1,h2,h3,h4,h5,h6,pre";
function registerSelectionCommands(host) {
  return [
    host.onCommand("selection.read", () => host.root.ownerDocument.getSelection()?.toString() ?? null),
    host.onCommand("selection.readAnchor", () => readSelectionAnchor(host)),
    host.onCommand("selection.clear", () => {
      host.root.ownerDocument.getSelection()?.removeAllRanges();
    }),
    host.onCommand("selection.blur", () => {
      host.root.ownerDocument.getSelection()?.removeAllRanges();
      const activeElement = host.root.ownerDocument.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
    })
  ];
}
function readSelectionAnchor(host) {
  const selection = host.root.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return null;
  const chapter = findChapter(host.root, host.chapter.id);
  if (!chapter) return { paragraphIndex: null, text: selection.toString() };
  const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement;
  const paragraph = anchorElement?.closest(PARAGRAPH_SELECTOR);
  const paragraphs = Array.from(chapter.querySelectorAll(PARAGRAPH_SELECTOR));
  const index = paragraph ? paragraphs.indexOf(paragraph) : -1;
  return { paragraphIndex: index < 0 ? null : index, text: selection.toString() };
}
function findChapter(root, chapterId) {
  for (const chapter of root.querySelectorAll(CHAPTER_TAG_NAME)) {
    if (chapter.getAttribute(CHAPTER_ID_ATTR) === chapterId) return chapter;
  }
  return null;
}

// src/interactions/vertical-scroll.ts
function registerVerticalScrollCommands(host) {
  const document2 = host.root.ownerDocument;
  const window = document2.defaultView;
  if (!window) throw new Error("Vertical scrolling requires an active document window");
  let autoFrame = 0;
  let lastFrame = 0;
  let pixelsPerSecond = 0;
  const maxScroll = () => Math.max(0, document2.documentElement.scrollHeight - window.innerHeight);
  const stopAutoScroll = () => {
    if (autoFrame) window.cancelAnimationFrame(autoFrame);
    autoFrame = 0;
    lastFrame = 0;
  };
  const tick = (time) => {
    if (lastFrame > 0) window.scrollBy({ top: pixelsPerSecond * (time - lastFrame) / 1e3, behavior: "auto" });
    lastFrame = time;
    if (autoFrame) autoFrame = window.requestAnimationFrame(tick);
  };
  const startAutoScroll = (payload) => {
    if (!isRecord(payload) || typeof payload.pxPerSecond !== "number" || !Number.isFinite(payload.pxPerSecond)) {
      throw new TypeError("Invalid automatic-scroll speed");
    }
    stopAutoScroll();
    pixelsPerSecond = Math.max(0, payload.pxPerSecond);
    lastFrame = 0;
    autoFrame = window.requestAnimationFrame(tick);
  };
  const commands = [
    host.onCommand("scroll.restoreVertical", (payload) => {
      if (!isRecord(payload) || typeof payload.progress !== "number" || typeof payload.token !== "number") {
        throw new TypeError("Invalid vertical scroll restore payload");
      }
      stopAutoScroll();
      window.scrollTo({ top: maxScroll() * clamp01(payload.progress), behavior: "instant" });
      window.requestAnimationFrame(() => host.emit("scroll.restoreComplete", { token: payload.token }));
    }),
    host.onCommand("scroll.byViewport", (payload) => {
      if (!isRecord(payload) || typeof payload.direction !== "number" || typeof payload.fraction !== "number") {
        throw new TypeError("Invalid viewport scroll payload");
      }
      stopAutoScroll();
      const behavior = payload.behavior === "smooth" ? "smooth" : "auto";
      window.scrollBy({ top: Math.sign(payload.direction) * window.innerHeight * Math.max(0, payload.fraction), behavior });
    }),
    host.onCommand("scroll.seekVertical", (payload) => {
      if (!isRecord(payload) || typeof payload.percent !== "number" || !Number.isFinite(payload.percent)) {
        throw new TypeError("Invalid vertical seek payload");
      }
      stopAutoScroll();
      window.scrollTo({ top: maxScroll() * Math.max(0, Math.min(100, payload.percent)) / 100, behavior: "instant" });
    }),
    host.onCommand("scroll.autoStart", startAutoScroll),
    host.onCommand("scroll.autoStop", stopAutoScroll),
    host.onCommand("scroll.autoStatus", () => autoFrame !== 0)
  ];
  return [...commands, stopAutoScroll];
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/widgets/snippets.ts
function executeSourceScript(code, document2) {
  if (code.length === 0) return;
  const script = document2.createElement("script");
  script.textContent = code;
  (document2.head ?? document2.documentElement).append(script);
}
function registerSnippetCommand(host) {
  return host.onCommand("snippet.run", (value) => {
    for (const snippet of readSnippets(value)) executeSnippet(host.root.ownerDocument, snippet);
  });
}
function readSnippets(value) {
  if (isRecord2(value) && typeof value.code === "string") {
    return [{ code: value.code, ...typeof value.name === "string" ? { name: value.name } : {} }];
  }
  if (isRecord2(value) && Array.isArray(value.snippets)) {
    return value.snippets.map((snippet) => {
      if (!isRecord2(snippet) || typeof snippet.code !== "string" || snippet.name !== void 0 && typeof snippet.name !== "string") {
        throw new TypeError("Invalid user snippet");
      }
      return { code: snippet.code, ...typeof snippet.name === "string" ? { name: snippet.name } : {} };
    });
  }
  throw new TypeError("Expected snippet code or snippet list");
}
function executeSnippet(document2, snippet) {
  const name = safeSourceName(snippet.name ?? "snippet");
  const script = document2.createElement("script");
  script.textContent = `${snippet.code}
//# sourceURL=nekori-snippet-${name}.js`;
  const parent = document2.head ?? document2.documentElement;
  parent.append(script);
  parent.removeChild(script);
}
function safeSourceName(value) {
  return value.replace(/[\r\n]/g, "").replace(/[^\w.-]/g, "-").slice(0, 80) || "snippet";
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// node_modules/vanjs-core/src/van.js
var protoOf = Object.getPrototypeOf;
var changedStates;
var derivedStates;
var curDeps;
var curNewDerives;
var alwaysConnectedDom = { isConnected: 1 };
var gcCycleInMs = 1e3;
var statesToGc;
var propSetterCache = {};
var objProto = protoOf(alwaysConnectedDom);
var funcProto = protoOf(protoOf);
var _undefined;
var addAndScheduleOnFirst = (set, s, f, waitMs) => (set ?? (waitMs ? setTimeout(f, waitMs) : queueMicrotask(f), /* @__PURE__ */ new Set())).add(s);
var runAndCaptureDeps = (f, deps, arg) => {
  let prevDeps = curDeps;
  curDeps = deps;
  try {
    return f(arg);
  } catch (e) {
    console.error(e);
    return arg;
  } finally {
    curDeps = prevDeps;
  }
};
var keepConnected = (l) => l.filter((b) => b._dom?.isConnected);
var addStatesToGc = (d) => statesToGc = addAndScheduleOnFirst(statesToGc, d, () => {
  for (let s of statesToGc)
    s._bindings = keepConnected(s._bindings), s._listeners = keepConnected(s._listeners);
  statesToGc = _undefined;
}, gcCycleInMs);
var stateProto = {
  get val() {
    curDeps?._getters?.add(this);
    return this.rawVal;
  },
  get oldVal() {
    curDeps?._getters?.add(this);
    return this._oldVal;
  },
  set val(v) {
    curDeps?._setters?.add(this);
    if (v !== this.rawVal) {
      this.rawVal = v;
      this._bindings.length + this._listeners.length ? (derivedStates?.add(this), changedStates = addAndScheduleOnFirst(changedStates, this, updateDoms)) : this._oldVal = v;
    }
  }
};
var state = (initVal) => ({
  __proto__: stateProto,
  rawVal: initVal,
  _oldVal: initVal,
  _bindings: [],
  _listeners: []
});
var bind = (f, dom) => {
  let deps = { _getters: /* @__PURE__ */ new Set(), _setters: /* @__PURE__ */ new Set() }, binding = { f }, prevNewDerives = curNewDerives;
  curNewDerives = [];
  let newDom = runAndCaptureDeps(f, deps, dom);
  newDom = (newDom ?? document).nodeType ? newDom : new Text(newDom);
  for (let d of deps._getters)
    deps._setters.has(d) || (addStatesToGc(d), d._bindings.push(binding));
  for (let l of curNewDerives) l._dom = newDom;
  curNewDerives = prevNewDerives;
  return binding._dom = newDom;
};
var derive = (f, s = state(), dom) => {
  let deps = { _getters: /* @__PURE__ */ new Set(), _setters: /* @__PURE__ */ new Set() }, listener = { f, s };
  listener._dom = dom ?? curNewDerives?.push(listener) ?? alwaysConnectedDom;
  s.val = runAndCaptureDeps(f, deps, s.rawVal);
  for (let d of deps._getters)
    deps._setters.has(d) || (addStatesToGc(d), d._listeners.push(listener));
  return s;
};
var add = (dom, ...children) => {
  for (let c of children.flat(Infinity)) {
    let protoOfC = protoOf(c ?? 0);
    let child = protoOfC === stateProto ? bind(() => c.val) : protoOfC === funcProto ? bind(c) : c;
    child != _undefined && dom.append(child);
  }
  return dom;
};
var tag = (ns, name, ...args) => {
  let [{ is, ...props }, ...children] = protoOf(args[0] ?? 0) === objProto ? args : [{}, ...args];
  let dom = ns ? document.createElementNS(ns, name, { is }) : document.createElement(name, { is });
  for (let [k, v] of Object.entries(props)) {
    let getPropDescriptor = (proto) => proto && (Object.getOwnPropertyDescriptor(proto, k) ?? getPropDescriptor(protoOf(proto)));
    let propSetter = !ns && !is && !name.includes("-") ? propSetterCache[name + "," + k] ??= getPropDescriptor(protoOf(dom))?.set ?? 0 : getPropDescriptor(protoOf(dom))?.set;
    let isEvent = k.startsWith("on");
    let setter = isEvent ? (v2, oldV) => {
      let event = k.slice(2);
      dom.removeEventListener(event, oldV);
      dom.addEventListener(event, v2);
    } : propSetter ? propSetter.bind(dom) : dom.setAttribute.bind(dom, k);
    let protoOfV = protoOf(v ?? 0);
    isEvent || protoOfV === funcProto && (v = derive(v), protoOfV = stateProto);
    protoOfV === stateProto ? bind(() => (setter(v.val, v._oldVal), dom)) : setter(v);
  }
  return add(dom, children);
};
var handler = (ns) => ({ get: (_, name) => tag.bind(_undefined, ns, name) });
var update = (dom, newDom) => newDom ? newDom !== dom && dom.replaceWith(newDom) : dom.remove();
var updateDoms = () => {
  let iterationsLeft = 100, derivedStatesArray = [...changedStates].filter((s) => s.rawVal !== s._oldVal);
  do {
    derivedStates = /* @__PURE__ */ new Set();
    for (let l of new Set(derivedStatesArray.flatMap((s) => s._listeners = keepConnected(s._listeners))))
      derive(l.f, l.s, l._dom), l._dom = _undefined;
  } while (--iterationsLeft && (derivedStatesArray = [...derivedStates]).length);
  let changedStatesArray = [...changedStates].filter((s) => s.rawVal !== s._oldVal);
  changedStates = _undefined;
  for (let b of new Set(changedStatesArray.flatMap((s) => s._bindings = keepConnected(s._bindings))))
    update(b._dom, bind(b.f, b._dom)), b._dom = _undefined;
  for (let s of changedStatesArray) s._oldVal = s.rawVal;
};
var van_default = {
  tags: new Proxy((ns) => new Proxy(tag, handler(ns)), handler()),
  hydrate: (dom, f) => update(dom, bind(f, dom)),
  add,
  state,
  derive
};

// src/widgets/next-chapter.ts
function registerNextChapterCommand(host) {
  let labels = null;
  const render = () => {
    host.root.ownerDocument.querySelector("#nekori-next-chapter")?.remove();
    if (!labels) return;
    const document2 = host.root.ownerDocument;
    const container = document2.createElement("div");
    container.id = "nekori-next-chapter";
    const finished = van_default.tags.div({ class: "info-text" }, labels.finishedText);
    container.append(finished);
    if (labels.hasNext) {
      const button = van_default.tags.button({ class: "next-button", type: "button" }, labels.nextText);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        host.emit("navigation.openNext", {});
      });
      container.append(button);
    } else {
      const message = van_default.tags.div({ class: "info-text" }, labels.noNextText);
      container.append(message);
    }
    (document2.getElementById("reader-ui") ?? document2.body).append(container);
  };
  return host.onCommand("ui.configureNextChapter", (value) => {
    if (!isRecord3(value) || typeof value.hasNext !== "boolean" || typeof value.finishedText !== "string" || typeof value.nextText !== "string" || typeof value.noNextText !== "string") throw new TypeError("Invalid next chapter labels");
    labels = { hasNext: value.hasNext, finishedText: value.finishedText, nextText: value.nextText, noNextText: value.noNextText };
    render();
  });
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/widgets/local-video.ts
function installLocalVideoControl(host) {
  const root = host.root;
  const onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("button#nekori-play-local-video")) return;
    event.preventDefault();
    event.stopPropagation();
    host.emit("media.playLocalVideo", {});
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

// src/tts/bionic.ts
var WORD = new RegExp("(\\p{L}|\\p{Nd})*\\p{L}(\\p{L}|\\p{Nd})*", "gu");
var THRESHOLDS = [0, 4, 12, 17, 24, 29, 35, 42, 48];
var MARKER = "data-nekori-bionic";
var EXCLUDED = [
  "script",
  "style",
  "code",
  "pre",
  "textarea",
  "button",
  '[contenteditable="true"]',
  "#nekori-image-modal",
  "#nekori-tts-controller",
  "#nekori-next-chapter",
  "nekori-chapter-summary",
  `b[${MARKER}]`
].join(",");
function fixationLength(word) {
  const thresholdIndex = THRESHOLDS.findIndex((threshold) => word.length <= threshold);
  return Math.max(thresholdIndex === -1 ? word.length - THRESHOLDS.length : word.length - thresholdIndex, 0);
}
function createBionicReading(root, initiallyEnabled, editing) {
  const document2 = root.ownerDocument;
  const window = document2.defaultView;
  if (!window) throw new Error("Bionic reading requires an active document window");
  let enabled = false;
  let observer = null;
  const apply = (node) => {
    if (!enabled || editing() || !node.isConnected) return;
    if (node.nodeType === window.Node.TEXT_NODE) {
      const textNode = node;
      const text = textNode.nodeValue ?? "";
      if (!text.trim() || textNode.parentElement?.closest(EXCLUDED)) return;
      transformText(textNode, text, document2);
      return;
    }
    if (node.nodeType !== window.Node.ELEMENT_NODE) return;
    const element = node;
    if (element.matches(EXCLUDED)) return;
    const walker = document2.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      if (textNode.nodeValue?.trim() && !textNode.parentElement?.closest(EXCLUDED)) nodes.push(textNode);
    }
    nodes.forEach((textNode) => transformText(textNode, textNode.nodeValue ?? "", document2));
  };
  const remove = () => {
    root.querySelectorAll(`b[${MARKER}]`).forEach((strong) => {
      strong.replaceWith(document2.createTextNode(strong.textContent ?? ""));
    });
    root.normalize();
  };
  const observe = () => {
    if (observer) observer.observe(root, { childList: true, subtree: true });
  };
  const setEnabled = (value) => {
    enabled = value && !editing();
    observer?.disconnect();
    if (!enabled) {
      remove();
      return;
    }
    apply(root);
    if (!observer) {
      observer = new window.MutationObserver((mutations) => {
        observer?.disconnect();
        for (const mutation of mutations) for (const node of mutation.addedNodes) apply(node);
        observe();
      });
    }
    observe();
  };
  const setEditing = (value) => {
    if (value && enabled) {
      enabled = false;
      observer?.disconnect();
      remove();
    }
  };
  setEnabled(initiallyEnabled);
  return {
    setEnabled,
    setEditing,
    dispose() {
      observer?.disconnect();
      observer = null;
      remove();
    }
  };
}
function transformText(node, text, document2) {
  WORD.lastIndex = 0;
  if (!WORD.test(text)) return;
  WORD.lastIndex = 0;
  const fragment = document2.createDocumentFragment();
  let last = 0;
  let match;
  while ((match = WORD.exec(text)) !== null) {
    if (match.index > last) fragment.append(document2.createTextNode(text.slice(last, match.index)));
    const word = match[0];
    const length = fixationLength(word);
    if (length > 0) {
      const strong = document2.createElement("b");
      strong.setAttribute(MARKER, "");
      strong.textContent = word.slice(0, length);
      fragment.append(strong);
    }
    fragment.append(document2.createTextNode(word.slice(length)));
    last = match.index + word.length;
  }
  if (last < text.length) fragment.append(document2.createTextNode(text.slice(last)));
  node.replaceWith(fragment);
}

// src/tts/paragraphs.ts
var INLINE_NODE_NAMES = /* @__PURE__ */ new Set(["#text", "B", "I", "SPAN", "EM", "BR", "STRONG", "A"]);
var SKIPPED_NODE_NAMES = /* @__PURE__ */ new Set(["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE", "IFRAME"]);
var INTERNAL_ELEMENT_IDS = /* @__PURE__ */ new Set(["nekori-title-novel"]);
var normalizers = /* @__PURE__ */ new WeakMap();
var trimText = (text) => text.trim();
function createTtsTextNormalizer(rules) {
  if (!rules) return trimText;
  const cached = normalizers.get(rules);
  if (cached) return cached;
  const replacements = rules.map(({ pattern, replacement }) => [new RegExp(pattern, "gu"), replacement]);
  const normalize = (text) => replacements.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text
  );
  normalizers.set(rules, normalize);
  return normalize;
}
function readableParagraphs(root, chapterId, rules) {
  const chapter = findChapter2(root, chapterId);
  return chapter ? readableBlocks(chapter, createTtsTextNormalizer(rules)) : [];
}
function extractParagraphText(root, chapterId, rules) {
  const normalize = createTtsTextNormalizer(rules);
  return readableParagraphs(root, chapterId, rules).map((element) => normalize(element.innerText)).join("\n");
}
function firstVisibleParagraph(root, chapterId, rules) {
  const window = root.ownerDocument.defaultView;
  if (!window) return 0;
  const visible = readableParagraphs(root, chapterId, rules).findIndex((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  return visible < 0 ? 0 : visible;
}
function taggedParagraph(root, chapterId, rules) {
  const markers = Array.from(root.querySelectorAll("[data-nekori-tts-target]"));
  const marker = markers[0] ?? null;
  markers.forEach((element) => element.removeAttribute("data-nekori-tts-target"));
  if (!marker) return -1;
  const paragraphs = readableParagraphs(root, chapterId, rules);
  for (let element = marker; element; element = element.parentElement) {
    const index = paragraphs.indexOf(element);
    if (index >= 0) return index;
  }
  return -1;
}
function readableBlocks(root, normalize = trimText) {
  const blocks = [];
  const visit = (element) => {
    if (isReadableBlock(element) && normalize(element.innerText).length > 0 && !element.closest("#nekori-image-modal,#nekori-tts-controller,#nekori-next-chapter")) {
      blocks.push(element);
    }
    Array.from(element.children).forEach(visit);
  };
  if (root.nodeType === 1) visit(root);
  else Array.from(root.children).forEach(visit);
  return blocks;
}
function readableBlockAtPoint(root, x, y, rules) {
  const normalize = createTtsTextNormalizer(rules);
  const candidates = new Set(readableBlocks(root, normalize));
  for (const hit of root.ownerDocument.elementsFromPoint(x, y).reverse()) {
    for (let element = hit; element; element = element.parentElement) {
      if (candidates.has(element)) return element;
      if (element === root) break;
    }
  }
  return null;
}
function findChapter2(root, chapterId) {
  if (chapterId === null) return root.querySelector(CHAPTER_TAG_NAME);
  return Array.from(root.querySelectorAll(CHAPTER_TAG_NAME)).find((element) => element.getAttribute(CHAPTER_ID_ATTR) === chapterId) ?? null;
}
function isReadableBlock(element) {
  if (INTERNAL_ELEMENT_IDS.has(element.id) || SKIPPED_NODE_NAMES.has(element.nodeName) || INLINE_NODE_NAMES.has(element.nodeName) || !element.hasChildNodes()) return false;
  return Array.from(element.childNodes).every((child) => INLINE_NODE_NAMES.has(child.nodeName));
}

// src/tts/controller.ts
var POSITION_KEY = "nekori.tts.position";
var ICONS = {
  volume: "M144-385v-192h144l192-192v576L288-385H144Zm408 55v-302q45 20 70.5 61t25.5 90q0 49-25.5 89.5T552-330Zm0 178v-75q86-23 139-93.5T744-480q0-89-53.5-158.5T552-734v-75q116 25 190 117t74 211q0 119-73.5 211.5T552-152Z",
  pause: "M228-228v-504h168v504H228Zm336 0v-504h168v504H564Z",
  play: "M240-240v-480l384 240-384 240Z"
};
function createTtsController(root, host, config) {
  const document2 = root.ownerDocument;
  const window = document2.defaultView;
  if (!window) throw new Error("TTS controller requires an active document window");
  const enabled = van_default.state(config.ui?.ttsEnabled ?? true);
  const state2 = van_default.state(config.runtime.ttsState);
  const dock = readDock(window, window.innerHeight / 2);
  const controller = document2.createElement("div");
  controller.id = "nekori-tts-controller";
  const button = van_default.tags.button;
  const actionLabel = config.ui?.labels.tts ?? config.strings.tts ?? "TTS";
  const svg = document2.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 -960 960 960");
  svg.setAttribute("aria-hidden", "true");
  const icon = document2.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.append(icon);
  const action = button({ type: "button", "aria-label": actionLabel, title: actionLabel }, svg);
  const iconBinding = van_default.derive(() => {
    icon.setAttribute("d", pathFor(state2.val));
    return null;
  });
  van_default.add(controller, action, iconBinding);
  (document2.getElementById("reader-ui") ?? document2.body).append(controller);
  let pointer = null;
  let hover = null;
  const applyDock = () => {
    controller.style.left = dock.right ? "calc(100% - 20px)" : "20px";
    controller.style.transform = dock.right ? "translateX(-100%)" : "translateX(0)";
    const margin = Math.min(120, window.innerHeight / 2);
    controller.style.top = `${Math.max(margin, Math.min(dock.top, window.innerHeight - margin))}px`;
  };
  const clearHover = () => {
    hover?.classList.remove("highlight");
    hover = null;
  };
  const updateHover = (x, y) => {
    const target = readableBlockAtPoint(root, x, y, config.ttsNormalizationRules);
    if (target === hover) return;
    clearHover();
    if (target instanceof window.HTMLElement) {
      hover = target;
      hover.classList.add("highlight");
    }
  };
  const onPointerDown = (event) => {
    if (!enabled.val) return;
    event.preventDefault();
    event.stopPropagation();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    controller.classList.add("active");
    controller.style.transition = "";
    controller.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 8) pointer.moved = true;
    if (!pointer.moved) return;
    controller.style.transform = "translateX(0)";
    controller.style.left = `${event.clientX}px`;
    controller.style.top = `${event.clientY}px`;
    updateHover(event.clientX, event.clientY);
  };
  const onPointerUp = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const moved = pointer.moved;
    pointer = null;
    controller.style.transition = "1s";
    controller.classList.remove("active");
    if (moved) {
      dock.right = event.clientX > window.innerWidth / 2;
      dock.top = event.clientY;
      try {
        window.localStorage.setItem(POSITION_KEY, JSON.stringify(dock));
      } catch {
      }
      if (hover) {
        hover.setAttribute("data-nekori-tts-target", "1");
        host.emit("tts.startAtTaggedParagraph", {});
      }
    } else host.emit("tts.toggle", {});
    applyDock();
    clearHover();
  };
  const onPointerCancel = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null;
    controller.classList.remove("active");
    applyDock();
    clearHover();
  };
  const cancelDrag = () => {
    if (!pointer) return;
    const pointerId = pointer.id;
    pointer = null;
    if (controller.hasPointerCapture(pointerId)) controller.releasePointerCapture(pointerId);
    controller.classList.remove("active");
    applyDock();
    clearHover();
  };
  const onResize = () => applyDock();
  action.addEventListener("pointerdown", onPointerDown);
  controller.addEventListener("pointermove", onPointerMove);
  controller.addEventListener("pointerup", onPointerUp);
  controller.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("resize", onResize);
  applyDock();
  const setEnabled = (value) => {
    enabled.val = value;
    if (!value) cancelDrag();
    controller.classList.toggle("hidden", !value || config.runtime.editing);
  };
  const setLabel = (label) => {
    action.setAttribute("aria-label", label);
    action.title = label;
  };
  const refresh = () => {
    state2.val = config.runtime.ttsState;
    setEnabled(enabled.val);
  };
  refresh();
  return {
    refresh,
    setEnabled,
    setLabel,
    dispose() {
      action.removeEventListener("pointerdown", onPointerDown);
      cancelDrag();
      controller.removeEventListener("pointermove", onPointerMove);
      controller.removeEventListener("pointerup", onPointerUp);
      controller.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("resize", onResize);
      clearHover();
      controller.remove();
    }
  };
}
function readDock(window, fallbackTop) {
  try {
    const value = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? "null");
    if (isRecord4(value) && typeof value.right === "boolean" && typeof value.top === "number" && Number.isFinite(value.top)) {
      return { right: value.right, top: value.top };
    }
  } catch {
  }
  return { right: false, top: fallbackTop };
}
function pathFor(state2) {
  return state2 === "playing" ? ICONS.pause : state2 === "paused" ? ICONS.play : ICONS.volume;
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/tts/highlight.ts
var HIGHLIGHT_CLASS = "nekori-tts-highlight";
function registerTtsDomCommands(host, layout) {
  return [
    host.onCommand("tts.extractText", (payload) => {
      const chapterId = optionalChapterId(payload);
      return extractParagraphText(host.root, chapterId, host.config.ttsNormalizationRules);
    }),
    host.onCommand("tts.firstVisibleParagraph", (payload) => {
      const chapterId = optionalChapterId(payload);
      return firstVisibleParagraph(host.root, chapterId, host.config.ttsNormalizationRules);
    }),
    host.onCommand("tts.taggedParagraph", (payload) => {
      const chapterId = optionalChapterId(payload);
      return taggedParagraph(host.root, chapterId, host.config.ttsNormalizationRules);
    }),
    host.onCommand("tts.highlight", (payload) => applyHighlight(host, layout, payload)),
    host.onCommand("tts.clearHighlight", () => clearHighlight(host.root))
  ];
}
function clearHighlight(root) {
  root.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
    element.classList.remove(HIGHLIGHT_CLASS);
    element.style.removeProperty("--nekori-tts-highlight-background");
    element.style.removeProperty("--nekori-tts-highlight-color");
    element.removeAttribute("data-nekori-tts-highlight-style");
  });
}
function applyHighlight(host, layout, value) {
  if (!isRecord5(value) || typeof value.paragraphIndex !== "number") throw new TypeError("Invalid TTS highlight payload");
  const chapterId = typeof value.chapterId === "string" ? value.chapterId : null;
  const paragraph = readableParagraphs(host.root, chapterId, host.config.ttsNormalizationRules)[Math.max(0, Math.trunc(value.paragraphIndex))];
  clearHighlight(host.root);
  if (!paragraph) return;
  const background = safeColor(value.backgroundColor);
  const color = safeColor(value.textColor);
  if (background) paragraph.style.setProperty("--nekori-tts-highlight-background", background);
  if (color) paragraph.style.setProperty("--nekori-tts-highlight-color", color);
  paragraph.dataset.nekoriTtsHighlightStyle = value.style === "underline" || value.style === "outline" ? value.style : "background";
  paragraph.classList.add(HIGHLIGHT_CLASS);
  if (value.keepInView === true) {
    if (layout?.enabled) layout.revealElement(paragraph);
    else paragraph.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
function optionalChapterId(value) {
  if (!isRecord5(value) || value.chapterId === null || value.chapterId === void 0) return null;
  if (typeof value.chapterId !== "string") throw new TypeError("Expected chapterId string or null");
  return value.chapterId;
}
function safeColor(value) {
  if (typeof value !== "string" || value.length > 100) return null;
  const view = globalThis.CSS;
  return view?.supports("color", value) ? value : null;
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/widgets/image-modal.ts
function createImageModal(root, closeLabel) {
  const document2 = root.ownerDocument;
  const window = document2.defaultView;
  if (!window) throw new Error("Image modal requires an active document window");
  const image = van_default.tags.img({ id: "nekori-image-modal-image" });
  const container = van_default.tags.div({
    id: "nekori-image-modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": closeLabel
  }, image);
  (document2.getElementById("reader-ui") ?? document2.body).append(container);
  let previousViewport = null;
  const viewportMeta = () => {
    let meta = document2.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document2.createElement("meta");
      meta.name = "viewport";
      document2.head.append(meta);
    }
    return meta;
  };
  const close = () => {
    if (!container.classList.contains("show")) return;
    container.classList.remove("show");
    image.removeAttribute("src");
    const meta = viewportMeta();
    if (previousViewport === null) meta.removeAttribute("content");
    else meta.setAttribute("content", previousViewport);
    previousViewport = null;
  };
  const open = (source) => {
    const src = source.currentSrc || source.src;
    if (!src) return;
    previousViewport = viewportMeta().getAttribute("content");
    viewportMeta().setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=10");
    image.src = src;
    image.alt = source.alt;
    container.classList.add("show");
  };
  const onContextMenu = (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.preventDefault();
    if (container.classList.contains("show")) close();
    else if (event.target !== image) open(event.target);
  };
  const onClick = (event) => {
    if (event.target !== image) {
      event.stopPropagation();
      close();
    }
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
  };
  container.addEventListener("click", onClick);
  document2.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  return {
    close,
    setCloseLabel(label) {
      container.setAttribute("aria-label", label);
    },
    dispose() {
      close();
      container.removeEventListener("click", onClick);
      document2.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      container.remove();
    }
  };
}

// src/widgets/image-loading.ts
function observeImageLoading(root) {
  const window = root.ownerDocument.defaultView;
  if (!window) throw new Error("Image loading observer requires an active document window");
  const markLoaded = (image) => {
    if (image.complete && image.naturalWidth > 0) image.classList.add("is-loaded");
    else image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
  };
  const setup = (node) => {
    if (node.matches("img")) markLoaded(node);
    node.querySelectorAll("img").forEach((image) => markLoaded(image));
  };
  root.querySelectorAll("img").forEach((image) => markLoaded(image));
  const observer = new window.MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node instanceof window.Element) setup(node);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

// inline-css:X:\src\nekori\app\tools\reader-runtime\src\styles\feedback-card.css
var feedback_card_default = ':host {\n    display: block;\n    position: static;\n    z-index: auto;\n    inline-size: auto;\n    max-inline-size: 100%;\n    margin: 1.25em 0;\n    break-inside: avoid;\n    page-break-inside: avoid;\n    color: var(--reader-text-color, CanvasText);\n    font-family: system-ui, sans-serif;\n    font-size: 1rem;\n    line-height: 1.5;\n}\n\n:host([data-presentation="fullpage"]) {\n    margin-block: clamp(1.5rem, 5vh, 3rem);\n}\n\n.card {\n    box-sizing: border-box;\n    inline-size: min(100%, 52rem);\n    margin-inline: auto;\n    padding: clamp(1rem, 3vw, 1.5rem);\n    border: 1px solid color-mix(in srgb, var(--reader-text-color, CanvasText) 20%, transparent);\n    border-inline-start: 3px solid var(--md-sys-color-primary, currentColor);\n    border-radius: .75rem;\n    background: color-mix(in srgb, var(--reader-text-color, CanvasText) 5%, var(--reader-background-color, Canvas));\n    color: var(--reader-text-color, CanvasText);\n    overflow-wrap: anywhere;\n}\n\n:host([data-severity="error"]) .card {\n    border-inline-start: 3px solid var(--md-sys-color-error, #b3261e);\n}\n\n:host([data-severity="error"]) .category {\n    color: var(--md-sys-color-error, #b3261e);\n}\n\n.category {\n    color: var(--md-sys-color-primary, currentColor);\n    margin: 0 0 .35em;\n    font-size: 1.1em;\n    font-weight: 700;\n}\n\n.summary {\n    margin: 0;\n    white-space: pre-wrap;\n}\n\n.details {\n    margin-block-start: 1rem;\n}\n\n.details > summary {\n    inline-size: fit-content;\n    cursor: pointer;\n    font-weight: 600;\n}\n\n.trace {\n    box-sizing: border-box;\n    max-block-size: min(30vh, 18rem);\n    margin: .75rem 0 0;\n    padding: .75rem;\n    overflow: auto;\n    border-radius: .5rem;\n    background: color-mix(in srgb, currentColor 8%, transparent);\n    font: 0.82em/1.45 ui-monospace, monospace;\n    white-space: pre;\n    user-select: text;\n    -webkit-user-select: text;\n}\n\n.actions {\n    display: flex;\n    justify-content: center;\n    flex-wrap: wrap;\n    gap: .5rem;\n    margin-block-start: 1rem;\n}\n\n.action {\n    min-block-size: 44px;\n    padding: .55rem .9rem;\n    border: 1px solid color-mix(in srgb, currentColor 35%, transparent);\n    border-radius: .5rem;\n    background: transparent;\n    color: inherit;\n    font: inherit;\n    cursor: pointer;\n}\n\n.action:focus-visible,\n.details > summary:focus-visible {\n    outline: 2px solid currentColor;\n    outline-offset: 3px;\n}\n\n.action:active {\n    background: color-mix(in srgb, currentColor 12%, transparent);\n}\n';

// src/widgets/feedback.ts
var FEEDBACK_TAG = "nekori-reader-feedback";
function createInlineFeedback(root, host, layout) {
  const document2 = root.ownerDocument;
  let current = null;
  const reflow = () => {
    layout?.reflow(true);
  };
  const clear = () => {
    if (!current) return;
    current.remove();
    current = null;
    reflow();
  };
  const show = (value) => {
    if (!isRecord6(value)) throw new TypeError("Invalid reader feedback payload");
    clear();
    const payload = normalizePayload(value);
    const chapter = payload.presentation === "boundary" ? resolveBoundary(root, host, payload.chapterId) : null;
    const feedbackHost = createFeedbackHost(document2, payload, host, reflow, () => {
      if (current === feedbackHost) {
        feedbackHost.remove();
        current = null;
        reflow();
      }
    });
    current = feedbackHost;
    (chapter ?? root).append(feedbackHost);
    reflow();
  };
  return { show, clear, dispose: clear };
}
function createFeedbackHost(document2, payload, host, reflow, dismiss) {
  const feedbackHost = document2.createElement(FEEDBACK_TAG);
  feedbackHost.dataset.severity = payload.severity;
  feedbackHost.dataset.presentation = payload.presentation;
  for (const [name, value] of Object.entries({
    display: "block",
    position: "static",
    zIndex: "auto",
    inlineSize: "auto",
    maxInlineSize: "100%",
    breakInside: "avoid",
    pageBreakInside: "avoid"
  })) feedbackHost.style.setProperty(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, "important");
  const shadow = feedbackHost.attachShadow({ mode: "open" });
  const style = van_default.tags.style(feedback_card_default);
  const card = van_default.tags.section({
    class: "card",
    role: payload.severity === "error" ? "alert" : "status",
    "aria-live": payload.severity === "error" ? "assertive" : "polite"
  });
  const category = optionalString(payload.category ?? payload.title);
  const summary = optionalString(payload.summary ?? payload.message) ?? "";
  const title = category ?? (payload.severity === "info" ? summary : null);
  if (title) card.append(van_default.tags.h2({ class: "category" }, title));
  if (summary && (category || payload.severity !== "info")) {
    card.append(van_default.tags.p({ class: "summary" }, summary));
  }
  const trace = decodeBase64(document2.defaultView, payload.traceBase64);
  if (trace !== null) {
    const details = van_default.tags.details({ class: "details" });
    const disclosure = van_default.tags.summary({}, optionalString(payload.detailsLabel) ?? "Details");
    const pre = van_default.tags.pre({ class: "trace" }, van_default.tags.code({}, trace));
    details.open = payload.presentation === "fullpage";
    details.append(disclosure, pre);
    details.addEventListener("toggle", reflow);
    card.append(details);
  }
  const actions = van_default.tags.div({ class: "actions" });
  const dismissLabel = optionalString(payload.dismissLabel);
  if (payload.presentation === "boundary" || dismissLabel !== null) {
    actions.append(makeButton(document2, dismissLabel ?? "Dismiss", "dismiss", dismiss));
  }
  if (typeof payload.retryLabel === "string") {
    actions.append(makeButton(document2, payload.retryLabel, "retry", () => {
      dismiss();
      host.emit("feedback.retry", {});
    }));
  }
  if (trace !== null && typeof payload.copyLabel === "string") {
    actions.append(makeButton(document2, payload.copyLabel, "copy", () => host.emit("clipboard.copy", { text: trace })));
  }
  if (actions.childElementCount > 0) card.append(actions);
  shadow.append(style, card);
  return feedbackHost;
}
function makeButton(document2, label, action, onClick) {
  const button = van_default.tags.button({ type: "button", class: `action action-${action}` }, label);
  button.addEventListener("click", onClick);
  return button;
}
function resolveBoundary(root, host, requestedId) {
  const chapters = getChapters(root);
  const requested = typeof requestedId === "string" ? chapters.find((chapter) => chapter.dataset.nekoriChapterId === requestedId) : void 0;
  if (requested) return requested;
  const current = chapters.find((chapter) => chapter.dataset.nekoriChapterId === host.chapter.id);
  return current ?? chapters.at(-1) ?? root;
}
function getChapters(root) {
  const ownChapter = root.matches("nekori-chapter") ? [root] : [];
  return [...ownChapter, ...root.querySelectorAll("nekori-chapter")];
}
function normalizePayload(value) {
  const severity = value.severity === "info" ? "info" : "error";
  const presentation = value.presentation === "boundary" ? "boundary" : "fullpage";
  return { ...value, severity, presentation };
}
function decodeBase64(view, encoded) {
  if (!view || typeof encoded !== "string") return null;
  try {
    const binary = view.atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}
function optionalString(value) {
  return typeof value === "string" ? value : null;
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// inline-css:X:\src\nekori\app\tools\reader-runtime\src\styles\summary.css
var summary_default = "/* Styles for the <nekori-chapter-summary> shadow root. Nothing here leaks into the chapter, and\n   nothing the reader injects into the chapter (bionic <b>, TTS highlight classes, plugin CSS) can\n   reach in - which is the whole reason the card lives in a shadow root. */\n\n:host {\n    display: block;\n    margin: 0 0 1.5em;\n}\n\n.card {\n    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);\n    border-radius: 16px;\n    padding: 16px;\n    font-size: 0.95em;\n    line-height: 1.6;\n}\n\n.head {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    margin-bottom: 12px;\n    font-weight: 600;\n    opacity: 0.85;\n}\n\n.title {\n    flex: 1;\n}\n\n.body p {\n    margin: 0 0 0.9em;\n}\n\n.body p:last-child {\n    margin-bottom: 0;\n}\n\n.body.status {\n    opacity: 0.7;\n    font-style: italic;\n}\n\n.actions {\n    display: flex;\n    justify-content: flex-end;\n    gap: 8px;\n    margin-top: 14px;\n}\n\nbutton {\n    font: inherit;\n    font-size: 0.9em;\n    color: inherit;\n    background: transparent;\n    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);\n    border-radius: 999px;\n    padding: 6px 16px;\n    cursor: pointer;\n}\n\nbutton:active {\n    background: color-mix(in srgb, currentColor 12%, transparent);\n}\n";

// src/summary/index.ts
var HOST_TAG = "nekori-chapter-summary";
function registerSummaryCommands(host, layout) {
  return [
    host.onCommand("summary.focus", (value) => {
      const chapterId = readChapterId(value);
      const card = existingSummary(host.root, chapterId);
      if (!card) return false;
      if (layout?.enabled) layout.revealElement(card);
      else card.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }),
    host.onCommand("summary.render", (value) => renderSummary(host, value)),
    host.onCommand("summary.remove", (value) => existingSummary(host.root, readChapterId(value))?.remove())
  ];
}
function renderSummary(host, value) {
  if (!isRecord7(value) || typeof value.chapterId !== "string" || value.state !== "loading" && value.state !== "ready" && value.state !== "failed" && value.state !== "cancelled" || typeof value.text !== "string" || !isLabels(value.labels)) {
    throw new TypeError("Invalid chapter summary payload");
  }
  const chapter = findChapter(host.root, value.chapterId);
  if (!chapter) return;
  const card = existingSummary(host.root, value.chapterId) ?? createSummary(host.root.ownerDocument, chapter, value.chapterId);
  const shadow = card.shadowRoot;
  if (!shadow) throw new Error("Summary shadow root is unavailable");
  shadow.querySelector(".title").textContent = value.labels.title;
  const body = shadow.querySelector(".body");
  const actions = shadow.querySelector(".actions");
  body.className = value.state === "ready" ? "body" : "body status";
  if (value.state === "ready") renderParagraphs(body, value.text);
  else body.textContent = value.state === "loading" ? value.labels.loading : value.text;
  actions.replaceChildren();
  actions.append(createAction(
    host,
    value.chapterId,
    value.state === "loading" ? value.labels.cancel : value.labels.regenerate,
    value.state === "loading" ? "cancel" : "regenerate"
  ));
  actions.append(createAction(host, value.chapterId, value.labels.close, "close"));
  if (value.state === "failed" && value.text) host.emit("reader.error", { message: value.text });
}
function createSummary(document2, chapter, chapterId) {
  const host = document2.createElement(HOST_TAG);
  host.setAttribute("data-nekori-chapter-id", chapterId);
  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document2.createElement("style");
  stylesheet.textContent = summary_default;
  const card = document2.createElement("div");
  card.className = "card";
  const heading = document2.createElement("div");
  heading.className = "head";
  const title = document2.createElement("span");
  title.className = "title";
  heading.append(title);
  const body = document2.createElement("div");
  body.className = "body";
  const actions = document2.createElement("div");
  actions.className = "actions";
  card.append(heading, body, actions);
  shadow.append(stylesheet, card);
  chapter.prepend(host);
  return host;
}
function createAction(host, chapterId, label, action) {
  const button = host.root.ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => host.emit("summary.action", { chapterId, action }));
  return button;
}
function renderParagraphs(container, text) {
  const fragment = container.ownerDocument.createDocumentFragment();
  for (const block of text.split(/\n\s*\n/)) {
    const content = block.trim();
    if (!content) continue;
    const paragraph = container.ownerDocument.createElement("p");
    paragraph.textContent = content;
    fragment.append(paragraph);
  }
  container.replaceChildren(fragment);
  if (!container.firstChild) container.textContent = text.trim();
}
function existingSummary(root, chapterId) {
  const chapter = findChapter(root, chapterId);
  return chapter?.querySelector(`:scope > ${HOST_TAG}`) ?? null;
}
function readChapterId(value) {
  if (!isRecord7(value) || typeof value.chapterId !== "string") throw new TypeError("Expected chapterId string");
  return value.chapterId;
}
function isLabels(value) {
  return isRecord7(value) && typeof value.title === "string" && typeof value.loading === "string" && typeof value.cancel === "string" && typeof value.regenerate === "string" && typeof value.close === "string";
}
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/styles/background.ts
function createReaderBackground(host) {
  const document2 = host.root.ownerDocument;
  const window = document2.defaultView;
  if (!window) throw new Error("Reader background requires an active document window");
  let layer = document2.getElementById("nekori-reader-background");
  if (!layer) {
    layer = document2.createElement("div");
    layer.id = "nekori-reader-background";
    layer.setAttribute("aria-hidden", "true");
    document2.body.prepend(layer);
  }
  let generation = 0;
  let loadedUrl = "";
  const apply = (value) => {
    if (!isConfig(value)) throw new TypeError("Invalid reader background config");
    const token = ++generation;
    layer.style.backgroundImage = "none";
    if (!value.image) {
      loadedUrl = "";
      return;
    }
    const opacity = clamp2(value.opacity ?? 100, 0, 100) / 100;
    const blur = clamp2(value.blur ?? 0, 0, 20);
    layer.style.backgroundSize = value.size === "stretch" ? "100% 100%" : ["cover", "contain", "auto"].includes(value.size ?? "") ? value.size : "cover";
    layer.style.backgroundPosition = ["center", "top", "bottom", "left", "right", "top left"].includes(value.position ?? "") ? value.position : "center";
    layer.style.backgroundRepeat = value.repeat ? "repeat" : "no-repeat";
    layer.style.opacity = String(opacity);
    layer.style.filter = blur ? `blur(${blur}px)` : "none";
    layer.style.inset = `${-blur * 3}px`;
    const display = () => {
      if (token === generation) layer.style.backgroundImage = `url(${JSON.stringify(value.image)})`;
    };
    if (loadedUrl === value.image) {
      display();
      return;
    }
    const image = new window.Image();
    image.onload = () => {
      if (token === generation) {
        loadedUrl = value.image;
        display();
      }
    };
    image.onerror = () => {
      if (token === generation) {
        loadedUrl = "";
        host.emit("reader.error", { message: value.errorMessage ?? "" });
      }
    };
    image.src = value.image;
  };
  const config = document2.getElementById("nekori-reader-background-config");
  if (config?.textContent) apply(JSON.parse(config.textContent));
  return {
    apply,
    dispose() {
      generation++;
      layer?.remove();
      layer = null;
    }
  };
}
function isConfig(value) {
  return isRecord8(value) && typeof value.image === "string" && (value.opacity === void 0 || typeof value.opacity === "number") && (value.blur === void 0 || typeof value.blur === "number") && (value.size === void 0 || typeof value.size === "string") && (value.position === void 0 || typeof value.position === "string") && (value.repeat === void 0 || typeof value.repeat === "boolean") && (value.errorMessage === void 0 || typeof value.errorMessage === "string");
}
function clamp2(value, low, high) {
  return Math.min(Math.max(value, low), high);
}
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/styles/reader.ts
function registerStyleCommand(host) {
  const document2 = host.root.ownerDocument;
  const background = createReaderBackground(host);
  const initialClasses = host.config.style?.bodyClasses;
  const appliedClasses = new Set(typeof initialClasses === "string" ? initialClasses.split(/\s+/).filter(Boolean) : []);
  const remove = host.onCommand("style.apply", (value) => {
    if (!isRecord9(value) || typeof value.css !== "string" || typeof value.bodyClasses !== "string") {
      throw new TypeError("Invalid reader style payload");
    }
    const styleId = "nekori-custom-style";
    let style = document2.getElementById(styleId);
    if (!style) {
      style = document2.createElement("style");
      style.id = styleId;
      document2.head.append(style);
    }
    style.textContent = value.css;
    for (const className of appliedClasses) document2.body.classList.remove(className);
    appliedClasses.clear();
    for (const className of value.bodyClasses.split(/\s+/).filter(Boolean)) {
      document2.body.classList.add(className);
      appliedClasses.add(className);
    }
    if (typeof value.backgroundColor === "number" && Number.isFinite(value.backgroundColor)) {
      document2.body.style.backgroundColor = androidColor(value.backgroundColor);
    }
    if (value.background !== void 0) background.apply(value.background);
  });
  return { dispose() {
    remove();
    background.dispose();
    document2.getElementById("nekori-custom-style")?.remove();
  } };
}
function androidColor(color) {
  const value = color >>> 0;
  const alpha = value >>> 24 & 255;
  const red = value >>> 16 & 255;
  const green = value >>> 8 & 255;
  const blue = value & 255;
  return alpha === 255 ? `rgb(${red} ${green} ${blue})` : `rgb(${red} ${green} ${blue} / ${alpha / 255})`;
}
function isRecord9(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/interactions/gestures.ts
var OWNED_TARGETS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "details",
  "video",
  "audio",
  "iframe",
  "object",
  "embed",
  "[onclick]",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  "#nekori-image-modal",
  "#nekori-tts-controller",
  "#nekori-next-chapter",
  "#nekori-player-container",
  "#nekori-debug-overlay",
  "#nekori-debug-toggle",
  ".nekori-overlay",
  ".nekori-action",
  ".nekori-nextup",
  "#nekori-inline-feedback"
].join(",");

// src/widgets/index.ts
function createWidgets({ root, host, config, layout }) {
  const closeLabel = config.ui?.labels.imageClose ?? config.strings.imageClose ?? "Close image";
  const imageModal = createImageModal(root, closeLabel);
  const stopImages = observeImageLoading(root);
  const tts = createTtsController(root, host, config);
  let bionicEnabled = config.ui?.bionicEnabled ?? false;
  const bionic = createBionicReading(root, bionicEnabled, () => config.runtime.editing);
  const feedback = createInlineFeedback(root, host, layout);
  const style = registerStyleCommand(host);
  let removeAnchors = null;
  const commands = [
    installLocalVideoControl(host),
    ...registerTtsDomCommands(host, layout),
    ...registerSelectionCommands(host),
    ...registerEditingCommands(host),
    ...registerVerticalScrollCommands(host),
    ...registerSummaryCommands(host, layout),
    registerSnippetCommand(host),
    registerNextChapterCommand(host),
    host.onCommand("ui.configure", (value) => configureUi(value)),
    host.onCommand("ui.setTtsEnabled", (value) => tts.setEnabled(readEnabled(value))),
    host.onCommand("ui.setBionic", (value) => {
      bionicEnabled = readEnabled(value);
      bionic.setEnabled(bionicEnabled);
    }),
    host.onCommand("ui.refresh", () => refresh()),
    host.onCommand("feedback.show", (value) => feedback.show(value)),
    host.onCommand("feedback.clear", () => feedback.clear()),
    host.onCommand("anchors.install", () => {
      removeAnchors ??= installScopedAnchors(root, () => layout);
    })
  ];
  const configureUi = (value) => {
    if (!isRecord10(value) || typeof value.bionicEnabled !== "boolean" || typeof value.ttsEnabled !== "boolean" || !isRecord10(value.labels) || typeof value.labels.tts !== "string" || typeof value.labels.imageClose !== "string") {
      throw new TypeError("Invalid reader UI configuration");
    }
    bionicEnabled = value.bionicEnabled;
    tts.setEnabled(value.ttsEnabled);
    tts.setLabel(value.labels.tts);
    imageModal.setCloseLabel(value.labels.imageClose);
    bionic.setEnabled(bionicEnabled);
  };
  const refresh = () => {
    tts.refresh();
    bionic.setEnabled(bionicEnabled);
  };
  const unsubscribeState = host.events.subscribe("document.stateChanged", ({ runtime }) => {
    Object.assign(config.runtime, runtime);
    refresh();
  });
  refresh();
  return {
    refresh,
    dispose() {
      unsubscribeState();
      commands.forEach((unsubscribe) => unsubscribe());
      removeAnchors?.();
      removeAnchors = null;
      style.dispose();
      feedback.dispose();
      bionic.dispose();
      tts.dispose();
      imageModal.dispose();
      stopImages();
    }
  };
}
function readEnabled(value) {
  if (!isRecord10(value) || typeof value.enabled !== "boolean") throw new TypeError("Expected enabled boolean");
  return value.enabled;
}
function isRecord10(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/chapters/dom.ts
function setMetadata(element, chapter) {
  element.setAttribute(CHAPTER_ID_ATTR, chapter.id);
  element.setAttribute(CHAPTER_TITLE_ATTR, chapter.name);
  element.setAttribute(CHAPTER_NUMBER_ATTR, String(chapter.number));
  element.setAttribute(CHAPTER_PATH_ATTR, chapter.path);
  element.setAttribute(CHAPTER_URL_ATTR, chapter.url);
}
function createChapterElements(document2, chapter) {
  const element = document2.createElement(CHAPTER_TAG_NAME);
  element.classList.add(CHAPTER_CLASS);
  element.setAttribute("dir", chapter.direction ?? "ltr");
  if (chapter.language !== void 0) element.setAttribute("lang", chapter.language);
  setMetadata(element, chapter);
  const divider = document2.createElement("div");
  divider.classList.add(CHAPTER_DIVIDER_CLASS);
  divider.setAttribute("aria-hidden", "true");
  setMetadata(divider, chapter);
  return { element, divider };
}
function appendChapter(root, nodes) {
  root.append(nodes.divider, nodes.element);
}
function removeChapter(root, chapterId) {
  const nodes = Array.from(root.querySelectorAll(`${CHAPTER_TAG_NAME}, .${CHAPTER_DIVIDER_CLASS}`)).filter((node) => node.getAttribute(CHAPTER_ID_ATTR) === chapterId);
  if (nodes.length === 0) return false;
  nodes.forEach((node) => node.remove());
  return true;
}
function replaceChapterText(document2, chapter, text) {
  const fragment = document2.createDocumentFragment();
  const paragraphs = text.split(/\n{2,}/).filter((paragraph) => paragraph.length > 0);
  const container = document2.createElement("div");
  container.className = PLAIN_TEXT_CLASS;
  container.setAttribute(PLAIN_TEXT_ATTR, "1");
  for (const paragraph of paragraphs) {
    const element = document2.createElement("p");
    element.style.whiteSpace = "pre-wrap";
    element.style.wordBreak = "break-word";
    element.style.overflowWrap = "anywhere";
    element.append(document2.createTextNode(paragraph));
    fragment.append(element);
  }
  container.append(fragment);
  chapter.replaceChildren(container);
}
function setChapterHtml(chapter, html) {
  const unsafeElement = chapter;
  if (typeof unsafeElement.setHTMLUnsafe === "function") unsafeElement.setHTMLUnsafe(html);
  else chapter.innerHTML = html;
}
function applyProcessedContent(document2, chapter, content) {
  if (content.kind === "plainText") replaceChapterText(document2, chapter, content.text);
  else setChapterHtml(chapter, content.html);
}

// src/runtime/chapter-dom.ts
function initializeInitialContent(root, config) {
  const chapter = Array.from(root.querySelectorAll(CHAPTER_TAG_NAME)).find((element) => element.getAttribute(CHAPTER_ID_ATTR) === config.chapter.id) ?? null;
  if (!chapter) {
    if (config.mode === "error" && !config.initialContent) return;
    const nodes = createChapterElements(root.ownerDocument, chapterMetadata(config.chapter));
    nodes.divider.style.cssText = "visibility:hidden;height:0;margin:0;padding:0;border:none;";
    if (config.initialContent) applyProcessedContent(root.ownerDocument, nodes.element, config.initialContent);
    appendChapter(root, nodes);
    return;
  }
  if (config.initialContent && chapter.childElementCount === 0 && (chapter.textContent ?? "").trim().length === 0) {
    applyProcessedContent(root.ownerDocument, chapter, config.initialContent);
  }
}
function appendChapter2(host, root, payload, layout, tracking, refreshWidgets) {
  if (!isRecord11(payload) || !isRecord11(payload.chapter) || !isRecord11(payload.content)) throw new TypeError("Invalid chapter.append payload");
  const metadata = payload.chapter;
  if (typeof metadata.id !== "string" || typeof metadata.name !== "string" || typeof metadata.path !== "string" || typeof metadata.absoluteUrl !== "string" || typeof metadata.number !== "number") throw new TypeError("Invalid appended chapter metadata");
  const chapterMetadata2 = {
    id: metadata.id,
    name: metadata.name,
    number: metadata.number,
    path: metadata.path,
    url: metadata.absoluteUrl,
    ...metadata.direction === "ltr" || metadata.direction === "rtl" ? { direction: metadata.direction } : {},
    ...typeof metadata.language === "string" ? { language: metadata.language } : {}
  };
  const nodes = createChapterElements(root.ownerDocument, chapterMetadata2);
  const content = payload.content;
  if (content.kind === "plainText" && typeof content.text === "string") {
    applyProcessedContent(root.ownerDocument, nodes.element, { kind: "plainText", text: content.text });
  } else if (content.kind === "html" && typeof content.html === "string") {
    applyProcessedContent(root.ownerDocument, nodes.element, { kind: "html", html: content.html });
  } else {
    throw new TypeError("Invalid appended chapter content");
  }
  appendChapter(root, nodes);
  layout.reflow();
  tracking?.updateChapterBoundaries();
  refreshWidgets?.();
  host.emit("chapter.appended", { chapterId: metadata.id });
  return true;
}
function removeChapter2(root, payload, layout, tracking, refreshWidgets) {
  const chapterId = stringField(payload, "chapterId");
  if (!removeChapter(root, chapterId)) return false;
  layout.reflow();
  tracking?.updateChapterBoundaries();
  refreshWidgets?.();
  return true;
}
function chapterMetadata(chapter) {
  return {
    id: chapter.id,
    name: chapter.name,
    number: chapter.number ?? 0,
    path: chapter.path,
    url: chapter.url ?? ""
  };
}
function isRecord11(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringField(payload, name) {
  if (!isRecord11(payload) || typeof payload[name] !== "string") throw new TypeError(`${name} must be a string`);
  return payload[name];
}

// src/runtime/create-reader.ts
function createReader({ root, host, config }) {
  let layout = null;
  let player = null;
  let disposeTracking = null;
  let trackingController = null;
  let disposeWidgets = null;
  let refreshWidgets = null;
  let disposeShortChapterObserver = null;
  let disposed = false;
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("Reader root is not attached to a browser document");
  const global = view;
  const api = {
    get config() {
      return host.config;
    },
    get context() {
      return host.context;
    },
    events: host.events,
    ready: Promise.resolve(),
    get layout() {
      return layout;
    },
    get player() {
      return player;
    },
    fetch(input, init) {
      return host.fetch(input, init);
    },
    refetch() {
      host.emit("reader.refetch", {});
    },
    error(message) {
      host.emit("reader.error", { message });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      player?.dispose();
      disposeTracking?.();
      disposeWidgets?.();
      disposeShortChapterObserver?.();
      layout?.dispose();
      if (global.nekori === api) delete global.nekori;
      host.dispose();
    }
  };
  global.nekori = api;
  const ready = host.start([
    async () => {
      const readerRoot = await waitForReaderRoot(root, host);
      if (disposed) return;
      if (config.mode !== "download") initializeInitialContent(readerRoot, host.config);
      if (config.mode !== "download") {
        layout = createLayout({ root: readerRoot, host });
        layout.configure(config.layout ?? {
          enabled: false,
          spread: "single",
          direction: "ltr",
          vertical: false,
          infinite: config.runtime.infinite,
          threshold: 0.8,
          chapterId: config.chapter.id
        });
        registerLayoutCommands(host, layout, readerRoot);
        registerScrollTracking(host, readerRoot, config, () => layout?.enabled === true, (controller, dispose) => {
          trackingController = controller;
          disposeTracking = dispose;
        });
        const markShort = config.markShortChapterAsRead === true && config.mode === "reader" && config.layout?.enabled !== true && !config.runtime.infinite && !config.player;
        if (markShort) disposeShortChapterObserver = observeShortChapter({ host, enabled: true });
        host.onCommand("chapter.append", (payload) => appendChapter2(host, readerRoot, payload, layout, trackingController, refreshWidgets));
        host.onCommand("chapter.remove", (payload) => removeChapter2(readerRoot, payload, layout, trackingController, refreshWidgets));
      }
      if (config.player) {
        player = createPlayer(host, config.player);
      }
      if (config.mode !== "download") {
        const widgets = createWidgets({ root: readerRoot, host, config, layout });
        refreshWidgets = () => widgets.refresh();
        disposeWidgets = () => widgets.dispose();
      }
    }
  ]);
  void ready.then(() => {
    if (disposed) return;
    if (config.pluginJavaScript) executeSourceScript(config.pluginJavaScript, root.ownerDocument);
    if (config.player?.video.direct === true && player) {
      void startDirectPlayer(player, config.player).catch((error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        if (config.player?.mode === "download") {
          host.emit("media.download.error", { code: "direct_playback_failed", message });
        } else {
          api.error(message);
        }
      });
    }
  }).catch((error) => {
    if (disposed) return;
    const message = error instanceof Error ? error.message : String(error);
    if (config.player?.mode === "download") host.emit("media.download.error", { code: "runtime_initialization_failed", message });
    else api.error(message);
  });
  Object.defineProperty(api, "ready", { enumerable: true, value: ready });
  return api;
}
function waitForReaderRoot(root, host) {
  const document2 = root.ownerDocument;
  const findRoot = () => document2.querySelector("[data-nekori-reader-root], #nekori-reader");
  const existing = findRoot();
  if (existing) return Promise.resolve(existing);
  if (document2.readyState !== "loading") return Promise.resolve(document2.body ?? root);
  return new Promise((resolve) => {
    const onReady = () => {
      unregisterDispose();
      resolve(findRoot() ?? document2.body ?? root);
    };
    const unregisterDispose = host.onDispose(() => {
      document2.removeEventListener("DOMContentLoaded", onReady);
      resolve(root);
    });
    document2.addEventListener("DOMContentLoaded", onReady, { once: true });
  });
}
function registerLayoutCommands(host, layout, root) {
  host.onCommand("layout.move", (payload) => {
    const delta = numberField(payload, "delta");
    if (delta !== -1 && delta !== 1) throw new TypeError("layout.move delta must be -1 or 1");
    return layout.moveBy(delta);
  });
  host.onCommand("layout.seekUnit", (payload) => layout.seekUnit(numberField(payload, "unitIndex")));
  host.onCommand("layout.seekPercent", (payload) => layout.seekPercent(numberField(payload, "percent")));
  host.onCommand("layout.reflow", () => layout.reflow());
  host.onCommand("layout.prepareTurn", (payload) => {
    const delta = numberField(payload, "delta");
    if (delta !== -1 && delta !== 1) throw new TypeError("layout.prepareTurn delta must be -1 or 1");
    if (!layout.enabled) return false;
    layout.prepareSilentTurn(false);
    const moved = layout.moveBy(delta, "instant");
    if (!moved) layout.finishSilentTurn(false, false);
    return moved;
  });
  host.onCommand("layout.finishTurn", (payload) => {
    const commit = booleanField(payload, "commit");
    return layout.finishSilentTurn(false, commit);
  });
  host.onCommand("chapter.reveal", (payload) => {
    const chapterId = stringField2(payload, "chapterId");
    const chapter = Array.from(root.querySelectorAll(CHAPTER_TAG_NAME)).find((element) => element.getAttribute(CHAPTER_ID_ATTR) === chapterId);
    return chapter ? layout.revealElement(chapter) : false;
  });
  host.onCommand("layout.configure", (payload) => {
    if (!isRecord12(payload) || typeof payload.enabled !== "boolean" || payload.spread !== "single" && payload.spread !== "double" || payload.direction !== "ltr" && payload.direction !== "rtl" || typeof payload.vertical !== "boolean" || typeof payload.infinite !== "boolean" || typeof payload.threshold !== "number" || typeof payload.chapterId !== "string") throw new TypeError("Invalid layout.configure payload");
    layout.configure(payload);
  });
}
function registerScrollTracking(host, root, config, isPaged, attach) {
  if (!config.scrollTracking || config.player) return;
  const tracking = createScrollTracking({ root, host, isPaged });
  tracking.configure(config.scrollTracking);
  attach(tracking, () => tracking.dispose());
  host.onCommand("chapter.resetTracking", () => tracking.resetChapterTracking());
  host.onCommand("chapter.setLoadingNext", (payload) => {
    if (!isRecord12(payload) || typeof payload.loading !== "boolean") throw new TypeError("Expected loading boolean");
    tracking.setLoadingNext(payload.loading);
  });
  host.onCommand("chapter.setNoMore", (payload) => {
    if (!isRecord12(payload) || typeof payload.value !== "boolean") throw new TypeError("Expected value boolean");
    tracking.setNoMoreChapters(payload.value);
  });
  host.onCommand("scrollTracking.configure", (payload) => {
    if (!isRecord12(payload) || typeof payload.infiniteScrollEnabled !== "boolean" || typeof payload.loadThreshold !== "number" || typeof payload.doneThreshold !== "number") {
      throw new TypeError("Expected scroll tracking configuration");
    }
    tracking.configure(payload);
  });
}
async function startDirectPlayer(player, config) {
  const { video } = config;
  const url = video.url;
  if (!url) throw new TypeError("Direct video config is missing its URL");
  if (video.type === "m3u8") return player.playHls(url, video.hlsConfig);
  if (video.type === "mpd") return player.playDash(url, video.dashConfig);
  if (video.type === "iframe") return player.playIframe(url);
  if (video.type === "video-file") return player.playDirect(url);
  throw new TypeError("Direct video config has an unsupported type");
}
function isRecord12(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numberField(payload, name) {
  if (!isRecord12(payload) || typeof payload[name] !== "number" || !Number.isFinite(payload[name])) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return payload[name];
}
function booleanField(payload, name) {
  if (!isRecord12(payload) || typeof payload[name] !== "boolean") throw new TypeError(`${name} must be a boolean`);
  return payload[name];
}
function stringField2(payload, name) {
  if (!isRecord12(payload) || typeof payload[name] !== "string") throw new TypeError(`${name} must be a string`);
  return payload[name];
}

// src/protocol/reader-config.ts
var ReaderConfigError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReaderConfigError";
  }
};
function parseReaderConfig(value) {
  if (!isRecord13(value)) throw new ReaderConfigError("Reader config must be a JSON object");
  if (typeof value.documentId !== "string" || value.documentId.length === 0) {
    throw new ReaderConfigError("Reader config is missing documentId");
  }
  if (value.mode !== "reader" && value.mode !== "download" && value.mode !== "error") {
    throw new ReaderConfigError("Reader config has an unsupported mode");
  }
  if (!isNovel(value.novel) || !isChapter(value.chapter) || !isRuntimeState(value.runtime)) {
    throw new ReaderConfigError("Reader config is missing novel, chapter, or runtime state");
  }
  if (!Array.isArray(value.chapters) || !value.chapters.every(isChapter) || !isStringMap(value.strings) || !isFiniteNumber(value.autoSaveInterval) || !(value.nextChapter === null || isChapter(value.nextChapter))) {
    throw new ReaderConfigError("Reader config has invalid chapters, strings, or auto-save interval");
  }
  if (value.layout !== void 0 && !isLayoutConfig(value.layout)) throw new ReaderConfigError("Reader layout config is invalid");
  if (value.scrollTracking !== void 0 && !isScrollTrackingConfig(value.scrollTracking)) {
    throw new ReaderConfigError("Reader scroll tracking config is invalid");
  }
  if (value.player !== void 0 && !isPlayerConfig(value.player)) throw new ReaderConfigError("Reader player config is invalid");
  if (value.context !== void 0 && !isRecord13(value.context)) throw new ReaderConfigError("Reader context must be an object");
  if (value.proxyEndpoint !== void 0 && !isString(value.proxyEndpoint) || value.pluginJavaScript !== void 0 && !isString(value.pluginJavaScript) || value.markShortChapterAsRead !== void 0 && typeof value.markShortChapterAsRead !== "boolean") {
    throw new ReaderConfigError("Reader config has invalid optional fields");
  }
  if (value.style !== void 0 && !isRecord13(value.style)) throw new ReaderConfigError("Reader style config must be an object");
  if (value.ui !== void 0 && !isUiConfig(value.ui)) throw new ReaderConfigError("Reader UI config is invalid");
  if (value.initialContent !== void 0 && (!isRecord13(value.initialContent) || value.initialContent.kind !== "plainText" || typeof value.initialContent.text !== "string")) {
    throw new ReaderConfigError("Reader initial content must be plain text");
  }
  if (value.ttsNormalizationRules !== void 0 && (!Array.isArray(value.ttsNormalizationRules) || !value.ttsNormalizationRules.every((rule) => isRecord13(rule) && isString(rule.pattern) && isString(rule.replacement)))) {
    throw new ReaderConfigError("Reader TTS normalization rules are invalid");
  }
  return value;
}
function readReaderConfig(root) {
  const element = root.querySelector("#nekori-reader-config");
  if (!element || element.tagName !== "SCRIPT" || element.getAttribute("type") !== "application/json" || !element.textContent) {
    throw new ReaderConfigError("Missing #nekori-reader-config JSON element");
  }
  let value;
  try {
    value = JSON.parse(element.textContent);
  } catch {
    throw new ReaderConfigError("Reader config contains invalid JSON");
  }
  return parseReaderConfig(value);
}
function isRecord13(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNovel(value) {
  return isRecord13(value) && isString(value.id) && isString(value.name) && isString(value.path);
}
function isChapter(value) {
  return isRecord13(value) && isString(value.id) && isString(value.name) && isString(value.path) && isFiniteNumber(value.progress) && (value.number === void 0 || isFiniteNumber(value.number)) && (value.url === void 0 || isString(value.url));
}
function isRuntimeState(value) {
  return isRecord13(value) && typeof value.editing === "boolean" && typeof value.infinite === "boolean" && typeof value.textSelectionBlocked === "boolean" && typeof value.forcedLowercase === "boolean" && typeof value.menuVisible === "boolean" && typeof value.immersive === "boolean" && (value.ttsState === "playing" || value.ttsState === "paused" || value.ttsState === "stopped" || value.ttsState === "starting") && typeof value.loadingChapter === "boolean" && typeof value.loadingNext === "boolean" && typeof value.noMoreChapters === "boolean";
}
function isStringMap(value) {
  return isRecord13(value) && Object.values(value).every(isString);
}
function isLayoutConfig(value) {
  return isRecord13(value) && typeof value.enabled === "boolean" && (value.spread === "single" || value.spread === "double") && (value.direction === "ltr" || value.direction === "rtl") && typeof value.vertical === "boolean" && typeof value.infinite === "boolean" && isFiniteNumber(value.threshold) && isString(value.chapterId);
}
function isScrollTrackingConfig(value) {
  return isRecord13(value) && typeof value.infiniteScrollEnabled === "boolean" && isFiniteNumber(value.loadThreshold) && isFiniteNumber(value.doneThreshold);
}
function isUiConfig(value) {
  return isRecord13(value) && typeof value.bionicEnabled === "boolean" && typeof value.ttsEnabled === "boolean" && isRecord13(value.labels) && isString(value.labels.tts) && isString(value.labels.imageClose);
}
function isPlayerConfig(value) {
  if (!isRecord13(value) || value.mode !== "playback" && value.mode !== "download" || !isRecord13(value.video)) return false;
  const video = value.video;
  if (!isString(video.path) || !isFiniteNumber(video.progress)) return false;
  const supportedType = video.type === void 0 || video.type === "m3u8" || video.type === "mpd" || video.type === "video-file" || video.type === "iframe";
  const validUrl = video.url === void 0 || isString(video.url);
  return supportedType && validUrl && (video.direct !== true || video.type !== void 0 && typeof video.url === "string" && video.url.length > 0);
}
function isString(value) {
  return typeof value === "string";
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/protocol/envelope.ts
var READER_PROTOCOL_VERSION = 1;
var ReaderProtocolError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReaderProtocolError";
  }
};
function parseEnvelope(value, expectedDocumentId) {
  const message = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord14(message)) throw new ReaderProtocolError("Envelope must be an object");
  if (message.protocolVersion !== READER_PROTOCOL_VERSION) {
    throw new ReaderProtocolError(`Unsupported protocol version: ${String(message.protocolVersion)}`);
  }
  if (message.documentId !== expectedDocumentId) {
    throw new ReaderProtocolError("Envelope document id does not match the active document");
  }
  const kind = message.kind;
  if (kind === "boot" || kind === "ready") return message;
  if (kind === "command") {
    requireString(message.requestId, "requestId");
    requireString(message.method, "method");
    return message;
  }
  if (kind === "result") {
    requireString(message.requestId, "requestId");
    if (message.error !== void 0 && !isErrorPayload(message.error)) {
      throw new ReaderProtocolError("Result error must include string code and message fields");
    }
    return message;
  }
  if (kind === "event") {
    requireString(message.method, "method");
    return message;
  }
  if (kind === "cancel") {
    requireString(message.requestId, "requestId");
    return message;
  }
  throw new ReaderProtocolError(`Unsupported envelope kind: ${String(kind)}`);
}
function isRecord14(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new ReaderProtocolError("Envelope contains invalid JSON");
  }
}
function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ReaderProtocolError(`Envelope ${field} must be a non-empty string`);
  }
}
function isErrorPayload(value) {
  return isRecord14(value) && typeof value.code === "string" && typeof value.message === "string";
}

// src/protocol/reader-contract.ts
var READER_COMMANDS = [
  "document.configure",
  "document.patchState",
  "chapter.append",
  "chapter.remove",
  "chapter.reveal",
  "chapter.resetTracking",
  "edit.enter",
  "edit.exit",
  "edit.discard",
  "chapter.setLoadingNext",
  "chapter.setNoMore",
  "scroll.restoreVertical",
  "scroll.byViewport",
  "scroll.seekVertical",
  "scroll.autoStart",
  "scroll.autoStop",
  "scroll.autoStatus",
  "layout.configure",
  "layout.move",
  "layout.seekUnit",
  "layout.seekPercent",
  "layout.reflow",
  "layout.prepareTurn",
  "layout.finishTurn",
  "tts.highlight",
  "tts.clearHighlight",
  "tts.extractText",
  "tts.firstVisibleParagraph",
  "tts.taggedParagraph",
  "selection.read",
  "selection.readAnchor",
  "selection.clear",
  "selection.blur",
  "style.apply",
  "ui.configure",
  "ui.setTtsEnabled",
  "ui.setBionic",
  "ui.refresh",
  "ui.configureNextChapter",
  "scrollTracking.configure",
  "anchors.install",
  "summary.focus",
  "summary.render",
  "summary.remove",
  "feedback.show",
  "feedback.clear",
  "snippet.run"
];
var READER_EVENTS = [
  "layout.positionChanged",
  "scroll.progressPersist",
  "scroll.progressPreview",
  "chapter.visible",
  "navigation.loadNext",
  "gesture.claim",
  "gesture.ready",
  "reader.error",
  "reader.saveVideoProgress",
  "reader.refetch",
  "navigation.next",
  "edit.changed",
  "edit.save",
  "summary.action",
  "scroll.restoreComplete",
  "chapter.appended",
  "tts.toggle",
  "tts.startAtParagraph",
  "tts.startAtTaggedParagraph",
  "chapter.markShort",
  "chapter.retry",
  "feedback.retry",
  "clipboard.copy",
  "media.playLocalVideo",
  "navigation.openNext",
  "navigation.previous",
  "tts.start",
  "tts.pause",
  "tts.resume",
  "tts.stop",
  "scroll.seekPercent",
  "media.download.ready",
  "media.download.progress",
  "media.download.activity",
  "media.download.complete",
  "media.download.error",
  "reader.log"
];
function isReaderCommandName(value) {
  return READER_COMMANDS.includes(value);
}
function isReaderEventName(value) {
  return READER_EVENTS.includes(value);
}

// src/runtime/session.ts
function createRuntimeSession(config, transport) {
  let requestCounter = 0;
  let disposed = false;
  let started = false;
  let bootSent = false;
  let readySent = false;
  let lastError = null;
  const queuedEvents = [];
  const pending = /* @__PURE__ */ new Map();
  const activeCommands = /* @__PURE__ */ new Map();
  const commands = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Map();
  const send = (envelope) => {
    if (disposed) throw new Error("Reader document has been disposed");
    transport.postMessage(JSON.stringify(envelope));
  };
  const flushQueuedEvents = () => {
    while (!disposed && queuedEvents.length > 0) {
      const event = queuedEvents.shift();
      if (event !== void 0) transport.postMessage(event);
    }
    if (disposed) queuedEvents.length = 0;
  };
  const rejectPending = (id, error) => {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    if (item.signal && item.abortListener) item.signal.removeEventListener("abort", item.abortListener);
    item.reject(error);
  };
  const sendResult = (id, value, error) => {
    const result = error ? { protocolVersion: READER_PROTOCOL_VERSION, documentId: config.documentId, kind: "result", requestId: id, error } : { protocolVersion: READER_PROTOCOL_VERSION, documentId: config.documentId, kind: "result", requestId: id, payload: value };
    send(result);
  };
  const dispatchCommand = async (envelope) => {
    const handler2 = commands.get(envelope.method);
    if (!handler2) {
      sendResult(envelope.requestId, void 0, { code: "unsupported_command", message: `Unsupported command: ${envelope.method}` });
      return;
    }
    const controller = new AbortController();
    activeCommands.set(envelope.requestId, controller);
    try {
      const result = await handler2(envelope.payload, controller.signal);
      if (!controller.signal.aborted) sendResult(envelope.requestId, result);
    } catch (error) {
      if (!controller.signal.aborted) sendResult(envelope.requestId, void 0, toErrorPayload(error));
    } finally {
      activeCommands.delete(envelope.requestId);
    }
  };
  const receive = (data) => {
    let envelope;
    try {
      envelope = parseEnvelope(transportData(data), config.documentId);
    } catch (error) {
      lastError = error instanceof Error ? error : new ReaderProtocolError("Invalid native message");
      return;
    }
    if (envelope.kind === "boot") return;
    if (envelope.kind === "result") {
      resolveResult(envelope);
    } else if (envelope.kind === "event") {
      dispatchEvent(envelope);
    } else if (envelope.kind === "command") {
      void dispatchCommand(envelope);
    } else if (envelope.kind === "cancel") {
      cancelCommand(envelope);
    }
  };
  const resolveResult = (envelope) => {
    const item = pending.get(envelope.requestId);
    if (!item) return;
    pending.delete(envelope.requestId);
    if (item.signal && item.abortListener) item.signal.removeEventListener("abort", item.abortListener);
    if (envelope.error) {
      const error = new Error(envelope.error.message);
      error.name = envelope.error.code;
      item.reject(error);
    } else {
      item.resolve(envelope.payload);
    }
  };
  const dispatchEvent = (envelope) => {
    for (const listener of listeners.get(envelope.method) ?? []) listener(envelope.payload);
  };
  const cancelCommand = (envelope) => {
    activeCommands.get(envelope.requestId)?.abort();
  };
  transport.onmessage = (event) => receive(event.data);
  return {
    get pendingRequestCount() {
      return pending.size;
    },
    get lastProtocolError() {
      return lastError;
    },
    boot() {
      if (disposed) throw new Error("Reader document has been disposed");
      if (bootSent) return;
      bootSent = true;
      send({ protocolVersion: READER_PROTOCOL_VERSION, documentId: config.documentId, kind: "boot" });
    },
    async start(initializers = []) {
      if (disposed) throw new Error("Reader document has been disposed");
      if (started) return;
      started = true;
      this.boot();
      await Promise.all(initializers.map((initialize) => initialize()));
      if (disposed) throw abortError();
      if (!disposed) {
        send({ protocolVersion: READER_PROTOCOL_VERSION, documentId: config.documentId, kind: "ready" });
        readySent = true;
        flushQueuedEvents();
      }
    },
    emit(name, payload) {
      if (disposed) throw new Error("Reader document has been disposed");
      if (!isReaderEventName(name)) throw new TypeError(`Unsupported reader event: ${name}`);
      const envelope = {
        protocolVersion: READER_PROTOCOL_VERSION,
        documentId: config.documentId,
        kind: "event",
        method: name,
        payload
      };
      if (!readySent && !(bootSent && name === "reader.error")) queuedEvents.push(JSON.stringify(envelope));
      else send(envelope);
    },
    request(name, payload, signal) {
      if (disposed) return Promise.reject(new Error("Reader document has been disposed"));
      if (signal?.aborted) return Promise.reject(abortError());
      const requestId = `${config.documentId}:${++requestCounter}`;
      return new Promise((resolve, reject) => {
        const item = { resolve, reject };
        if (signal) {
          item.signal = signal;
          item.abortListener = () => {
            if (!pending.has(requestId)) return;
            rejectPending(requestId, abortError());
            send({ protocolVersion: READER_PROTOCOL_VERSION, documentId: config.documentId, kind: "cancel", requestId });
          };
          signal.addEventListener("abort", item.abortListener, { once: true });
        }
        pending.set(requestId, item);
        send({ protocolVersion: READER_PROTOCOL_VERSION, documentId: config.documentId, kind: "command", requestId, method: name, payload });
      });
    },
    onEvent(name, listener) {
      const group = listeners.get(name) ?? /* @__PURE__ */ new Set();
      group.add(listener);
      listeners.set(name, group);
      return () => {
        group.delete(listener);
        if (group.size === 0) listeners.delete(name);
      };
    },
    registerCommand(name, handler2) {
      if (!isReaderCommandName(name)) throw new TypeError(`Unsupported reader command: ${name}`);
      if (commands.has(name)) throw new Error(`Reader command already registered: ${name}`);
      commands.set(name, handler2);
      return () => {
        if (commands.get(name) === handler2) commands.delete(name);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      transport.onmessage = null;
      for (const id of pending.keys()) rejectPending(id, new Error("Reader document has been disposed"));
      for (const controller of activeCommands.values()) controller.abort();
      activeCommands.clear();
      listeners.clear();
      commands.clear();
      queuedEvents.length = 0;
    }
  };
}
function transportData(data) {
  if (isRecord14(data) && "data" in data) return data.data;
  return data;
}
function toErrorPayload(error) {
  if (error instanceof Error) return { code: error.name || "command_failed", message: error.message };
  return { code: "command_failed", message: String(error) };
}
function abortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

// src/runtime/host.ts
function createRuntimeHost({ root, config, transport }) {
  const session = createRuntimeSession(config, transport);
  let currentConfig = config;
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("Reader root is not attached to a browser document");
  const nativeFetch = view.fetch.bind(view);
  const browserRequest = view.Request;
  const browserHeaders = view.Headers;
  const proxyUnavailableError = "This plugin cannot use window.nekori.fetch because the local proxy is disabled. Go to Settings > Advanced > Novel WebView, enable Allow local proxy API, then reopen the reader.";
  const localListeners = /* @__PURE__ */ new Map();
  const cleanups = /* @__PURE__ */ new Set();
  const context = {
    get documentId() {
      return currentConfig.documentId;
    },
    get mode() {
      return currentConfig.mode;
    },
    get novel() {
      return currentConfig.novel;
    },
    get chapter() {
      return currentConfig.chapter;
    },
    get nextChapter() {
      return currentConfig.nextChapter;
    },
    get chapters() {
      return currentConfig.chapters;
    },
    get runtime() {
      return currentConfig.runtime;
    },
    get strings() {
      return currentConfig.strings;
    },
    get ui() {
      return currentConfig.ui;
    },
    get style() {
      return currentConfig.style;
    },
    get layout() {
      return currentConfig.layout;
    },
    get player() {
      return currentConfig.player;
    },
    get sourceBaseUrl() {
      return currentConfig.context?.sourceBaseUrl;
    },
    get novelId() {
      return currentConfig.context?.novelId ?? currentConfig.novel.id;
    },
    get chapterId() {
      return currentConfig.context?.chapterId ?? currentConfig.chapter.id;
    },
    get sourceId() {
      return currentConfig.context?.sourceId;
    }
  };
  const events = {
    subscribe(name, listener) {
      const nativeUnsubscribe = session.onEvent(name, listener);
      const listeners = localListeners.get(name) ?? /* @__PURE__ */ new Set();
      listeners.add(listener);
      localListeners.set(name, listeners);
      return () => {
        nativeUnsubscribe();
        listeners.delete(listener);
        if (listeners.size === 0) localListeners.delete(name);
      };
    }
  };
  const notifyStateChanged = (event) => {
    const payload = { runtime: currentConfig.runtime, ...event === void 0 ? {} : { event } };
    for (const listener of localListeners.get("document.stateChanged") ?? []) listener(payload);
  };
  session.registerCommand("document.configure", (payload) => {
    const nextConfig = parseReaderConfig(payload);
    if (nextConfig.documentId !== currentConfig.documentId) throw new TypeError("Cannot replace the active document identity");
    currentConfig = nextConfig;
    notifyStateChanged("document.configure");
    return context;
  });
  session.registerCommand("document.patchState", (payload) => {
    currentConfig = applyRuntimePatch(currentConfig, payload);
    notifyStateChanged(isRecord15(payload) && typeof payload.event === "string" ? payload.event : "document.patchState");
    return currentConfig.runtime;
  });
  return {
    get root() {
      return root.ownerDocument.querySelector("[data-nekori-reader-root], #nekori-reader") ?? root.ownerDocument.body ?? root;
    },
    get config() {
      return currentConfig;
    },
    context,
    events,
    get strings() {
      return currentConfig.strings;
    },
    get chapter() {
      return currentConfig.chapter;
    },
    get nextChapter() {
      return currentConfig.nextChapter;
    },
    emit(name, payload) {
      session.emit(name, payload);
    },
    request(name, payload, signal) {
      return session.request(name, payload, signal);
    },
    onCommand(name, handler2) {
      return session.registerCommand(name, handler2);
    },
    onDispose(cleanup) {
      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    fetch(input, init) {
      const endpoint = currentConfig.proxyEndpoint;
      if (!endpoint) {
        session.emit("reader.error", { message: proxyUnavailableError });
        return Promise.reject(new Error(proxyUnavailableError));
      }
      const inputRequest = input instanceof browserRequest ? input : null;
      const requestUrl = inputRequest?.url ?? String(input);
      const incomingHeaders = init?.headers ?? inputRequest?.headers;
      const forwardedHeaders = new browserHeaders();
      new browserHeaders(incomingHeaders).forEach((value, name) => {
        forwardedHeaders.set(`x-ln-forward-header-${name.toLowerCase()}`, value);
      });
      const proxyUrl = `${endpoint}?url=${encodeURIComponent(requestUrl)}`;
      if (inputRequest) {
        const sourceRequest = new browserRequest(inputRequest, init);
        const proxiedRequest = new browserRequest(proxyUrl, sourceRequest);
        for (const name of Array.from(proxiedRequest.headers.keys())) proxiedRequest.headers.delete(name);
        forwardedHeaders.forEach((value, name) => proxiedRequest.headers.set(name, value));
        return nativeFetch(proxiedRequest);
      }
      return nativeFetch(proxyUrl, { ...init, headers: forwardedHeaders });
    },
    fetchNative(input, init) {
      return nativeFetch(input, init);
    },
    boot() {
      session.boot();
    },
    start(initializers) {
      return session.start(initializers);
    },
    dispose() {
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
      localListeners.clear();
      session.dispose();
    }
  };
}
function applyRuntimePatch(config, value) {
  if (!isRecord15(value) || !isRecord15(value.patch)) throw new TypeError("Invalid document.patchState payload");
  const patch = value.patch;
  const runtime = {
    editing: booleanOr(patch.editing ?? patch.isEditMode, config.runtime.editing),
    infinite: booleanOr(patch.infinite ?? patch.isInfiniteScroll, config.runtime.infinite),
    textSelectionBlocked: booleanOr(patch.textSelectionBlocked, config.runtime.textSelectionBlocked),
    forcedLowercase: booleanOr(patch.forcedLowercase, config.runtime.forcedLowercase),
    menuVisible: booleanOr(patch.menuVisible, config.runtime.menuVisible),
    immersive: booleanOr(patch.immersive, config.runtime.immersive),
    ttsState: ttsStateOr(patch.ttsState, config.runtime.ttsState),
    loadingChapter: booleanOr(patch.loadingChapter, config.runtime.loadingChapter),
    loadingNext: booleanOr(patch.loadingNext, config.runtime.loadingNext),
    noMoreChapters: booleanOr(patch.noMoreChapters, config.runtime.noMoreChapters)
  };
  return { ...config, runtime };
}
function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function ttsStateOr(value, fallback) {
  return value === "playing" || value === "paused" || value === "stopped" || value === "starting" ? value : fallback;
}
function isRecord15(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export {
  READER_PROTOCOL_VERSION,
  ReaderConfigError,
  ReaderProtocolError,
  createReader,
  createRuntimeHost,
  parseEnvelope,
  parseReaderConfig,
  readReaderConfig
};
