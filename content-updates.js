"use strict";

function setupTopicListUpdates() {
  window.addEventListener(MESSAGE_BUS_STATUS_EVENT, onMessageBusStatus);
  window.addEventListener(READ_PROGRESS_EVENT, onReadProgressEvent);
  window.addEventListener(TOPIC_TRACKING_EVENT, onTopicTrackingEvent);
  injectMessageBusBridge();
  document.addEventListener("visibilitychange", onTopicPollVisibilityChange);
  LDSV.registerCleanup(() => {
    window.removeEventListener(MESSAGE_BUS_STATUS_EVENT, onMessageBusStatus);
    window.removeEventListener(READ_PROGRESS_EVENT, onReadProgressEvent);
    window.removeEventListener(TOPIC_TRACKING_EVENT, onTopicTrackingEvent);
    document.removeEventListener("visibilitychange", onTopicPollVisibilityChange);
  });
  scheduleTopicPoll(TOPIC_POLL_VISIBLE_INTERVAL);
}

function injectMessageBusBridge() {
  if (messageBusBridgeInjected) {
    return;
  }

  const sharedUrl = LDSV.getExtensionResourceUrl("content-shared.js");
  const bridgeUrl = LDSV.getExtensionResourceUrl("message-bus-bridge.js");
  if (!sharedUrl || !bridgeUrl) {
    return;
  }

  messageBusBridgeInjected = true;
  injectPageScript(sharedUrl, MESSAGE_BUS_SHARED_ID)
    .then(() => injectPageScript(bridgeUrl, MESSAGE_BUS_BRIDGE_ID))
    .catch((error) => {
      LDSV.reportError("inject message bus bridge", error);
      messageBusBridgeInjected = false;
    });
}

function injectPageScript(src, id) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to inject ${id}`));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

function onMessageBusStatus(event) {
  const detail = parseEventDetail(event.detail);
  if (detail?.status === "ready") {
    messageBusBridgeReady = true;
    trackingCurrentUser = normalizeTrackingCurrentUser(detail.currentUser);
    currentUserNewViewEnabled = trackingCurrentUser.newNewViewEnabled;
    trackingSiteSettings = normalizeTrackingSiteSettings(detail.siteSettings);
    abortTopicPoll();
    window.clearTimeout(topicPollTimer);
    topicPollTimer = null;
    return;
  }

  if (detail?.status === "unavailable") {
    messageBusBridgeInjected = false;
    messageBusBridgeReady = false;
    scheduleTopicPoll(1000);
  }
}

function onReadProgressEvent(event) {
  const detail = parseEventDetail(event.detail);
  const topicId = Number(detail?.topicId);
  const postNumber = Number(detail?.postNumber);
  if (!Number.isFinite(topicId) || !Number.isFinite(postNumber) || postNumber <= 1) {
    return;
  }

  updateTopicReadProgress(topicId, postNumber);
}

function onTopicTrackingEvent(event) {
  const detail = parseEventDetail(event.detail);
  if (!detail?.data) {
    return;
  }

  applyTopicTrackingMessage(detail.data);
}

function onTopicPollVisibilityChange() {
  if (document.hidden) {
    abortTopicPoll();
    scheduleTopicPoll(TOPIC_POLL_HIDDEN_INTERVAL);
    return;
  }

  scheduleTopicPoll(1000);
}

function scheduleTopicPoll(delay = getTopicPollDelay()) {
  window.clearTimeout(topicPollTimer);
  topicPollTimer = window.setTimeout(pollTopicUpdates, delay);
}

function getTopicPollDelay() {
  if (topicPollFailureCount > 0) {
    return TOPIC_POLL_ERROR_INTERVAL;
  }
  return document.hidden ? TOPIC_POLL_HIDDEN_INTERVAL : TOPIC_POLL_VISIBLE_INTERVAL;
}

function abortTopicPoll() {
  if (topicPollAbortController) {
    topicPollAbortController.abort();
    topicPollAbortController = null;
  }
}

function addIncomingTopicIds(topicIds) {
  const before = incomingTopicIds.size;
  topicIds.forEach((topicId) => {
    const numericId = Number(topicId);
    if (Number.isFinite(numericId)) {
      incomingTopicIds.add(numericId);
    }
  });

  if (incomingTopicIds.size === before) {
    return;
  }

  incomingLoadError = "";
  syncIncomingNoticeForPanel();
}

async function pollTopicUpdates() {
  topicPollTimer = null;

  if (!shouldPollTopics()) {
    if (!messageBusBridgeReady) {
      scheduleTopicPoll();
    }
    return;
  }

  if (topicPollRunning) {
    scheduleTopicPoll(TOPIC_POLL_VISIBLE_INTERVAL);
    return;
  }

  topicPollRunning = true;
  const controller = new AbortController();
  topicPollAbortController = controller;

  try {
    const data = await fetchTopicPollSnapshot(controller.signal);
    const polledTopics = Array.isArray(data.topic_list?.topics) ? data.topic_list.topics : [];
    applyTopicPollSnapshot(polledTopics);
    topicPollFailureCount = 0;
  } catch (error) {
    if (error.name !== "AbortError") {
      topicPollFailureCount += 1;
    }
  } finally {
    if (topicPollAbortController === controller) {
      topicPollAbortController = null;
    }
    topicPollRunning = false;
    scheduleTopicPoll();
  }
}

function shouldPollTopics() {
  const panel = getPanel();
  const feed = currentFeed();
  return Boolean(
    panel &&
    !panel.hidden &&
    !document.hidden &&
    isTopicPage() &&
    !isLoadingTopics &&
    feed !== "top" &&
    !messageBusBridgeReady
  );
}

async function fetchTopicPollSnapshot(signal) {
  const url = buildCurrentTopicListUrl({
    _ldsv_poll: Date.now()
  });

  return fetchJson(url, {
    cache: "no-store",
    signal,
    retries: TOPIC_POLL_RETRY_COUNT,
    retryDelay: TOPIC_POLL_RETRY_BASE_DELAY
  });
}

function applyTopicPollSnapshot(polledTopics) {
  const hadSnapshot = topicPollSnapshot.size > 0;
  const nextSnapshot = new Map(topicPollSnapshot);
  const currentIds = new Set(topics.map((topic) => Number(topic.id)));
  const changedTopicIds = [];

  polledTopics.forEach((topic) => {
    const topicId = Number(topic.id);
    if (!Number.isFinite(topicId)) {
      return;
    }

    const signature = topicPollSignature(topic);
    const previousSignature = topicPollSnapshot.get(topicId);
    nextSnapshot.set(topicId, signature);

    if (!hadSnapshot || topicId === getCurrentTopicId()) {
      return;
    }

    if (!currentIds.has(topicId) || (previousSignature && previousSignature !== signature)) {
      changedTopicIds.push(topicId);
    }
  });

  topicPollSnapshot = nextSnapshot;
  addIncomingTopicIds(changedTopicIds);
}

function syncTopicPollSnapshotFromTopics() {
  topicPollSnapshot = createTopicPollSnapshot(topics);
}

function createTopicPollSnapshot(topicList) {
  const snapshot = new Map();
  topicList.forEach((topic) => {
    const topicId = Number(topic.id);
    if (Number.isFinite(topicId)) {
      snapshot.set(topicId, topicPollSignature(topic));
    }
  });
  return snapshot;
}

function topicPollSignature(topic) {
  return [
    topic.bumped_at || "",
    topic.last_posted_at || "",
    topic.updated_at || "",
    Number(topic.posts_count) || 0,
    Number(topic.highest_post_number) || 0
  ].join("|");
}

function applyTopicTrackingMessage(data) {
  const messageType = data?.message_type;
  const topicId = Number(data?.topic_id);

  if (["muted", "unmuted"].includes(messageType)) {
    trackMutedOrUnmutedTopic(data);
    return;
  }

  pruneOldMutedAndUnmutedTopics();

  if (isSuppressedTrackingTopic(topicId, data)) {
    return;
  }

  if (applyTopicTrackingCommand(data, topicId)) {
    return;
  }

  if (!isTopicStateMessage(messageType) || !Number.isFinite(topicId)) {
    return;
  }

  if (messageType === "latest") {
    applyLatestTopicMessage(data, topicId);
    return;
  }

  const oldState = findTopicTrackingState(topicId);
  const payload = createTrackingPayloadForMessage(data, topicId, oldState);
  mergeTopicTrackingState(topicId, payload);

  applyTopicTrackingSideEffects(data, topicId, oldState);
  updateTopicFromTrackingState(topicId);
}

function isSuppressedTrackingTopic(topicId, data) {
  if (Number.isFinite(topicId) && isMutedTopic(topicId)) {
    return true;
  }

  if (
    Number.isFinite(topicId) &&
    trackingSiteSettings.muteAllCategoriesByDefault &&
    !isUnmutedTopic(topicId)
  ) {
    return true;
  }

  return isTopicMutedByMessagePayload(data);
}

function applyTopicTrackingCommand(data, topicId) {
  const messageType = data?.message_type;

  if (messageType === "dismiss_new") {
    applyDismissNewTopics(data.payload?.topic_ids || []);
    return true;
  }

  if (messageType === "dismiss_new_posts") {
    applyDismissNewPosts(data.payload?.topic_ids || []);
    return true;
  }

  if (["delete", "destroy"].includes(messageType)) {
    if (Number.isFinite(topicId)) {
      removeTrackedTopic(topicId);
    }
    return true;
  }

  if (messageType === "recover") {
    if (Number.isFinite(topicId) && shouldTrackIncomingForMessage(data)) {
      addIncomingTopicIds([topicId]);
    }
    return true;
  }

  return false;
}

function isTopicStateMessage(messageType) {
  return ["new_topic", "latest", "unread", "read"].includes(messageType);
}

function applyLatestTopicMessage(data, topicId) {
  notifyIncomingTopic(data);
  updateExistingTopicMetadata(topicId, data.payload || {});
}

function createTrackingPayloadForMessage(data, topicId, oldState) {
  const messageType = data?.message_type;
  const payload = {
    ...(oldState || {}),
    ...(data.payload || {}),
    topic_id: topicId
  };

  if (messageType === "unread") {
    fillUnreadTrackingDefaults(payload);
  }

  return payload;
}

function fillUnreadTrackingDefaults(payload) {
  if (payload.last_read_post_number === undefined) {
    const highest = Number(payload.highest_post_number);
    payload.last_read_post_number = Number.isFinite(highest) ? Math.max(highest - 1, 0) : 0;
  }
  if (payload.notification_level === undefined) {
    payload.notification_level = NOTIFICATION_LEVEL_TRACKING;
  }
}

function applyTopicTrackingSideEffects(data, topicId, oldState) {
  const messageType = data?.message_type;
  if (messageType === "read") {
    clearIncomingTopicIds([topicId]);
  }

  if (["new_topic", "unread"].includes(messageType)) {
    notifyIncomingTopic(data, oldState);
  }
}

function shouldTrackIncomingForMessage(data) {
  const messageType = data?.message_type;
  const feed = currentFeed();
  if (feed === "top") {
    return false;
  }
  if (!matchesCurrentTopicListFilters(data)) {
    return false;
  }
  if (messageType === "new_topic") {
    return ["latest", "new"].includes(feed);
  }
  if (messageType === "latest") {
    return feed === "latest";
  }
  if (messageType === "unread") {
    return feed === "unread" || (feed === "new" && currentUserNewViewEnabled);
  }
  if (messageType === "recover") {
    return feed === "latest";
  }
  return false;
}

function notifyIncomingTopic(data, oldState = findTopicTrackingState(Number(data?.topic_id))) {
  if (!shouldTrackIncomingForMessage(data)) {
    return;
  }

  const topicId = Number(data?.topic_id);
  const messageType = data?.message_type;
  if (!Number.isFinite(topicId)) {
    return;
  }

  if (messageType === "new_topic") {
    addIncomingTopicIds([topicId]);
    return;
  }

  if (messageType === "latest") {
    addIncomingTopicIds([topicId]);
    return;
  }

  if (
    messageType === "unread" &&
    (!oldState || Number(oldState.highest_post_number) === Number(oldState.last_read_post_number))
  ) {
    addIncomingTopicIds([topicId]);
  }
}

function matchesCurrentTopicListFilters(data) {
  if (!data) {
    return false;
  }

  const filterInfo = currentIncomingFilterInfo();
  if (!matchesIncomingCategoryFilter(data, filterInfo)) {
    return false;
  }
  return matchesIncomingTagFilter(data, filterInfo);
}

function currentIncomingFilterInfo() {
  const feed = currentFeed();
  const category = selectedCategoryFilter();
  const tag = selectedTagFilter();
  return {
    filter: feed,
    categoryId: category?.id ?? null,
    includeDescendantCategories: Boolean(category?.includeDescendants),
    tagName: tag?.name ?? null,
    tagId: tag?.numericId ?? null
  };
}

function matchesIncomingCategoryFilter(data, filterInfo) {
  if (filterInfo.categoryId == null) {
    return true;
  }

  const payloadCategoryId = normalizeNullableNumber(data.payload?.category_id);
  if (payloadCategoryId == null) {
    return false;
  }
  if (payloadCategoryId === filterInfo.categoryId) {
    return true;
  }
  if (!filterInfo.includeDescendantCategories) {
    return false;
  }

  return isCategoryDescendantOf(payloadCategoryId, filterInfo.categoryId);
}

function matchesIncomingTagFilter(data, filterInfo) {
  if (filterInfo.tagId == null && !filterInfo.tagName) {
    return true;
  }

  const tags = Array.isArray(data.payload?.tags) ? data.payload.tags : [];
  return tags.some((tag) => {
    const tagId = normalizeNullableNumber(typeof tag === "object" ? tag.id : tag);
    const tagName = typeof tag === "string" ? tag : tag?.name;
    return (
      (filterInfo.tagId != null && tagId === filterInfo.tagId) ||
      (filterInfo.tagName && tagName === filterInfo.tagName)
    );
  });
}

function isTopicMutedByMessagePayload(data) {
  const messageType = data?.message_type;
  if (!["new_topic", "latest"].includes(messageType)) {
    return false;
  }

  const topicId = Number(data?.topic_id);
  const payload = data.payload || {};
  const categoryId = Number(payload.category_id);
  const mutedCategoryIds = new Set([
    ...trackingCurrentUser.mutedCategoryIds,
    ...trackingCurrentUser.indirectlyMutedCategoryIds
  ].map(Number));

  if (
    Number.isFinite(categoryId) &&
    mutedCategoryIds.has(categoryId) &&
    !isUnmutedTopic(topicId)
  ) {
    return true;
  }

  return hasMutedTags(payload.tags);
}

function hasMutedTags(topicTags) {
  const mutedTags = trackingCurrentUser.mutedTags;
  if (!Array.isArray(topicTags) || topicTags.length === 0 || mutedTags.length === 0) {
    return false;
  }

  const mutedTagIds = new Set(mutedTags.map((tag) => normalizeTagId(tag)).filter((tagId) => tagId != null));
  if (mutedTagIds.size === 0) {
    return false;
  }

  const topicTagIds = topicTags.map((tag) => normalizeTagId(tag)).filter((tagId) => tagId != null);
  if (topicTagIds.length === 0) {
    return false;
  }

  if (trackingSiteSettings.removeMutedTagsFromLatest === "always") {
    return topicTagIds.some((tagId) => mutedTagIds.has(tagId));
  }

  return (
    trackingSiteSettings.removeMutedTagsFromLatest === "only_muted" &&
    topicTagIds.every((tagId) => mutedTagIds.has(tagId))
  );
}

function trackMutedOrUnmutedTopic(data) {
  const topicId = Number(data?.topic_id);
  if (!Number.isFinite(topicId)) {
    return;
  }

  const entry = { topicId, createdAt: Date.now() };
  if (data.message_type === "muted") {
    trackingCurrentUser.mutedTopics = trackingCurrentUser.mutedTopics.concat(entry);
    return;
  }

  trackingCurrentUser.unmutedTopics = trackingCurrentUser.unmutedTopics.concat(entry);
}

function pruneOldMutedAndUnmutedTopics() {
  const now = Date.now();
  trackingCurrentUser.mutedTopics = trackingCurrentUser.mutedTopics.filter(
    (topic) => now - Number(topic.createdAt || 0) < MUTED_TOPIC_TTL
  );
  trackingCurrentUser.unmutedTopics = trackingCurrentUser.unmutedTopics.filter(
    (topic) => now - Number(topic.createdAt || 0) < MUTED_TOPIC_TTL
  );
}

function isMutedTopic(topicId) {
  const numericTopicId = Number(topicId);
  return trackingCurrentUser.mutedTopics.some((topic) => Number(topic.topicId) === numericTopicId);
}

function isUnmutedTopic(topicId) {
  const numericTopicId = Number(topicId);
  return trackingCurrentUser.unmutedTopics.some((topic) => Number(topic.topicId) === numericTopicId);
}

function mergeTopicTrackingState(topicId, payload) {
  const numericTopicId = Number(topicId);
  if (!Number.isFinite(numericTopicId)) {
    return null;
  }

  const previous = topicTrackingStates.get(numericTopicId) || {};
  const next = { ...previous, ...payload, topic_id: numericTopicId };
  topicTrackingStates.set(numericTopicId, next);
  return next;
}

function findTopicTrackingState(topicId) {
  const numericTopicId = Number(topicId);
  return Number.isFinite(numericTopicId) ? topicTrackingStates.get(numericTopicId) || null : null;
}

function syncTopicTrackingStatesFromTopics(topicList) {
  topicList.forEach((topic) => {
    const stateFromTopic = createTrackingStateFromTopic(topic);
    if (stateFromTopic) {
      topicTrackingStates.set(Number(topic.id), stateFromTopic);
    }
  });
}

function createTrackingStateFromTopic(topic) {
  const topicId = Number(topic?.id);
  if (!Number.isFinite(topicId)) {
    return null;
  }

  const previous = topicTrackingStates.get(topicId) || {};
  const next = { ...previous, topic_id: topicId };
  if (topic.unseen) {
    next.last_read_post_number = null;
  } else if (topic.unread_posts) {
    next.last_read_post_number = Math.max(
      Number(topic.highest_post_number) - (Number(topic.unread_posts) || 0),
      0
    );
  } else if (topic.last_read_post_number !== undefined) {
    next.last_read_post_number = topic.last_read_post_number;
  } else {
    return null;
  }

  if (topic.notification_level) {
    next.notification_level = topic.notification_level;
  }
  if (topic.highest_post_number) {
    next.highest_post_number = topic.highest_post_number;
  }
  if (topic.category_id != null) {
    next.category_id = topic.category_id;
  }
  if (Array.isArray(topic.tags)) {
    next.tags = topic.tags;
  }
  if (topic.is_seen !== undefined) {
    next.is_seen = topic.is_seen;
  }
  return next;
}

function updateTopicFromTrackingState(topicId) {
  const stateForTopic = findTopicTrackingState(topicId);
  const topic = findTopicById(topicId);
  if (!stateForTopic || !topic) {
    return false;
  }

  applyTrackingStateToTopic(topic, stateForTopic);
  syncTopicPollSnapshotFromTopics();
  updateVisibleTopicRow(topic);
  return true;
}

function updateExistingTopicMetadata(topicId, payload) {
  const topic = findTopicById(topicId);
  if (!topic) {
    return false;
  }

  if (payload.category_id != null) {
    topic.category_id = payload.category_id;
  }
  if (payload.bumped_at) {
    topic.bumped_at = payload.bumped_at;
  }
  if (payload.updated_at) {
    topic.updated_at = payload.updated_at;
  }
  syncTopicPollSnapshotFromTopics();
  updateVisibleTopicRow(topic);
  return true;
}

function applyTrackingStateToTopic(topic, stateForTopic) {
  const highest = Math.max(
    Number(stateForTopic.highest_post_number) || 0,
    Number(topic.highest_post_number) || 0,
    Number(topic.posts_count) || 0
  );
  const lastRead = stateForTopic.last_read_post_number;
  const hasLastRead = Object.prototype.hasOwnProperty.call(stateForTopic, "last_read_post_number");

  if (highest > 0) {
    topic.highest_post_number = highest;
    topic.posts_count = Math.max(Number(topic.posts_count) || 0, highest);
  }

  if (hasLastRead && lastRead == null) {
    topic.last_read_post_number = null;
    topic.unread_posts = 0;
    topic.new_posts = Number(topic.new_posts) || 0;
    topic.unseen = stateForTopic.is_seen !== true;
    topic.visited = false;
  } else if (hasLastRead) {
    const numericLastRead = Math.max(Number(lastRead) || 0, 0);
    const unreadCount = Math.max((Number(topic.posts_count) || highest) - numericLastRead, 0);
    topic.last_read_post_number = numericLastRead;
    topic.unread_posts = unreadCount;
    topic.new_posts = unreadCount;
    topic.unseen = false;
    topic.visited = numericLastRead >= highest;
  }

  if (stateForTopic.category_id != null) {
    topic.category_id = stateForTopic.category_id;
  }
  if (Array.isArray(stateForTopic.tags) && stateForTopic.tags.every((tag) => typeof tag === "string" || tag?.name)) {
    topic.tags = stateForTopic.tags;
  }
  if (stateForTopic.bumped_at) {
    topic.bumped_at = stateForTopic.bumped_at;
  }
  if (stateForTopic.updated_at) {
    topic.updated_at = stateForTopic.updated_at;
  }
  if (stateForTopic.created_at && !topic.created_at) {
    topic.created_at = stateForTopic.created_at;
  }
}

function applyDismissNewTopics(topicIds) {
  const changed = [];
  topicIds.forEach((topicId) => {
    const stateForTopic = mergeTopicTrackingState(topicId, { is_seen: true });
    const topic = findTopicById(topicId);
    if (stateForTopic && topic) {
      if (currentFeed() === "new") {
        topic.prevent_sync = true;
      }
      topic.unseen = false;
      topic.new_posts = 0;
      changed.push(Number(topicId));
    }
  });

  clearIncomingTopicIds(topicIds);
  if (changed.length > 0) {
    if (currentFeed() === "new") {
      topics = topics.filter((topic) => !changed.includes(Number(topic.id)));
      renderTopics({ preserveScroll: true });
      return;
    }
    changed.forEach((topicId) => {
      const topic = findTopicById(topicId);
      if (topic) {
        updateVisibleTopicRow(topic);
      }
    });
  }
}

function applyDismissNewPosts(topicIds) {
  const changed = [];
  topicIds.forEach((topicId) => {
    const stateForTopic = findTopicTrackingState(topicId);
    const topic = findTopicById(topicId);
    const highest = Math.max(
      Number(stateForTopic?.highest_post_number) || 0,
      Number(topic?.highest_post_number) || 0,
      Number(topic?.posts_count) || 0
    );

    if (highest > 0) {
      mergeTopicTrackingState(topicId, {
        highest_post_number: highest,
        last_read_post_number: highest
      });
      if (topic) {
        applyTrackingStateToTopic(topic, findTopicTrackingState(topicId));
        changed.push(Number(topicId));
      }
    }
  });

  clearIncomingTopicIds(topicIds);
  if (changed.length > 0) {
    changed.forEach((topicId) => {
      const topic = findTopicById(topicId);
      if (topic) {
        updateVisibleTopicRow(topic);
      }
    });
  }
}

function removeTrackedTopic(topicId) {
  const numericTopicId = Number(topicId);
  if (!Number.isFinite(numericTopicId)) {
    return;
  }

  topicTrackingStates.delete(numericTopicId);
  clearIncomingTopicIds([numericTopicId]);
  const before = topics.length;
  topics = topics.filter((topic) => Number(topic.id) !== numericTopicId);
  if (topics.length !== before) {
    syncTopicPollSnapshotFromTopics();
    renderTopics({ preserveScroll: true });
  }
}

function updateTopicReadProgress(topicId, postNumber) {
  const topic = findTopicById(topicId);
  if (!topic) {
    return;
  }

  const previousLastRead = Number(topic.last_read_post_number) || 0;
  const wasVisited = Boolean(topic.visited);
  const shouldUpdateProgress = postNumber > previousLastRead;
  if (!shouldUpdateProgress && wasVisited) {
    return;
  }

  const highest = Math.max(
    Number(topic.highest_post_number) || 0,
    Number(topic.posts_count) || 0,
    postNumber
  );
  const unreadCount = shouldUpdateProgress ? Math.max(highest - postNumber, 0) : Number(topic.unread_posts) || 0;

  if (shouldUpdateProgress) {
    topic.last_read_post_number = postNumber;
  }
  topic.highest_post_number = highest;
  topic.unread_posts = unreadCount;
  topic.new_posts = unreadCount;
  topic.unseen = false;
  topic.visited = true;

  const trackingPayload = {
    highest_post_number: highest,
    is_seen: true
  };
  if (shouldUpdateProgress) {
    trackingPayload.last_read_post_number = postNumber;
  }
  mergeTopicTrackingState(topicId, trackingPayload);
  syncTopicPollSnapshotFromTopics();
  updateTopicRowReadState(topic);
}

async function showIncomingTopics() {
  const topicIds = [...incomingTopicIds];
  if (topicIds.length === 0 || isLoadingIncomingTopics) {
    return;
  }

  isLoadingIncomingTopics = true;
  incomingLoadError = "";
  syncIncomingNoticeForPanel();
  let topicsChanged = false;

  try {
    const data = await fetchIncomingTopics(topicIds);
    const parsedData = parseTopicListResponse(data);
    const incomingTopics = parsedData.topics;

    categories = mergeMaps(categories, parseCategories(parsedData));

    const incomingIds = new Set(incomingTopics.map((topic) => Number(topic.id)));
    topics = incomingTopics.concat(topics.filter((topic) => !incomingIds.has(Number(topic.id))));

    if (hasUnknownCategories(topics)) {
      categories = mergeMaps(categories, await loadCategoryMetadata());
    }

    syncTopicPollSnapshotFromTopics();
    syncTopicTrackingStatesFromTopics(topics);
    clearIncomingTopicIds(topicIds);
    topicsChanged = true;
  } catch (error) {
    incomingLoadError = LDSV.messages.loading.incomingFailed(LDSV.errorMessage(error));
  } finally {
    isLoadingIncomingTopics = false;
    if (topicsChanged) {
      renderTopics();
    } else {
      syncIncomingNoticeForPanel();
    }
  }
}

async function fetchIncomingTopics(topicIds) {
  const url = buildCurrentTopicListUrl({
    topic_ids: topicIds.join(",")
  });

  return fetchJson(url);
}

function clearIncomingTopicIds(topicIds) {
  topicIds.forEach((topicId) => incomingTopicIds.delete(Number(topicId)));
  incomingLoadError = "";
  syncIncomingNoticeForPanel();
}

function resetIncomingTopicIds() {
  incomingTopicIds = new Set();
  incomingLoadError = "";
  syncIncomingNoticeForPanel();
}

