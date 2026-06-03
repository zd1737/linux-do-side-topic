(function (root) {
  "use strict";

  const namespace = root.LDSV || {};
  const EXTENSION_CONTEXT_INVALIDATED = "Extension context invalidated";

  function isExtensionContextInvalidated(error) {
    return String(error?.message || error || "").includes(EXTENSION_CONTEXT_INVALIDATED);
  }

  function getRuntimeId() {
    try {
      return root.chrome?.runtime?.id || "";
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        reportError("detect extension context", error);
      }
      return "";
    }
  }

  const isExtensionContext = Boolean(getRuntimeId());

  const MESSAGES = Object.freeze({
    panelAriaLabel: "Linux.do 话题列表",
    feed: Object.freeze({
      latest: "最新",
      new: "新话题",
      unread: "未读",
      top: "排行榜",
      mine: "我的帖子",
      bookmarks: "书签"
    }),
    controls: Object.freeze({
      listType: "列表类型",
      category: "类别",
      tag: "标签",
      clearFilters: "清除筛选",
      refresh: "刷新",
      collapse: "折叠",
      expand: "展开",
      githubRepository: "GitHub 仓库",
      scrollTop: "回到顶部",
      topicListShort: "话",
      topicList: "话题列表",
      quickActions: "列表快捷操作",
      incoming: "查看新/更新话题，点击后添加到列表顶部",
      allCategories: "全部类别",
      allTags: "全部标签"
    }),
    feedSubset: Object.freeze({
      topics: "话题",
      replies: "回复"
    }),
    table: Object.freeze({
      topic: "话题",
      replies: "回复",
      views: "浏览",
      activity: "活动"
    }),
    topic: Object.freeze({
      untitled: "无标题",
      uncategorized: "未分类",
      categoryFallback: (categoryId) => `分类 ${categoryId}`,
      author: (username) => `发帖人 ${username}`,
      replies: (count) => `${count} 个回复`,
      views: (count) => `${count} 次浏览`,
      createdAndActivity: (created, bumped) => `创建：${created}\n活动：${bumped}`,
      created: (created) => `创建：${created}`,
      activity: (bumped) => `活动：${bumped}`
    }),
    status: Object.freeze({
      bookmarked: "已收藏",
      closedArchived: "已关闭并归档",
      closed: "已关闭",
      archived: "已归档",
      pinned: "置顶"
    }),
    relativeTime: Object.freeze({
      justNow: "刚刚",
      minutes: (minutes) => `${minutes} 分`,
      hours: (hours) => `${hours} 小时`,
      days: (days) => `${days} 天`
    }),
    loading: Object.freeze({
      empty: "暂无话题",
      loadFailed: (message) => `加载失败：${message}`,
      incomingFailed: (message) => `加载更新失败：${message}`,
      pullingIncoming: (count) => `正在拉取 ${count || 1} 个新/更新话题并添加到列表顶部`,
      incomingLoadFailedWithRetry: (message) => `加载失败：${message}。点击重试并添加到列表顶部`,
      incomingLoadFailed: (message) => `加载失败：${message}`,
      incomingAvailable: (count) => `有 ${count} 个新/更新话题，点击后拉取并添加到列表顶部`
    }),
    update: Object.freeze({
      available: (version) => `发现新版本 ${version}`,
      openRelease: "发布页",
      ignoreVersion: "忽略此版本",
      currentAndLatest: (current, latest) => `当前版本 ${current || "未知"}，最新版本 ${latest}`
    })
  });

  const STATE_SCHEMA = Object.freeze({
    left: Object.freeze({ default: null }),
    top: Object.freeze({ default: 88 }),
    width: Object.freeze({ default: 380 }),
    height: Object.freeze({ default: 560 }),
    expandedLeft: Object.freeze({ default: null }),
    expandedTop: Object.freeze({ default: null }),
    collapsed: Object.freeze({ default: false }),
    feed: Object.freeze({ default: "latest" }),
    feedSubset: Object.freeze({ default: "" }),
    parentCategoryId: Object.freeze({ default: "" }),
    categoryId: Object.freeze({ default: "" }),
    categorySlug: Object.freeze({ default: "" }),
    tagName: Object.freeze({ default: "" }),
    tagId: Object.freeze({ default: "" }),
    ignoredUpdateVersion: Object.freeze({ default: "" })
  });

  function defaultValue(value) {
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (value && typeof value === "object") {
      return { ...value };
    }
    return value;
  }

  function createDefaultState() {
    return Object.fromEntries(
      Object.entries(STATE_SCHEMA).map(([key, definition]) => [key, defaultValue(definition.default)])
    );
  }

  function serializeState(nextState) {
    const saved = {};
    Object.entries(STATE_SCHEMA).forEach(([key, definition]) => {
      saved[key] = nextState?.[key] ?? defaultValue(definition.default);
    });
    return saved;
  }

  const FEEDS = Object.freeze({
    latest: Object.freeze({ label: MESSAGES.feed.latest, path: "/latest.json" }),
    new: Object.freeze({ label: MESSAGES.feed.new, path: "/new.json" }),
    unread: Object.freeze({ label: MESSAGES.feed.unread, path: "/unread.json" }),
    top: Object.freeze({ label: MESSAGES.feed.top, path: "/top.json" }),
    mine: Object.freeze({ label: MESSAGES.feed.mine, path: "/posted.json" }),
    bookmarks: Object.freeze({ label: MESSAGES.feed.bookmarks, path: "/bookmarks.json" })
  });

  const TOPIC_STATUS_CONFIG = Object.freeze([
    Object.freeze({
      enabled: (topic) => Boolean(topic.bookmarked),
      className: "--bookmarked",
      label: () => MESSAGES.status.bookmarked
    }),
    Object.freeze({
      enabled: (topic) => Boolean(topic.closed && topic.archived),
      className: "--closed --archived",
      label: () => MESSAGES.status.closedArchived
    }),
    Object.freeze({
      enabled: (topic) => Boolean(topic.closed && !topic.archived),
      className: "--closed",
      label: () => MESSAGES.status.closed
    }),
    Object.freeze({
      enabled: (topic) => Boolean(topic.archived && !topic.closed),
      className: "--archived",
      label: () => MESSAGES.status.archived
    }),
    Object.freeze({
      enabled: (topic) => Boolean(topic.pinned || topic.pinned_globally),
      className: "--pinned",
      label: () => MESSAGES.status.pinned
    })
  ]);

  const TOPIC_ROW_CLASSES = Object.freeze([
    Object.freeze({ className: "visited", enabled: (topic) => Boolean(topic.visited) }),
    Object.freeze({ className: "unseen-topic", enabled: (topic) => Boolean(topic.unseen) }),
    Object.freeze({ className: "unread-posts", enabled: (topic) => Boolean(topic.unread_posts) }),
    Object.freeze({ className: "liked", enabled: (topic) => Boolean(topic.liked) }),
    Object.freeze({ className: "archived", enabled: (topic) => Boolean(topic.archived) }),
    Object.freeze({ className: "bookmarked", enabled: (topic) => Boolean(topic.bookmarked) }),
    Object.freeze({ className: "pinned", enabled: (topic) => Boolean(topic.pinned || topic.pinned_globally) }),
    Object.freeze({ className: "closed", enabled: (topic) => Boolean(topic.closed) })
  ]);

  const constants = Object.freeze({
    CONTENT_READY_FLAG: "__linuxDoSideTopicContentReady",
    ACTIVATE_EVENT: "ldsv:extension-activated",
    PANEL_ID: "linux-do-side-topic-view",
    STORAGE_KEY: "linuxDoSideTopicViewState",
    DEFAULT_STATE: Object.freeze(createDefaultState()),
    COLLAPSED_SIZE: 48,
    HEADER_BUTTON_CENTER_Y: 22,
    HEADER_COLLAPSE_BUTTON_RIGHT: 22,
    ALL_FILTER_VALUE: "__all__",
    READ_PROGRESS_EVENT: "ldsv:read-progress",
    MESSAGE_BUS_STATUS_EVENT: "ldsv:message-bus-status",
    TOPIC_TRACKING_EVENT: "ldsv:topic-tracking-state",
    LATEST_RELEASE_MESSAGE: "ldsv:latest-release",
    MESSAGE_BUS_SHARED_ID: "ldsv-message-bus-shared",
    MESSAGE_BUS_BRIDGE_ID: "ldsv-message-bus-bridge",
    NOTIFICATION_LEVEL_TRACKING: 2,
    MUTED_TOPIC_TTL: 60000,
    TOPIC_POLL_VISIBLE_INTERVAL: 60000,
    TOPIC_POLL_HIDDEN_INTERVAL: 180000,
    TOPIC_POLL_ERROR_INTERVAL: 240000,
    NAVIGATION_FALLBACK_INTERVAL: 2500,
    TOPIC_POLL_RETRY_COUNT: 2,
    TOPIC_POLL_RETRY_BASE_DELAY: 500,
    TAG_FILTER_OPTION_LIMIT: 80,
    VIRTUAL_TOPIC_ESTIMATED_STRIDE: 88,
    VIRTUAL_TOPIC_ROW_GAP: 8,
    VIRTUAL_TOPIC_OVERSCAN: 2,
    EMOJI_CDN_BASE_URL: "https://cdn.ldstatic.com/images/emoji",
    GITHUB_REPOSITORY_URL: "https://github.com/zd1737/linux-do-side-topic",
    VERSION_RELEASES_URL: "https://github.com/zd1737/linux-do-side-topic/releases",
    VERSION_CACHE_STORAGE_KEY: "linuxDoSideTopicViewVersionCheck",
    VERSION_CHECK_INTERVAL: 12 * 60 * 60 * 1000,
    FEED_OPTIONS: Object.freeze([
      Object.freeze({ value: "latest", label: MESSAGES.feed.latest }),
      Object.freeze({
        value: "new",
        label: MESSAGES.feed.new,
        children: Object.freeze([
          Object.freeze({ value: "topics", label: MESSAGES.feedSubset.topics }),
          Object.freeze({ value: "replies", label: MESSAGES.feedSubset.replies })
        ])
      }),
      Object.freeze({ value: "unread", label: MESSAGES.feed.unread }),
      Object.freeze({ value: "top", label: MESSAGES.feed.top }),
      Object.freeze({ value: "mine", label: MESSAGES.feed.mine }),
      Object.freeze({ value: "bookmarks", label: MESSAGES.feed.bookmarks })
    ]),
    TOPIC_STATUS_CONFIG,
    TOPIC_ROW_CLASSES,
    FEEDS
  });

  const mutableStateKeys = Object.freeze([
    "state",
    "topics",
    "selectedTopicId",
    "categories",
    "categoryMetadata",
    "categoryMetadataLoad",
    "tags",
    "tagMetadata",
    "tagMetadataLoad",
    "moreTopicsUrl",
    "isLoadingTopics",
    "loadError",
    "loadGeneration",
    "dragging",
    "dragRenderFrame",
    "categoryRootScrollTop",
    "resizing",
    "collapsedButtonPointer",
    "ignoreCollapseClickUntil",
    "messageBusBridgeInjected",
    "messageBusBridgeReady",
    "currentUserNewViewEnabled",
    "trackingCurrentUser",
    "trackingSiteSettings",
    "topicTrackingStates",
    "topicPollTimer",
    "topicPollAbortController",
    "topicPollRunning",
    "topicPollFailureCount",
    "topicPollSnapshot",
    "incomingTopicIds",
    "isLoadingIncomingTopics",
    "incomingLoadError",
    "navigationHistoryPatches",
    "virtualTopicStride",
    "virtualRenderFrame",
    "virtualRenderedStart",
    "virtualRenderedEnd",
    "virtualRenderedTopicCount",
    "virtualTopicStrideNeedsRefresh",
    "navigationFallbackTimer",
    "updateNotice",
    "isCheckingVersion",
    "versionCheckAbortController",
    "saveTimer"
  ]);

  function createInitialStore() {
    return {
      state: createDefaultState(),
      topics: [],
      selectedTopicId: null,
      categories: new Map(),
      categoryMetadata: null,
      categoryMetadataLoad: null,
      tags: new Map(),
      tagMetadata: null,
      tagMetadataLoad: null,
      moreTopicsUrl: null,
      isLoadingTopics: false,
      loadError: "",
      loadGeneration: 0,
      dragging: null,
      dragRenderFrame: 0,
      categoryRootScrollTop: 0,
      resizing: null,
      collapsedButtonPointer: null,
      ignoreCollapseClickUntil: 0,
      messageBusBridgeInjected: false,
      messageBusBridgeReady: false,
      currentUserNewViewEnabled: false,
      trackingCurrentUser: null,
      trackingSiteSettings: null,
      topicTrackingStates: new Map(),
      topicPollTimer: null,
      topicPollAbortController: null,
      topicPollRunning: false,
      topicPollFailureCount: 0,
      topicPollSnapshot: new Map(),
      incomingTopicIds: new Set(),
      isLoadingIncomingTopics: false,
      incomingLoadError: "",
      navigationHistoryPatches: null,
      virtualTopicStride: constants.VIRTUAL_TOPIC_ESTIMATED_STRIDE,
      virtualRenderFrame: 0,
      virtualRenderedStart: -1,
      virtualRenderedEnd: -1,
      virtualRenderedTopicCount: -1,
      virtualTopicStrideNeedsRefresh: true,
      navigationFallbackTimer: null,
      updateNotice: null,
      isCheckingVersion: false,
      versionCheckAbortController: null,
      saveTimer: null
    };
  }

  function normalizeNullableNumber(value) {
    if (value == null) {
      return null;
    }
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeId(value) {
    return normalizeNullableNumber(value);
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getValue(object, key) {
    if (!object) {
      return null;
    }
    if (key.includes(".")) {
      let value = object;
      for (const part of key.split(".")) {
        value = getValue(value, part);
        if (value == null) {
          return null;
        }
      }
      return value;
    }
    if (object[key] != null) {
      return object[key];
    }
    try {
      return object.get?.(key) ?? null;
    } catch {
      return null;
    }
  }

  function firstValue(object, keys) {
    for (const key of keys) {
      const value = getValue(object, key);
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  function normalizeIdArray(value) {
    return toArray(value).map(normalizeId).filter((id) => id != null);
  }

  function camelCaseKey(key) {
    return String(key).replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
  }

  function snakeCaseKey(key) {
    return String(key).replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  }

  function normalizeObjectKeys(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => {
        if (!entry || typeof entry !== "object" || entry instanceof Map || entry instanceof Set) {
          return entry;
        }
        return normalizeKnownKeys(entry, Object.keys(entry).map(camelCaseKey));
      });
    }
    if (!value || typeof value !== "object" || value instanceof Map || value instanceof Set) {
      return value;
    }

    const normalized = {};
    Object.entries(value).forEach(([key, entry]) => {
      normalized[camelCaseKey(key)] = entry;
    });
    return normalized;
  }

  function normalizeKnownKeys(object, keys) {
    const normalized = {};
    keys.forEach((key) => {
      const value = firstValue(object, [key, snakeCaseKey(key)]);
      if (value != null) {
        normalized[key] = normalizeObjectKeys(value);
      }
    });
    return normalized;
  }

  function normalizeMutedTags(value) {
    return toArray(value)
      .map((tag) => {
        if (tag == null) {
          return null;
        }
        if (typeof tag === "number" || typeof tag === "string") {
          return { id: normalizeId(tag), name: typeof tag === "string" ? tag : null };
        }
        return {
          id: normalizeId(getValue(tag, "id")),
          name: getValue(tag, "name") || null
        };
      })
      .filter(Boolean);
  }

  function normalizeMutedTopics(value) {
    return toArray(value)
      .map((topic) => {
        const normalizedTopic = normalizeKnownKeys(topic, ["topicId", "createdAt", "id"]);
        const topicId = normalizeId(firstValue(normalizedTopic, ["topicId", "id"]));
        if (topicId == null) {
          return null;
        }
        return {
          topicId,
          createdAt: Number(firstValue(normalizedTopic, ["createdAt"]) ?? Date.now())
        };
      })
      .filter(Boolean);
  }

  function normalizeTagId(tag) {
    if (tag == null) {
      return null;
    }
    if (typeof tag === "number" && Number.isFinite(tag)) {
      return tag;
    }
    if (typeof tag === "string") {
      const numericTag = Number(tag);
      return Number.isFinite(numericTag) ? numericTag : tag;
    }
    const tagId = normalizeNullableNumber(getValue(tag, "id"));
    return tagId == null ? getValue(tag, "name") || null : tagId;
  }

  function normalizeFeedSubset(value) {
    const text = String(value ?? "").trim();
    return text === "topics" || text === "replies" ? text : "";
  }

  function categoryDisplayName(category, fallbackId = category?.id) {
    return category?.name || category?.slug || MESSAGES.topic.categoryFallback(fallbackId);
  }

  function categoryParentId(category) {
    return normalizeNullableNumber(category?.parent_category_id);
  }

  function createDefaultTrackingCurrentUser() {
    return {
      id: null,
      username: null,
      usernameLower: null,
      newNewViewEnabled: false,
      mutedCategoryIds: [],
      indirectlyMutedCategoryIds: [],
      mutedTags: [],
      mutedTopics: [],
      unmutedTopics: []
    };
  }

  function normalizeTrackingCurrentUser(currentUser) {
    const normalizedUser = normalizeKnownKeys(currentUser, [
      "id",
      "username",
      "usernameLower",
      "newNewViewEnabled",
      "mutedCategoryIds",
      "indirectlyMutedCategoryIds",
      "mutedTags",
      "mutedTopics",
      "unmutedTopics"
    ]);
    return {
      ...createDefaultTrackingCurrentUser(),
      id: normalizeNullableNumber(firstValue(normalizedUser, ["id"])),
      username: firstValue(normalizedUser, ["username"]) || null,
      usernameLower: firstValue(normalizedUser, ["usernameLower", "username"]) || null,
      newNewViewEnabled: Boolean(firstValue(normalizedUser, ["newNewViewEnabled"])),
      mutedCategoryIds: normalizeIdArray(firstValue(normalizedUser, ["mutedCategoryIds"])),
      indirectlyMutedCategoryIds: normalizeIdArray(firstValue(normalizedUser, ["indirectlyMutedCategoryIds"])),
      mutedTags: normalizeMutedTags(firstValue(normalizedUser, ["mutedTags"])),
      mutedTopics: normalizeMutedTopics(firstValue(normalizedUser, ["mutedTopics"])),
      unmutedTopics: normalizeMutedTopics(firstValue(normalizedUser, ["unmutedTopics"]))
    };
  }

  function createDefaultTrackingSiteSettings() {
    return {
      muteAllCategoriesByDefault: false,
      removeMutedTagsFromLatest: null
    };
  }

  function normalizeTrackingSiteSettings(siteSettings) {
    const normalizedSettings = normalizeKnownKeys(siteSettings, [
      "muteAllCategoriesByDefault",
      "removeMutedTagsFromLatest"
    ]);
    return {
      ...createDefaultTrackingSiteSettings(),
      muteAllCategoriesByDefault: Boolean(firstValue(normalizedSettings, ["muteAllCategoriesByDefault"])),
      removeMutedTagsFromLatest: firstValue(normalizedSettings, ["removeMutedTagsFromLatest"]) || null
    };
  }

  function parseEventDetail(detail) {
    if (!detail) {
      return null;
    }
    if (typeof detail === "object") {
      return detail;
    }
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }

  function errorMessage(error) {
    return error?.message || String(error || "Unknown error");
  }

  function reportError(context, error) {
    if (isExtensionContextInvalidated(error)) {
      return;
    }
    console.warn(`[LDSV] ${context}:`, error);
  }

  function getExtensionStorageLocal() {
    try {
      return getRuntimeId() ? root.chrome?.storage?.local || null : null;
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        reportError("access extension storage", error);
      }
      return null;
    }
  }

  function getExtensionResourceUrl(path) {
    try {
      return getRuntimeId() ? root.chrome?.runtime?.getURL?.(path) || "" : "";
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        reportError(`resolve extension resource ${path}`, error);
      }
      return "";
    }
  }

  function resetStore() {
    namespace.store = createInitialStore();
    return namespace.store;
  }

  function installGlobalAccessors() {
    const constantKeys = [
      "CONTENT_READY_FLAG",
      "ACTIVATE_EVENT",
      "PANEL_ID",
      "STORAGE_KEY",
      "DEFAULT_STATE",
      "COLLAPSED_SIZE",
      "HEADER_BUTTON_CENTER_Y",
      "HEADER_COLLAPSE_BUTTON_RIGHT",
      "ALL_FILTER_VALUE",
      "READ_PROGRESS_EVENT",
      "MESSAGE_BUS_STATUS_EVENT",
      "TOPIC_TRACKING_EVENT",
      "LATEST_RELEASE_MESSAGE",
      "MESSAGE_BUS_SHARED_ID",
      "MESSAGE_BUS_BRIDGE_ID",
      "NOTIFICATION_LEVEL_TRACKING",
      "MUTED_TOPIC_TTL",
      "TOPIC_POLL_VISIBLE_INTERVAL",
      "TOPIC_POLL_HIDDEN_INTERVAL",
      "TOPIC_POLL_ERROR_INTERVAL",
      "NAVIGATION_FALLBACK_INTERVAL",
      "TOPIC_POLL_RETRY_COUNT",
      "TOPIC_POLL_RETRY_BASE_DELAY",
      "TAG_FILTER_OPTION_LIMIT",
      "VIRTUAL_TOPIC_ESTIMATED_STRIDE",
      "VIRTUAL_TOPIC_ROW_GAP",
      "VIRTUAL_TOPIC_OVERSCAN",
      "EMOJI_CDN_BASE_URL",
      "GITHUB_REPOSITORY_URL",
      "VERSION_RELEASES_URL",
      "VERSION_CACHE_STORAGE_KEY",
      "VERSION_CHECK_INTERVAL",
      "FEED_OPTIONS",
      "TOPIC_STATUS_CONFIG",
      "TOPIC_ROW_CLASSES",
      "FEEDS"
    ];

    constantKeys.forEach((key) => {
      Object.defineProperty(root, key, {
        configurable: true,
        get: () => namespace.constants[key]
      });
    });

    mutableStateKeys.forEach((key) => {
      Object.defineProperty(root, key, {
        configurable: true,
        get: () => namespace.store[key],
        set: (value) => {
          namespace.store[key] = value;
        }
      });
    });

    Object.assign(root, {
      normalizeNullableNumber,
      normalizeTagId,
      normalizeFeedSubset,
      categoryDisplayName,
      categoryParentId,
      toArray,
      normalizeMutedTopics,
      normalizeTrackingCurrentUser,
      createDefaultTrackingCurrentUser,
      normalizeTrackingSiteSettings,
      createDefaultTrackingSiteSettings,
      parseEventDetail,
      normalizeObjectKeys
    });
  }

  namespace.constants = constants;
  namespace.shared = Object.freeze({
    getValue,
    firstValue,
    toArray,
    normalizeId,
    normalizeIdArray,
    normalizeNullableNumber,
    normalizeMutedTags,
    normalizeMutedTopics,
    normalizeTagId,
    normalizeFeedSubset,
    categoryDisplayName,
    categoryParentId,
    createDefaultTrackingCurrentUser,
    normalizeTrackingCurrentUser,
    createDefaultTrackingSiteSettings,
    normalizeTrackingSiteSettings,
    normalizeObjectKeys,
    parseEventDetail,
    errorMessage,
    isExtensionContextInvalidated,
    getExtensionStorageLocal,
    getExtensionResourceUrl
  });
  namespace.errorMessage = errorMessage;
  namespace.reportError = reportError;
  namespace.isExtensionContextInvalidated = isExtensionContextInvalidated;
  namespace.getExtensionStorageLocal = getExtensionStorageLocal;
  namespace.getExtensionResourceUrl = getExtensionResourceUrl;
  namespace.cleanupCallbacks = namespace.cleanupCallbacks || new Set();
  namespace.registerCleanup = function registerCleanup(callback) {
    if (typeof callback !== "function") {
      return callback;
    }
    namespace.cleanupCallbacks.add(callback);
    return callback;
  };
  namespace.runCleanups = function runCleanups() {
    const callbacks = Array.from(namespace.cleanupCallbacks);
    namespace.cleanupCallbacks.clear();
    callbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        reportError("cleanup", error);
      }
    });
  };

  if (isExtensionContext) {
    namespace.messages = MESSAGES;
    namespace.stateSchema = STATE_SCHEMA;
    namespace.store = namespace.store || createInitialStore();
    namespace.createDefaultState = createDefaultState;
    namespace.serializeState = serializeState;
    namespace.resetStore = resetStore;
    namespace.installGlobalAccessors = installGlobalAccessors;
  }

  root.LDSV = namespace;
})(globalThis);
