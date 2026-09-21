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
    syncLightboxObserverTarget();
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
    // 路由切换时同步一次 lightbox 状态，避免残留自动折叠标记。
    scheduleLightboxAutoCollapseSync();
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

// Discourse 图片查看器（Magnific Popup / PhotoSwipe / d-lightbox）。
// 面板 z-index 极高，展开时会挡住图片层，因此在查看器打开时自动收缩。
function lightboxOpenGraceMs() {
  return 900;
}

function setupLightboxAutoCollapse() {
  if (lightboxListenersBound) {
    return;
  }
  lightboxListenersBound = true;

  // 点击 lightbox 链接时立刻收缩，避免等 MutationObserver 晚一拍。
  document.addEventListener("click", onLightboxTriggerClick, true);
  document.addEventListener("keydown", onLightboxDocumentKeyDown, true);

  syncLightboxObserverTarget();
  scheduleLightboxAutoCollapseSync();

  LDSV.registerCleanup(() => {
    lightboxListenersBound = false;
    stopLightboxObserver();
    if (lightboxSyncFrame) {
      window.cancelAnimationFrame(lightboxSyncFrame);
      lightboxSyncFrame = 0;
    }
    if (lightboxGraceTimer) {
      window.clearTimeout(lightboxGraceTimer);
      lightboxGraceTimer = null;
    }
    document.removeEventListener("click", onLightboxTriggerClick, true);
    document.removeEventListener("keydown", onLightboxDocumentKeyDown, true);
    clearLightboxAutoCollapse();
  });
}

// 整页 DOM 观察器只在话题页且面板展开时启用；折叠或离开话题页立即断开，
// 否则插件自身的每帧渲染都会反复唤醒观察器并触发强制同步布局。
function syncLightboxObserverTarget() {
  const panel = getPanel();
  // 面板展开时需要感知 lightbox 开合；此外在「已被 lightbox 自动折叠、等待恢复」
  // 期间也必须继续观察，否则用户关闭查看器后无法自动展开。
  const shouldObserve = Boolean(
    panel &&
    !panel.hidden &&
    isTopicPage() &&
    (!state.collapsed || lightboxAutoCollapsed)
  );

  if (shouldObserve) {
    startLightboxObserver();
    return;
  }

  stopLightboxObserver();
}

function startLightboxObserver() {
  if (lightboxObserver) {
    return;
  }

  const observeTarget = document.body || document.documentElement;
  if (!observeTarget) {
    return;
  }

  lightboxObserver = new MutationObserver(onLightboxDomMutations);
  lightboxObserver.observe(observeTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "open", "aria-hidden", "hidden"]
  });
}

function stopLightboxObserver() {
  if (!lightboxObserver) {
    return;
  }

  lightboxObserver.disconnect();
  lightboxObserver = null;
}

function clearLightboxAutoCollapse() {
  lightboxAutoCollapsed = false;
  lightboxSeenOpen = false;
  lightboxAwaitingOpenUntil = 0;
}

function onLightboxDomMutations(mutations) {
  const panel = getPanel();

  for (const mutation of mutations) {
    // 插件面板自身的渲染不属于 lightbox 信号，跳过可省掉后续全部判断。
    if (panel && panel.contains(mutation.target)) {
      continue;
    }

    if (mutation.type === "childList") {
      if (lightboxNodesRelevant(mutation.addedNodes) || lightboxNodesRelevant(mutation.removedNodes)) {
        scheduleLightboxAutoCollapseSync();
        return;
      }
      continue;
    }

    if (mutation.type === "attributes" && isLightboxishElement(mutation.target)) {
      scheduleLightboxAutoCollapseSync();
      return;
    }
  }
}

function lightboxNodesRelevant(nodeList) {
  for (const node of nodeList) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }
    if (isLightboxishElement(node)) {
      return true;
    }
    if (node.querySelector?.(".mfp-wrap, .mfp-bg, .mfp-container, .pswp, .d-lightbox, #d-lightbox, [class*='d-lightbox']")) {
      return true;
    }
  }
  return false;
}

function isLightboxishElement(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  if (element === document.body || element === document.documentElement) {
    return true;
  }

  const className = typeof element.className === "string" ? element.className : "";
  if (
    className.includes("mfp-") ||
    className.includes("pswp") ||
    className.includes("lightbox") ||
    className.includes("d-lightbox")
  ) {
    return true;
  }

  const id = element.id || "";
  return id === "d-lightbox" || id.includes("lightbox");
}

function onLightboxTriggerClick(event) {
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const trigger = event.target.closest?.(
    "a.lightbox, .lightbox-wrapper a, .cooked a.lightbox, a[data-download-href].lightbox"
  );
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

  if (collapsePanel()) {
    const graceMs = lightboxOpenGraceMs();
    lightboxAutoCollapsed = true;
    lightboxSeenOpen = false;
    lightboxAwaitingOpenUntil = performance.now() + graceMs;
    // 折叠后仍需观察 lightbox 是否挂载，关闭查看器时才能恢复展开。
    syncLightboxObserverTarget();
    // 给 lightbox 挂载留一点时间；超时仍未打开则恢复展开。
    if (lightboxGraceTimer) {
      window.clearTimeout(lightboxGraceTimer);
    }
    lightboxGraceTimer = window.setTimeout(() => {
      lightboxGraceTimer = null;
      scheduleLightboxAutoCollapseSync();
    }, graceMs + 50);
  }
}

function onLightboxDocumentKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }
  // Escape 关闭图片查看后同步一次，尽快恢复展开。
  scheduleLightboxAutoCollapseSync();
}

function scheduleLightboxAutoCollapseSync() {
  if (lightboxSyncFrame) {
    return;
  }
  lightboxSyncFrame = window.requestAnimationFrame(() => {
    lightboxSyncFrame = 0;
    syncLightboxAutoCollapse();
  });
}

function syncLightboxAutoCollapse() {
  const panel = getPanel();
  const lightboxOpen = isDiscourseLightboxOpen();

  if (!panel || panel.hidden || !isTopicPage()) {
    if (lightboxAutoCollapsed && !lightboxOpen && canRestoreFromLightbox()) {
      clearLightboxAutoCollapse();
    }
    return;
  }

  if (lightboxOpen) {
    lightboxSeenOpen = true;
    lightboxAwaitingOpenUntil = 0;
    if (!state.collapsed && collapsePanel()) {
      lightboxAutoCollapsed = true;
    }
    return;
  }

  if (!lightboxAutoCollapsed || !canRestoreFromLightbox()) {
    return;
  }

  clearLightboxAutoCollapse();
  if (state.collapsed) {
    expandPanel();
  }
}

function canRestoreFromLightbox() {
  // 只有“确实打开过”或“等待挂载超时”后，才允许自动展开，避免点击后 DOM 尚未出现时误恢复。
  return lightboxSeenOpen || performance.now() >= lightboxAwaitingOpenUntil;
}

function isDiscourseLightboxOpen() {
  // PhotoSwipe / Magnific 有时只在 body 上挂状态 class，先判这条零布局成本的路径。
  const body = document.body;
  if (
    body &&
    (body.classList.contains("mfp-zoom-out-cur") ||
      body.classList.contains("pswp-open") ||
      body.classList.contains("lightbox-open"))
  ) {
    return true;
  }

  const selectors = [
    ".mfp-wrap.mfp-ready",
    ".mfp-bg.mfp-ready",
    ".mfp-wrap",
    ".pswp--open",
    ".pswp.pswp--open",
    ".d-lightbox",
    "#d-lightbox",
    "dialog.d-lightbox[open]",
    ".d-modal.d-lightbox",
    '[class*="d-lightbox"][role="dialog"]'
  ];

  for (const selector of selectors) {
    const matches = document.querySelectorAll(selector);
    for (const element of matches) {
      if (isLightboxElementVisible(element)) {
        return true;
      }
    }
  }

  return false;
}

function isLightboxElementVisible(element) {
  if (!element || element.hidden) {
    return false;
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (element.tagName === "DIALOG" && !element.open) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
