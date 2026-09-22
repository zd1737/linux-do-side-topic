"use strict";

function formatNumber(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(preferredLocale(), {
    notation: number >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(number);
}

function preferredLocale() {
  return document.documentElement.lang || navigator.language || "zh-CN";
}

function formatRelativeDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return LDSV.messages.relativeTime.justNow;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return LDSV.messages.relativeTime.minutes(minutes);
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return LDSV.messages.relativeTime.hours(hours);
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return LDSV.messages.relativeTime.days(days);
  }

  return date.toLocaleDateString(preferredLocale(), {
    month: "numeric",
    day: "numeric"
  });
}

function activityTitle(topic) {
  const created = formatFullDate(topic.created_at);
  const bumped = formatFullDate(topic.bumped_at || topic.last_posted_at);
  if (created && bumped && created !== bumped) {
    return LDSV.messages.topic.createdAndActivity(created, bumped);
  }
  if (created) {
    return LDSV.messages.topic.created(created);
  }
  return bumped ? LDSV.messages.topic.activity(bumped) : "";
}

function formatFullDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(preferredLocale());
}

function sanitizeTrustedTopicTitle(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("base, script, style, iframe, object, embed, link, meta")
    .forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      if (
        /^on/i.test(attribute.name) ||
        attributeName === "style" ||
        isUnsafeUrlAttribute(attributeName, attribute.value)
      ) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  expandEmojiShortcodes(template.content);
  return template.innerHTML || LDSV.messages.topic.untitled;
}

function expandEmojiShortcodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => shouldExpandEmojiTextNode(node)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT
  });
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(replaceEmojiShortcodesInTextNode);
}

function shouldExpandEmojiTextNode(node) {
  if (!/:([\w+-]+(?::t[1-6])?):/.test(node.nodeValue || "")) {
    return false;
  }

  const parent = node.parentElement;
  return !parent || !parent.closest("script, style, textarea, code, pre, img.emoji");
}

function replaceEmojiShortcodesInTextNode(node) {
  const text = node.nodeValue || "";
  const fragment = document.createDocumentFragment();
  const regex = /:([\w+-]+(?::t[1-6])?):/g;
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    fragment.appendChild(createEmojiImage(match[0], match[1]));
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  node.replaceWith(fragment);
}

function createEmojiImage(shortcode, code) {
  const img = document.createElement("img");
  img.src = emojiUrlForCode(code);
  img.title = shortcode;
  img.className = "emoji";
  img.alt = shortcode;
  img.dataset.shortcode = shortcode;
  img.loading = "lazy";
  img.width = 20;
  img.height = 20;
  return img;
}

function installTopicTitleEmojiFallbacks(root) {
  root.querySelectorAll("img.emoji[data-shortcode]").forEach((img) => {
    if (img.dataset.ldsvEmojiFallbackBound) {
      return;
    }

    img.dataset.ldsvEmojiFallbackBound = "true";
    img.addEventListener("error", onEmojiImageError, { once: true });
    if (img.complete && img.naturalWidth === 0) {
      onEmojiImageError({ currentTarget: img });
    }
  });
}

function onEmojiImageError(event) {
  const img = event.currentTarget;
  img.replaceWith(document.createTextNode(img.dataset.shortcode || ""));
}

function emojiUrlForCode(code) {
  const normalizedCode = normalizeEmojiCode(code);
  const settings = getDiscourseSiteSettings();
  const emojiSet = settings.emoji_set || "twitter";
  return `${EMOJI_CDN_BASE_URL}/${emojiSet}/${normalizedCode}.png?v=15`;
}

function normalizeEmojiCode(code) {
  const match = String(code || "").match(/^(.+?)(?::t([1-6]))?$/);
  if (!match) {
    return code;
  }
  return match[2] ? `${match[1]}/${match[2]}` : match[1];
}

function getDiscourseSiteSettings() {
  return window.__preloadedData?.site?.site_settings ||
    window.__preloadedData?.siteSettings ||
    window.Discourse?.SiteSettings ||
    window.PreloadStore?.get?.("site")?.site_settings ||
    {};
}

function isUnsafeUrlAttribute(name, value) {
  if (!["href", "src", "xlink:href", "action", "formaction"].includes(name)) {
    return false;
  }

  const text = String(value || "").trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return /^(?:javascript|data|vbscript):/i.test(text);
}

function escapeHTML(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function decodeHTML(value) {
  const div = document.createElement("div");
  div.innerHTML = value;
  return div.textContent || div.innerText || value;
}

function normalizeColor(value, fallback) {
  const color = String(value || fallback).replace(/^#/, "");
  return `#${/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? color : fallback}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function slugifyPath(value) {
  return String(value || "")
    .split("/")
    .map((part) => encodePathSegment(part.trim() || "category"))
    .join("/");
}

function categorySlugPath(category, seen = new Set()) {
  const id = normalizeNullableNumber(category?.id);
  if (!category || id == null || seen.has(id)) {
    return "";
  }

  seen.add(id);
  const parentId = normalizeNullableNumber(category.parent_category_id);
  const parent = parentId == null ? null : getCategoryById(parentId);
  const parentPath = parent ? categorySlugPath(parent, seen) : "";
  const slug = category.slug || category.name || `category-${id}`;
  return [parentPath, encodePathSegment(slug)].filter(Boolean).join("/");
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value || "").trim());
}

function decodePath(value) {
  return String(value || "")
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
}

function cssSafeClass(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function getCurrentTopicId() {
  return topicIdFromPath(window.location.pathname);
}

function topicIdFromPath(pathname) {
  const match = pathname.match(/\/[tn]\/(?:[^/]+\/)?(\d+)/);
  return match ? Number(match[1]) : null;
}

function currentFeed() {
  return FEEDS[state.feed] ? state.feed : DEFAULT_STATE.feed;
}

function findTopicById(topicId) {
  const numericTopicId = Number(topicId);
  if (!Number.isFinite(numericTopicId)) {
    return null;
  }

  const indexed = topicIndexById.get(numericTopicId);
  if (indexed) {
    return indexed;
  }

  // 索引尚未建立（话题列表还没赋值）时退回线性查找，保持行为一致。
  return topicIndexById.size === 0
    ? topics.find((topic) => Number(topic.id) === numericTopicId) || null
    : null;
}

function findTopicPositionById(topicId) {
  const numericTopicId = Number(topicId);
  if (!Number.isFinite(numericTopicId)) {
    return -1;
  }

  const position = topicArrayIndexById.get(numericTopicId);
  return position == null ? -1 : position;
}

async function fetchJson(url, options = {}) {
  const {
    retries = 0,
    retryDelay = 250,
    ...requestOptions
  } = options;
  const targetUrl = new URL(url, window.location.origin).toString();
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(targetUrl, {
        ...requestOptions,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(requestOptions.headers || {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (requestOptions.signal?.aborted || attempt >= retries) {
        throw error;
      }
      await delay(retryDelay * 2 ** attempt, requestOptions.signal);
    }
  }

  throw lastError || new Error("Request failed");
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function getPanel() {
  return document.getElementById(PANEL_ID);
}

function getDiscourseRoot() {
  return document.querySelector("#main");
}

function waitForDiscourseRoot() {
  const root = getDiscourseRoot();
  if (root) {
    return Promise.resolve(root);
  }

  return new Promise((resolve) => {
    let settled = false;
    const observer = new MutationObserver(() => {
      const nextRoot = getDiscourseRoot();
      if (nextRoot) {
        done(nextRoot);
      }
    });
    const done = (nextRoot) => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      resolve(nextRoot);
    };

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const fallbackTimer = window.setTimeout(() => {
      done(getDiscourseRoot());
    }, 5000);

    LDSV.registerCleanup(() => {
      settled = true;
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    });
  });
}

function syncPanelVisibility() {
  const panel = getPanel();
  if (panel) {
    const shouldShow = isTopicPage();
    selectedTopicId = shouldShow ? getCurrentTopicId() : null;
    panel.hidden = !shouldShow;
    syncOverlayObserverTarget();
    updateSelectedTopicRows();
    if (shouldShow && topics.length === 0) {
      loadTopics();
    } else if (shouldShow) {
      scheduleTopicPoll(1000);
    } else {
      abortTopicPoll();
    }
  }
}

function saveStateDebounced() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveState(state), 150);
}

async function loadState() {
  const storage = LDSV.getExtensionStorageLocal();
  try {
    if (storage) {
      const result = await storage.get(STORAGE_KEY);
      return result[STORAGE_KEY] || {};
    }

    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    LDSV.reportError("load state", error);
    return {};
  }
}

async function saveState(nextState) {
  const saved = LDSV.serializeState(nextState);
  const storage = LDSV.getExtensionStorageLocal();
  if (storage) {
    try {
      await storage.set({ [STORAGE_KEY]: saved });
    } catch (error) {
      LDSV.reportError("save state", error);
    }
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    LDSV.reportError("save state", error);
  }
}

function observeDiscourseNavigation() {
  let lastUrl = window.location.href;
  const rerenderWhenUrlChanges = () => {
    if (window.location.href === lastUrl) {
      return;
    }
    lastUrl = window.location.href;
    syncPanelVisibility();
    if (isTopicPage()) {
      scheduleTopicPoll(1000);
    }
    // 路由切换时同步一次浮层状态，避免残留自动折叠标记。
    scheduleOverlayAutoCollapseSync();
  };

  if (!navigationHistoryPatches) {
    navigationHistoryPatches = {};
  }
  ["pushState", "replaceState"].forEach((method) => {
    if (!navigationHistoryPatches[method]) {
      navigationHistoryPatches[method] = history[method];
    }
    const original = navigationHistoryPatches[method];
    history[method] = function patchedHistoryMethod() {
      const result = original.apply(this, arguments);
      window.setTimeout(rerenderWhenUrlChanges, 0);
      return result;
    };
  });

  const onResize = () => {
    const panel = getPanel();
    if (panel) {
      applyPanelState(panel);
      saveStateDebounced();
    }
  };

  window.addEventListener("popstate", rerenderWhenUrlChanges);
  navigationFallbackTimer = window.setInterval(rerenderWhenUrlChanges, NAVIGATION_FALLBACK_INTERVAL);
  window.addEventListener("resize", onResize);
  LDSV.registerCleanup(() => {
    window.removeEventListener("popstate", rerenderWhenUrlChanges);
    window.removeEventListener("resize", onResize);
    if (navigationFallbackTimer) {
      window.clearInterval(navigationFallbackTimer);
      navigationFallbackTimer = null;
    }
    if (navigationHistoryPatches) {
      ["pushState", "replaceState"].forEach((method) => {
        if (navigationHistoryPatches[method]) {
          history[method] = navigationHistoryPatches[method];
        }
      });
      navigationHistoryPatches = null;
    }
  });
}

// 面板 z-index 极高，会在图片查看器（Magnific Popup / PhotoSwipe / d-lightbox）
// 或站内搜索弹框打开时挡住它们，因此这些浮层打开时自动收缩面板。
// 搜索弹框关闭后容器仍留在 DOM 中，所以检测统一看可见性，而不是存在性。
LDSV.overlayWatch = Object.freeze({
  // body 上的状态 class：零布局成本的快速路径。
  bodyClasses: Object.freeze([
    "mfp-zoom-out-cur",
    "pswp-open",
    "lightbox-open"
  ]),
  openSelectors: Object.freeze([
    // 图片查看器：Magnific Popup / PhotoSwipe / d-lightbox。
    ".mfp-wrap",
    ".mfp-bg",
    ".pswp--open",
    ".d-lightbox",
    "#d-lightbox",
    "dialog.d-lightbox[open]",
    ".d-modal.d-lightbox",
    '[class*="d-lightbox"][role="dialog"]',
    // 站内搜索弹框：仅在搜索菜单可见时才渲染。
    ".search-menu-panel",
    // 账户/通知菜单：面板只在菜单展开时渲染。
    // 注意不能写 .user-menu-panel —— 那是常驻头部的头像按钮自身的 class。
    ".user-menu-dropdown-wrapper .menu-panel.user-menu",
    // 聊天抽屉：只认展开态，最小化成窄条时不抢占面板。
    ".chat-drawer.is-expanded"
  ]),
  triggerSelectors: Object.freeze([
    "a.lightbox",
    ".lightbox-wrapper a",
    ".cooked a.lightbox",
    "a[data-download-href].lightbox"
  ]),
  classMarkers: Object.freeze([
    "mfp-",
    "pswp",
    "lightbox",
    "search-menu",
    "chat-drawer"
  ]),
  idMarkers: Object.freeze(["lightbox", "search-menu"])
});

function overlayOpenGraceMs() {
  return 900;
}

function setupOverlayAutoCollapse() {
  if (overlayListenersBound) {
    return;
  }
  overlayListenersBound = true;

  // 点击图片查看器链接时立刻收缩，避免等 MutationObserver 晚一拍。
  document.addEventListener("click", onOverlayTriggerClick, true);
  document.addEventListener("keydown", onOverlayDocumentKeyDown, true);

  syncOverlayObserverTarget();
  scheduleOverlayAutoCollapseSync();

  LDSV.registerCleanup(() => {
    overlayListenersBound = false;
    stopOverlayObserver();
    if (overlaySyncFrame) {
      window.cancelAnimationFrame(overlaySyncFrame);
      overlaySyncFrame = 0;
    }
    if (overlaySettleTimer) {
      window.clearTimeout(overlaySettleTimer);
      overlaySettleTimer = null;
    }
    overlaySettleAttempts = 0;
    if (overlayGraceTimer) {
      window.clearTimeout(overlayGraceTimer);
      overlayGraceTimer = null;
    }
    document.removeEventListener("click", onOverlayTriggerClick, true);
    document.removeEventListener("keydown", onOverlayDocumentKeyDown, true);
    clearOverlayAutoCollapse();
  });
}

// 整页 DOM 观察器只在「话题页 + 面板可见 +（已展开或正在等浮层关闭）」时启用；
// 其余情况立即断开，否则插件自身的每帧渲染都会反复唤醒观察器并触发强制同步布局。
function syncOverlayObserverTarget() {
  const panel = getPanel();
  const shouldObserve = Boolean(
    panel &&
    !panel.hidden &&
    isTopicPage() &&
    (!state.collapsed || overlayAutoCollapsed)
  );

  if (shouldObserve) {
    startOverlayObserver();
    return;
  }

  stopOverlayObserver();
}

function startOverlayObserver() {
  if (overlayObserver) {
    return;
  }

  const observeTarget = document.body || document.documentElement;
  if (!observeTarget) {
    return;
  }

  overlayObserver = new MutationObserver(onOverlayDomMutations);
  overlayObserver.observe(observeTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "open", "aria-hidden", "hidden", "style"]
  });
}

function stopOverlayObserver() {
  if (!overlayObserver) {
    return;
  }

  overlayObserver.disconnect();
  overlayObserver = null;
}

function clearOverlayAutoCollapse() {
  overlayAutoCollapsed = false;
  overlayAwaitingOpenUntil = 0;
}

// 用户手动折叠/展开面板：本次浮层会话不再自动收缩，也不需要自动恢复。
function suppressOverlayAutoCollapse() {
  overlaySuppressed = getOverlayPresence() === "open";
  clearOverlayAutoCollapse();
}

function onOverlayDomMutations(mutations) {
  const panel = getPanel();

  for (const mutation of mutations) {
    // 插件面板自身的渲染不属于浮层信号，跳过可省掉后续全部判断。
    if (panel && panel.contains(mutation.target)) {
      continue;
    }

    if (mutation.type === "childList") {
      if (overlayNodesRelevant(mutation.addedNodes) || overlayNodesRelevant(mutation.removedNodes)) {
        scheduleOverlayAutoCollapseSync();
        return;
      }
      continue;
    }

    if (mutation.type === "attributes" && isOverlayElement(mutation.target)) {
      scheduleOverlayAutoCollapseSync();
      return;
    }
  }
}

function overlayNodesRelevant(nodeList) {
  const selector = LDSV.overlayWatch.openSelectors.join(", ");
  for (const node of nodeList) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }
    if (isOverlayElement(node) || node.matches?.(selector) || node.querySelector?.(selector)) {
      return true;
    }
  }

  return false;
}

function isOverlayElement(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (element === document.body || element === document.documentElement) {
    return true;
  }

  const className = typeof element.className === "string" ? element.className : "";
  if (LDSV.overlayWatch.classMarkers.some((marker) => className.includes(marker))) {
    return true;
  }

  const id = element.id || "";
  return LDSV.overlayWatch.idMarkers.some((marker) => id.includes(marker));
}

function onOverlayTriggerClick(event) {
  // 兜底：面板外的每次点击都开启一轮判定窗口。
  // 站内搜索弹框复用已有容器时，出现与消失都可能不产生已订阅的 DOM 变更，
  // 只靠观察器会漏判，所以在窗口内按固定间隔连判几次。
  if (event.target?.closest?.(`#${PANEL_ID}`) == null) {
    watchOverlayAfterClick();
  }
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const trigger = event.target.closest?.(LDSV.overlayWatch.triggerSelectors.join(", "));
  if (!trigger) {
    return;
  }

  // 只在话题页、面板展开时处理；本插件面板内的点击忽略。
  if (!isTopicPage() || state.collapsed) {
    return;
  }
  if (event.target.closest?.(`#${PANEL_ID}`)) {
    return;
  }

  const graceMs = overlayOpenGraceMs();
  // 先置位再折叠：折叠过程会同步观察器开关，标志位必须已经是 true。
  overlayAutoCollapsed = true;
  overlayAwaitingOpenUntil = performance.now() + graceMs;
  collapsePanel();

  // 给浮层挂载留一点时间；超时仍未打开则恢复展开。
  if (overlayGraceTimer) {
    window.clearTimeout(overlayGraceTimer);
  }
  overlayGraceTimer = window.setTimeout(() => {
    overlayGraceTimer = null;
    scheduleOverlayAutoCollapseSync();
  }, graceMs + 50);
}

function onOverlayDocumentKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }
  // Escape 关闭浮层后同步一次，尽快恢复展开。
  scheduleOverlayAutoCollapseSync();
}

// 单次判定：不推进判定窗口的计数，用于「窗口在跑但又有新信号」时立即补判。
function requestOverlaySyncNow() {
  if (overlaySyncFrame) {
    return;
  }

  overlaySyncFrame = window.requestAnimationFrame(() => {
    overlaySyncFrame = 0;
    syncOverlayAutoCollapse(false);
  });
}

function scheduleOverlayAutoCollapseSync() {
  // 判定窗口已经在跑时先立即补判一次，窗口本身继续按间隔重试。
  if (overlaySettleTimer) {
    requestOverlaySyncNow();
    return;
  }

  if (overlaySyncFrame) {
    return;
  }

  overlaySyncFrame = window.requestAnimationFrame(() => {
    overlaySyncFrame = 0;
    overlaySettleAttempts = 0;
    stepOverlaySettle(false);
  });
}

// 面板外点击后的判定窗口：浮层可能在点击后几十到几百毫秒才出现，
// 而且不一定产生已订阅的 DOM 变更，因此在窗口内按固定间隔连判。
function watchOverlayAfterClick() {
  if (overlaySettleTimer) {
    requestOverlaySyncNow();
    return;
  }

  if (overlaySyncFrame) {
    return;
  }

  overlaySyncFrame = window.requestAnimationFrame(() => {
    overlaySyncFrame = 0;
    overlaySettleAttempts = 0;
    stepOverlaySettle(true);
  });
}

function overlaySettleIntervalMs() {
  return 150;
}

// 判定窗口总时长与浮层挂载宽限时间一致，超出即认为本轮不再有新浮层。
function overlaySettleMaxAttempts() {
  return Math.max(1, Math.ceil(overlayOpenGraceMs() / overlaySettleIntervalMs()));
}

function stepOverlaySettle(isWatchWindow) {
  overlaySettleAttempts += 1;
  const isFinal = overlaySettleAttempts >= overlaySettleMaxAttempts();
  const pending = syncOverlayAutoCollapse(isFinal);

  if (isFinal || (!pending && !isWatchWindow)) {
    overlaySettleAttempts = 0;
    return;
  }

  overlaySettleTimer = window.setTimeout(() => {
    overlaySettleTimer = null;
    stepOverlaySettle(isWatchWindow);
  }, overlaySettleIntervalMs());
}

function syncOverlayAutoCollapse(isFinal) {
  const panel = getPanel();
  const presence = getOverlayPresence();

  if (!panel || panel.hidden || !isTopicPage()) {
    overlaySuppressed = false;
    if (overlayAutoCollapsed && presence === "closed" && canRestoreFromOverlay()) {
      clearOverlayAutoCollapse();
      if (state.collapsed) {
        expandPanel();
      }
    }
    return false;
  }

  // 浮层元素已经插入但还没显示出来（入场动画、异步定位）：
  // 本轮先不动手，交给判定窗口继续重试，避免过早当成「已关闭」而恢复展开。
  if (presence === "pending" && !isFinal) {
    return true;
  }

  if (presence === "open") {
    if (state.collapsed) {
      // 面板本来就折叠着，不需要动手；若这次折叠来自我们，记下以便关闭时恢复。
      if (overlayAutoCollapsed) {
        overlayAwaitingOpenUntil = 0;
      }
      return false;
    }

    if (overlaySuppressed) {
      return false;
    }

    // 判定只看「浮层打开 + 面板展开 + 用户未干预」这三个当下事实，
    // 不依赖历史标志位，否则一旦标志位残留就会永远不再收缩。
    // 先置位再折叠：折叠过程会同步观察器开关，标志位必须已经是 true。
    overlayAutoCollapsed = true;
    overlayAwaitingOpenUntil = 0;
    collapsePanel();
    return false;
  }

  // 浮层已关闭，或判定窗口结束仍未显示：结束本次会话，允许下一次打开重新收缩。
  overlaySuppressed = false;

  if (!overlayAutoCollapsed || !canRestoreFromOverlay()) {
    return false;
  }

  clearOverlayAutoCollapse();
  if (state.collapsed) {
    expandPanel();
  }
  return false;
}

function canRestoreFromOverlay() {
  // 只有超过「浮层挂载宽限时间」才允许自动展开：
  // 触发器点击后到浮层真正出现之前不允许误恢复。
  return performance.now() >= overlayAwaitingOpenUntil;
}

// 浮层状态：open=可见，pending=已在 DOM 但尚未显示，closed=不存在。
// 区分 pending 与 closed，是为了不把入场过程中的浮层误判成「已关闭」。
function getOverlayPresence() {
  // body 上的状态 class 零布局成本，先判这条路径。
  const body = document.body;
  if (
    body &&
    LDSV.overlayWatch.bodyClasses.some((className) => body.classList.contains(className))
  ) {
    return "open";
  }

  // 合并成一次查询：逐条选择器各查一遍会对整棵 DOM 反复遍历。
  const matches = document.querySelectorAll(LDSV.overlayWatch.openSelectors.join(", "));
  let pending = false;
  for (const element of matches) {
    if (isOverlayElementVisible(element)) {
      return "open";
    }
    pending = true;
  }

  return pending ? "pending" : "closed";
}

function isOverlayElementVisible(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  // 逐级向上检查：浮层常被祖先用 display/visibility/opacity 隐藏，
  // 只看自身样式会把「已关闭但仍留在 DOM」的弹框误判为打开。
  for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
    if (node.hidden || node.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (node.tagName === "DIALOG" && !node.open) {
      return false;
    }

    const style = window.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    if (node === document.body) {
      break;
    }
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
