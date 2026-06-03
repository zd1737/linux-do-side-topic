"use strict";

async function loadTopics(options = {}) {
  const panel = getPanel();
  if (!panel || isLoadingTopics) {
    return;
  }

  const append = Boolean(options.append);
  const preserveScroll = append || Boolean(options.preserveScroll);
  const keepExisting = !append && Boolean(options.keepExisting);
  const generation = append ? loadGeneration : loadGeneration + 1;

  if (!append) {
    loadGeneration = generation;
    if (!keepExisting) {
      topics = [];
      categories = new Map();
      moreTopicsUrl = null;
    }
    loadError = "";
    incomingLoadError = "";
  }

  isLoadingTopics = true;
  renderTopics({ preserveScroll });

  try {
    const targetPath = options.url ? withFeedSubsetParam(options.url, currentFeed()) : buildTopicListPath();
    const url = new URL(targetPath, window.location.origin);
    const data = await fetchJson(url);
    if (!append && generation !== loadGeneration) {
      return;
    }

    const parsedData = parseTopicListResponse(data);
    const parsedCategories = parseCategories(parsedData);
    const parsedTags = parseTags(parsedData);
    categories = append
      ? mergeMaps(categories, parsedCategories)
      : mergeMaps(categoryMetadata || new Map(), parsedCategories);
    tags = append
      ? mergeMaps(tags, parsedTags)
      : mergeMaps(tagMetadata || new Map(), parsedTags);
    topics = appendUniqueTopics(
      append ? topics : [],
      parsedData.topics
    );
    moreTopicsUrl = parsedData.moreTopicsUrl;
    if (hasUnknownCategories(topics)) {
      categories = mergeMaps(categories, await loadCategoryMetadata());
      if (!append && generation !== loadGeneration) {
        return;
      }
    }
    syncTopicPollSnapshotFromTopics();
    syncTopicTrackingStatesFromTopics(topics);
    if (!append) {
      resetIncomingTopicIds();
      refreshFilterOptions(panel);
    }
    loadError = "";
  } catch (error) {
    if (!append && !keepExisting) {
      topics = [];
      syncTopicPollSnapshotFromTopics();
      syncTopicTrackingStatesFromTopics(topics);
    }
    loadError = LDSV.messages.loading.loadFailed(LDSV.errorMessage(error));
  } finally {
    isLoadingTopics = false;
    renderTopics({ preserveScroll });
  }
}

function renderTopics(options = {}) {
  const panel = getPanel();
  if (!panel) {
    return;
  }

  const list = panel.querySelector(".ldsv-list");
  const previousScrollTop = options.preserveScroll ? list.scrollTop : 0;
  const currentTopicId = selectedTopicId ?? getCurrentTopicId();

  if (options.preserveScroll && !options.forceRebuild && !isLoadingTopics && !loadError && hasReusableTopicTable(list)) {
    rerenderVisibleTopicWindow(list);
    syncIncomingNoticeForPanel();
    return;
  }

  list.textContent = "";

  if (topics.length === 0 && !isLoadingTopics) {
    const empty = document.createElement("div");
    empty.className = "ldsv-empty";
    empty.textContent = loadError || LDSV.messages.loading.empty;
    list.appendChild(empty);
    resetVirtualTopicRenderState();
    return;
  }

  if (topics.length > 0) {
    const table = document.createElement("table");
    table.className = "ldsv-topic-list";
    table.setAttribute("aria-label", LDSV.messages.controls.topicList);
    const tableTop = getListPaddingTop(list);
    const virtualWindow = getVirtualTopicWindow(list, topics.length, previousScrollTop, tableTop);
    table.append(createTopicListBody(topics, currentTopicId, virtualWindow));
    list.appendChild(table);
    syncVirtualTopicRenderState(virtualWindow, topics.length);
    measureVirtualTopicStride(table);
  } else {
    resetVirtualTopicRenderState();
  }

  if (isLoadingTopics) {
    const loader = document.createElement("div");
    loader.className = "ldsv-loader";
    loader.setAttribute("role", "status");
    loader.appendChild(document.createElement("div")).className = "spinner";
    list.appendChild(loader);
  } else if (loadError && topics.length > 0) {
    const error = document.createElement("div");
    error.className = "ldsv-load-error";
    error.textContent = loadError;
    list.appendChild(error);
  }

  if (options.preserveScroll) {
    list.scrollTop = previousScrollTop;
  }
}

function syncIncomingBadge() {
  const badge = getPanel()?.querySelector(".ldsv-incoming-badge");
  if (!badge) {
    return;
  }

  const count = incomingTopicIds.size;
  const hasState = hasIncomingNoticeState();
  badge.hidden = !hasState;
  badge.disabled = isLoadingIncomingTopics || count === 0;
  badge.classList.toggle("is-loading", isLoadingIncomingTopics);
  badge.classList.toggle("has-error", Boolean(incomingLoadError));
  badge.textContent = isLoadingIncomingTopics ? "" : incomingLoadError ? "!" : formatNumber(count);
  badge.title = incomingNoticeTooltip(count);
  badge.setAttribute("aria-label", incomingNoticeTooltip(count));
  badge.dataset.tooltip = incomingNoticeTooltip(count);
}

function incomingNoticeTooltip(count) {
  if (isLoadingIncomingTopics) {
    return LDSV.messages.loading.pullingIncoming(count);
  }

  if (incomingLoadError) {
    return count > 0
      ? LDSV.messages.loading.incomingLoadFailedWithRetry(incomingLoadError)
      : LDSV.messages.loading.incomingLoadFailed(incomingLoadError);
  }

  return LDSV.messages.loading.incomingAvailable(count);
}

function onShowIncomingClick(event) {
  event.preventDefault();
  event.stopPropagation();
  showIncomingTopics();
}

function onListScroll(event) {
  const list = event.currentTarget;
  scheduleVirtualTopicRender(list);

  if (!moreTopicsUrl || isLoadingTopics || list.hidden) {
    return;
  }

  const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
  if (remaining < 360) {
    loadTopics({ append: true, url: moreTopicsUrl });
  }
}

function hasIncomingNoticeState() {
  return incomingTopicIds.size > 0 || isLoadingIncomingTopics || Boolean(incomingLoadError);
}

function syncIncomingNoticeForPanel() {
  syncIncomingBadge();
}

function buildTopicListPath(options = {}) {
  const feed = currentFeed();
  return withFeedSubsetParam(withJsonExtension(buildFilteredTopicListFilter(feed, options)), feed);
}

function buildFilteredTopicListFilter(feed, options = {}) {
  const filter = topicListFeedSegment(feed);
  const category = selectedCategoryFilter();
  const tag = selectedTagFilter();

  if (category && tag) {
    const tagPath = tag.numericId == null ? tag.slug : `${tag.slug}/${tag.numericId}`;
    return `tags/c/${category.slugPath}/${category.id}/${tagPath}/l/${filter}`;
  }

  if (category) {
    return `c/${category.slugPath}/${category.id}/l/${filter}?filter=default`;
  }

  if (tag) {
    return `tag/${tag.numericId == null ? tag.slug : tag.numericId}/l/${filter}`;
  }

  return FEEDS[feed]?.path || FEEDS[DEFAULT_STATE.feed].path;
}

function topicListFeedSegment(feed) {
  return String(FEEDS[feed]?.path || FEEDS[DEFAULT_STATE.feed].path)
    .replace(/^\//, "")
    .replace(/\.json$/i, "");
}

function buildCurrentTopicListUrl(params = {}) {
  const url = new URL(buildTopicListPath(), window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url;
}

function withFeedSubsetParam(path, feed) {
  const subset = feed === "new" ? normalizeFeedSubset(state.feedSubset) : "";
  if (!subset) {
    return path;
  }

  const url = new URL(path, window.location.origin);
  url.searchParams.set("subset", subset);
  return `${url.pathname}${url.search}`;
}

function withJsonExtension(path) {
  const [basePath, query = ""] = String(path).replace(/^\//, "").split("?");
  const jsonPath = basePath.endsWith(".json") ? basePath : `${basePath}.json`;
  return `/${jsonPath}${query ? `?${query}` : ""}`;
}

function selectedCategoryFilter() {
  const categoryId = normalizeNullableNumber(state.categoryId);
  const parentCategoryId = normalizeNullableNumber(state.parentCategoryId);
  const categorySlug = String(state.categorySlug || "").trim();
  if (categoryId == null) {
    return null;
  }

  const category = getCategoryById(categoryId);
  return {
    id: categoryId,
    parentId: parentCategoryId,
    includeDescendants: categoryHasDescendants(categoryId),
    slugPath: category ? categorySlugPath(category) : slugifyPath(categorySlug || `category-${categoryId}`)
  };
}

function selectedTagFilter() {
  const tagId = normalizeNullableNumber(state.tagId);
  const tagName = String(state.tagName || "").trim();
  if (tagId == null && !tagName) {
    return null;
  }

  const tag = tagId == null ? null : getTagById(tagId);
  const slug = tagName || tag?.slug || tag?.name || String(tagId);
  return {
    numericId: tagId,
    name: tag?.name || tagName || null,
    slug: encodePathSegment(slug)
  };
}

