"use strict";

LDSV.metricIcons = Object.freeze({
  replies: Object.freeze({
    paths: Object.freeze([
      "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"
    ])
  }),
  views: Object.freeze({
    paths: Object.freeze([
      "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
    ]),
    circles: Object.freeze([
      Object.freeze({ cx: "12", cy: "12", r: "3" })
    ])
  }),
  activity: Object.freeze({
    paths: Object.freeze([
      "M12 7v5l3 2"
    ]),
    circles: Object.freeze([
      Object.freeze({ cx: "12", cy: "12", r: "9" })
    ])
  })
});

function createTopicListBody(topicList, currentTopicId, virtualWindow = null) {
  const tbody = document.createElement("tbody");
  tbody.className = "ldsv-topic-list-body";

  const range = virtualWindow || {
    start: 0,
    end: topicList.length,
    topSpacer: 0,
    bottomSpacer: 0
  };
  const visibleTopics = topicList.slice(range.start, range.end);

  appendTopicSpacerRow(tbody, range.topSpacer);
  visibleTopics.forEach((topic) => {
    tbody.appendChild(createTopicRow(topic, currentTopicId));
  });
  appendTopicSpacerRow(tbody, range.bottomSpacer);

  return tbody;
}

function appendTopicSpacerRow(tbody, height) {
  if (height <= 0) {
    return;
  }

  tbody.appendChild(createTopicSpacerRow(height));
}

function createTopicSpacerRow(height) {
  const row = document.createElement("tr");
  row.className = "ldsv-topic-virtual-spacer";
  row.setAttribute("aria-hidden", "true");
  row.style.height = `${Math.max(0, Math.round(height))}px`;

  const cell = document.createElement("td");
  cell.colSpan = 4;
  row.appendChild(cell);
  return row;
}

function getVirtualTopicWindow(list, topicCount, scrollTop, tableTop = 0) {
  if (topicCount <= 0) {
    return { start: 0, end: 0, topSpacer: 0, bottomSpacer: 0 };
  }

  const viewportHeight = Math.max(list?.clientHeight || 0, VIRTUAL_TOPIC_ESTIMATED_STRIDE);
  const localScrollTop = Math.max(0, Number(scrollTop) - tableTop);
  const offsets = buildVirtualTopicOffsets(topics.slice(0, topicCount));
  const firstVisible = topicIndexAtOffset(offsets, localScrollTop);
  const lastVisible = topicIndexAtOffset(offsets, localScrollTop + viewportHeight);
  const start = clamp(firstVisible - VIRTUAL_TOPIC_OVERSCAN, 0, topicCount);
  const end = clamp(lastVisible + VIRTUAL_TOPIC_OVERSCAN + 1, start, topicCount);
  const topSpacer = spacerHeightBeforeIndex(offsets, start, end < topicCount || start < end);
  const bottomSpacer = spacerHeightAfterIndex(offsets, end);

  return { start, end, topSpacer, bottomSpacer };
}

function getVirtualTopicWindowForScrollAnchor(list, topicCount, scrollAnchor, tableTop = 0, fallbackScrollTop = 0) {
  const topicIndex = topics.findIndex((topic) => Number(topic.id) === Number(scrollAnchor?.topicId));
  if (topicIndex < 0) {
    return getVirtualTopicWindow(list, topicCount, fallbackScrollTop, tableTop);
  }

  const offsets = buildVirtualTopicOffsets(topics.slice(0, topicCount));
  const anchorOffsetTop = Number(scrollAnchor.offsetTop) || 0;
  const anchorScrollTop = tableTop + offsets[topicIndex] - anchorOffsetTop;
  return getVirtualTopicWindow(list, topicCount, anchorScrollTop, tableTop);
}

function getVirtualScrollAnchor(list) {
  if (!list) {
    return null;
  }

  const listRect = list.getBoundingClientRect();
  const rows = [...list.querySelectorAll(".ldsv-topic-row")];
  for (const row of rows) {
    const rowRect = row.getBoundingClientRect();
    if (rowRect.bottom <= listRect.top || rowRect.top >= listRect.bottom) {
      continue;
    }

    const topicId = getTopicIdForRow(row);
    if (topicId == null) {
      continue;
    }

    return {
      topicId,
      offsetTop: rowRect.top - listRect.top,
      scrollTop: list.scrollTop
    };
  }

  return null;
}

function restoreVirtualScrollAnchor(list, scrollAnchor) {
  if (!list || !scrollAnchor) {
    return false;
  }

  const row = [...list.querySelectorAll(".ldsv-topic-row")]
    .find((entry) => getTopicIdForRow(entry) === Number(scrollAnchor.topicId));
  if (!row) {
    return false;
  }

  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  list.scrollTop += rowRect.top - listRect.top - scrollAnchor.offsetTop;
  return true;
}

function buildVirtualTopicOffsets(topicList) {
  const offsets = [0];
  topicList.forEach((topic, index) => {
    const rowHeight = virtualTopicHeightFor(topic);
    const gap = index < topicList.length - 1 ? VIRTUAL_TOPIC_ROW_GAP : 0;
    offsets.push(offsets[index] + rowHeight + gap);
  });
  return offsets;
}

function virtualTopicHeightFor(topic) {
  const topicId = Number(topic?.id);
  const measuredHeight = Number.isFinite(topicId) ? virtualTopicHeights.get(topicId) : null;
  if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
    return measuredHeight;
  }

  return Math.max(1, virtualTopicStride - VIRTUAL_TOPIC_ROW_GAP);
}

function topicIndexAtOffset(offsets, offset) {
  const maxIndex = offsets.length - 2;
  if (maxIndex <= 0) {
    return 0;
  }

  let low = 0;
  let high = maxIndex;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (offsets[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return clamp(low, 0, maxIndex);
}

function spacerHeightBeforeIndex(offsets, index, hasFollowingRow) {
  if (index <= 0) {
    return 0;
  }

  const boundaryGap = hasFollowingRow ? VIRTUAL_TOPIC_ROW_GAP : 0;
  return Math.max(0, offsets[index] - boundaryGap);
}

function spacerHeightAfterIndex(offsets, index) {
  if (index >= offsets.length - 1) {
    return 0;
  }

  return Math.max(0, offsets[offsets.length - 1] - offsets[index]);
}

function getCurrentTopicTableTop(list) {
  const table = list.querySelector(".ldsv-topic-list");
  if (!table) {
    return getListPaddingTop(list);
  }

  const listRect = list.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  return Math.max(0, tableRect.top - listRect.top + list.scrollTop);
}

function getListPaddingTop(list) {
  if (!list) {
    return 0;
  }

  const paddingTop = Number.parseFloat(window.getComputedStyle(list).paddingTop);
  return Number.isFinite(paddingTop) ? paddingTop : 0;
}

function scheduleVirtualTopicRender(list) {
  if (!list || topics.length === 0 || virtualRenderFrame) {
    return;
  }

  const nextWindow = getVirtualTopicWindow(
    list,
    topics.length,
    list.scrollTop,
    getCurrentTopicTableTop(list)
  );
  if (
    nextWindow.start === virtualRenderedStart &&
    nextWindow.end === virtualRenderedEnd &&
    topics.length === virtualRenderedTopicCount
  ) {
    return;
  }

  virtualRenderFrame = window.requestAnimationFrame(() => {
    virtualRenderFrame = 0;
    rerenderVisibleTopicWindow(list);
  });
}

function rerenderVisibleTopicWindow(list, scrollAnchor = null) {
  const table = list?.querySelector(".ldsv-topic-list");
  const oldBody = table?.querySelector(".ldsv-topic-list-body");
  if (!list || !table || !oldBody || topics.length === 0) {
    renderTopics({ preserveScroll: true });
    return;
  }

  const previousScrollTop = list.scrollTop;
  const anchor = scrollAnchor || getVirtualScrollAnchor(list);
  const currentTopicId = selectedTopicId ?? getCurrentTopicId();
  const tableTop = getCurrentTopicTableTop(list);
  const virtualWindow = anchor
    ? getVirtualTopicWindowForScrollAnchor(list, topics.length, anchor, tableTop, previousScrollTop)
    : getVirtualTopicWindow(list, topics.length, previousScrollTop, tableTop);

  const nextBody = createTopicListBody(topics, currentTopicId, virtualWindow);
  oldBody.replaceWith(nextBody);
  syncVirtualTopicRenderState(virtualWindow, topics.length);
  syncVirtualTopicMeasurements(table, list, currentTopicId, anchor, tableTop, previousScrollTop);
  hideOverflowTopicTags(table);
  if (!restoreVirtualScrollAnchor(list, anchor)) {
    list.scrollTop = previousScrollTop;
  }
}

function syncVirtualTopicMeasurements(table, list, currentTopicId, scrollAnchor, tableTop, fallbackScrollTop) {
  if (!measureVirtualTopicRows(table) || !scrollAnchor) {
    return;
  }

  const adjustedWindow = getVirtualTopicWindowForScrollAnchor(
    list,
    topics.length,
    scrollAnchor,
    tableTop,
    fallbackScrollTop
  );
  table.querySelector(".ldsv-topic-list-body")?.replaceWith(createTopicListBody(topics, currentTopicId, adjustedWindow));
  syncVirtualTopicRenderState(adjustedWindow, topics.length);
  measureVirtualTopicRows(table);
}

function hasReusableTopicTable(list) {
  return Boolean(
    list?.querySelector(".ldsv-topic-list") &&
    !list.querySelector(".ldsv-loader, .ldsv-load-error, .ldsv-empty") &&
    topics.length > 0 &&
    topics.length === virtualRenderedTopicCount &&
    virtualRenderedStart >= 0
  );
}

function syncVirtualTopicRenderState(virtualWindow, topicCount) {
  virtualRenderedStart = virtualWindow.start;
  virtualRenderedEnd = virtualWindow.end;
  virtualRenderedTopicCount = topicCount;
}

function resetVirtualTopicRenderState() {
  virtualRenderedStart = -1;
  virtualRenderedEnd = -1;
  virtualRenderedTopicCount = -1;
  pruneVirtualTopicHeights(topics);
}

function measureVirtualTopicRows(table) {
  const rows = [...table.querySelectorAll(".ldsv-topic-row")];
  if (rows.length === 0) {
    return false;
  }

  pruneVirtualTopicHeights(topics);

  let changed = false;
  let totalStride = 0;
  let measuredCount = 0;
  rows.forEach((row) => {
    const topicId = getTopicIdForRow(row);
    if (topicId == null) {
      return;
    }

    const nextHeight = Math.round(row.getBoundingClientRect().height);
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }

    const previousHeight = virtualTopicHeights.get(topicId);
    if (previousHeight !== nextHeight) {
      virtualTopicHeights.set(topicId, nextHeight);
      changed = true;
    }
    totalStride += nextHeight + VIRTUAL_TOPIC_ROW_GAP;
    measuredCount += 1;
  });

  if (measuredCount > 0) {
    virtualTopicStride = clamp(Math.round(totalStride / measuredCount), 48, 220);
  }

  return changed;
}

function pruneVirtualTopicHeights(topicList) {
  if (!(virtualTopicHeights instanceof Map)) {
    virtualTopicHeights = new Map();
    return;
  }

  const topicIds = new Set(topicList.map((topic) => Number(topic.id)).filter(Number.isFinite));
  [...virtualTopicHeights.keys()].forEach((topicId) => {
    if (!topicIds.has(topicId)) {
      virtualTopicHeights.delete(topicId);
    }
  });
}

function createTopicRow(topic, currentTopicId) {
  const row = document.createElement("tr");
  row.className = getTopicRowClassName(topic);
  row.dataset.topicId = topic.id;
  row.addEventListener("click", onTopicRowActivate, true);
  row.addEventListener("auxclick", onTopicRowActivate, true);
  row.addEventListener("click", onTopicRowClick);
  row.addEventListener("auxclick", onTopicRowClick);
  row.addEventListener("keydown", onTopicRowKeyDown);

  if (topic.id === currentTopicId) {
    row.classList.add("selected", "ldsv-active");
    row.dataset.isLastViewedTopic = "true";
  }

  row.append(createTopicCell(topic));

  return row;
}

function hideOverflowTopicTags(root) {
  root?.querySelectorAll(".ldsv-topic-tags").forEach((tagList) => {
    const listRect = tagList.getBoundingClientRect();
    let shouldHideRest = false;

    tagList.querySelectorAll(".ldsv-topic-tag").forEach((tag) => {
      tag.hidden = false;
    });

    tagList.querySelectorAll(".ldsv-topic-tag").forEach((tag) => {
      if (shouldHideRest) {
        tag.hidden = true;
        return;
      }

      const tagRect = tag.getBoundingClientRect();
      if (tagRect.right > listRect.right + 0.5) {
        tag.hidden = true;
        shouldHideRest = true;
      }
    });
  });
}

function createTopicCell(topic) {
  const cell = document.createElement("td");
  cell.className = "ldsv-topic-main ldsv-topic-list-data";

  const taxonomy = document.createElement("span");
  taxonomy.className = "ldsv-topic-taxonomy";
  const taxonomyInner = document.createElement("span");
  taxonomyInner.className = "ldsv-topic-taxonomy-inner";
  appendCategoryBadge(taxonomyInner, topic);
  appendTags(taxonomyInner, topic);
  if (taxonomyInner.children.length > 0) {
    taxonomy.appendChild(taxonomyInner);
  }

  const topLine = document.createElement("span");
  topLine.className = "ldsv-topic-title-line";
  topLine.setAttribute("role", "heading");
  topLine.setAttribute("aria-level", "2");

  appendTopicStatus(topLine, topic);

  const link = document.createElement("a");
  link.href = topicUrl(topic, "lastUnread");
  link.dataset.topicId = topic.id;
  link.className = "ldsv-topic-title";
  link.innerHTML = sanitizeTrustedTopicTitle(topic.fancy_title || escapeHTML(topic.title || LDSV.messages.topic.untitled));
  installTopicTitleEmojiFallbacks(link);
  topLine.appendChild(link);
  appendTopicBadges(cell, topic);

  const bottomLine = document.createElement("div");
  bottomLine.className = "ldsv-topic-bottom-line";

  const author = document.createElement("span");
  author.className = "ldsv-topic-author-meta";
  appendTopicAuthor(author, topic);

  const meta = document.createElement("span");
  meta.className = "ldsv-topic-meta";
  appendTopicRepliesMeta(meta, topic);
  appendTopicViewsMeta(meta, topic);
  appendTopicActivityMeta(meta, topic);

  if (taxonomy.children.length > 0) {
    cell.appendChild(taxonomy);
  }
  cell.appendChild(topLine);
  if (author.children.length > 0 || meta.children.length > 0) {
    if (author.children.length > 0) {
      bottomLine.appendChild(author);
    }
    if (meta.children.length > 0) {
      bottomLine.appendChild(meta);
    }
    cell.appendChild(bottomLine);
  }
  return cell;
}

function appendTopicStatus(parent, topic) {
  const wrapper = document.createElement("span");
  wrapper.className = "ldsv-topic-statuses";

  TOPIC_STATUS_CONFIG.forEach((statusConfig) => {
    if (!statusConfig.enabled(topic)) {
      return;
    }
    const status = document.createElement("span");
    status.className = `ldsv-topic-status ${statusConfig.className}`;
    const label = statusConfig.label();
    status.title = label;
    status.setAttribute("aria-label", label);
    if (statusConfig.className.includes("--pinned")) {
      appendTopicStatusSvgIcon(status, "thumbtack");
    }
    wrapper.appendChild(status);
  });

  if (wrapper.children.length > 0) {
    parent.appendChild(wrapper);
  }
}

function appendTopicStatusSvgIcon(parent, iconName) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", `fa d-icon d-icon-${iconName} svg-icon fa-width-auto svg-string`);
  icon.setAttribute("width", "1em");
  icon.setAttribute("height", "1em");
  icon.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${iconName}`);
  icon.appendChild(use);
  parent.appendChild(icon);
}

function appendTopicBadges(parent, topic) {
  const unreadCount = Number(topic.unread_posts || topic.new_posts || 0);
  if (topic.unseen) {
    const wrapper = document.createElement("span");
    wrapper.className = "ldsv-topic-post-badges";
    const badge = document.createElement("span");
    badge.className = "ldsv-topic-notification new-topic";
    wrapper.append(" ", badge);
    parent.appendChild(wrapper);
    return;
  }

  if (unreadCount > 0) {
    const wrapper = document.createElement("span");
    wrapper.className = "ldsv-topic-post-badges";
    const link = document.createElement("a");
    link.href = topicUrl(topic, "lastUnread");
    link.className = "ldsv-topic-notification unread-posts";
    link.textContent = formatNumber(unreadCount);
    wrapper.append(" ", link);
    parent.appendChild(wrapper);
  }
}

function appendTopicAuthor(parent, topic) {
  const username = getTopicAuthorUsername(topic);
  if (!username) {
    return;
  }
  const displayNameParts = topicAuthorDisplayNameParts(topic, username);
  const displayName = displayNameParts.join(" ");

  const link = document.createElement("a");
  link.href = `/u/${encodeURIComponent(username)}`;
  link.className = "ldsv-topic-author";
  link.title = LDSV.messages.topic.author(displayName);

  const avatarUrl = topicAuthorAvatarUrl(topic, 48);
  if (avatarUrl) {
    const avatar = document.createElement("img");
    avatar.className = "ldsv-topic-author-avatar";
    avatar.crossOrigin = "anonymous";
    avatar.src = avatarMemoryCache.get(avatarUrl)?.dataUrl || avatarUrl;
    avatar.dataset.avatarUrl = avatarUrl;
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.width = 24;
    avatar.height = 24;
    if (!avatarMemoryCache.has(avatarUrl)) {
      avatar.addEventListener("load", onTopicAvatarLoad, { once: true });
    } else {
      touchAvatarMemoryCacheEntry(avatarUrl);
    }
    link.appendChild(avatar);
  }

  const label = document.createElement("span");
  label.className = "ldsv-topic-author-name";
  displayNameParts.forEach((part, index) => {
    if (index > 0) {
      label.appendChild(document.createTextNode(" "));
    }
    const namePart = document.createElement("span");
    namePart.className = index === 0 ? "ldsv-topic-author-name-primary" : "ldsv-topic-author-name-secondary";
    namePart.textContent = part;
    label.appendChild(namePart);
  });
  link.appendChild(label);
  parent.appendChild(link);
}

function topicAuthorDisplayNameParts(topic, username) {
  const name = String(getTopicAuthorName(topic) || "").trim();
  if (!name || name === username) {
    return [username];
  }
  return [name, username];
}

function topicAuthorAvatarUrl(topic, size) {
  const template = getTopicAuthorAvatarTemplate(topic);
  if (!template) {
    return "";
  }
  const path = template.replace("{size}", String(size));
  return path.startsWith("http") ? path : new URL(path, "https://cdn.ldstatic.com").href;
}

async function onTopicAvatarLoad(event) {
  const avatar = event.currentTarget;
  const avatarUrl = avatar?.dataset?.avatarUrl || "";
  if (!avatarUrl || avatarMemoryCache.has(avatarUrl)) {
    return;
  }

  try {
    const dataUrl = await imageElementToDataUrl(avatar);
    cacheAvatarDataUrl(avatarUrl, dataUrl);
  } catch (error) {
    LDSV.reportError("cache avatar image", error);
  }
}

function imageElementToDataUrl(image) {
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width <= 0 || height <= 0) {
    throw new Error("avatar image has no dimensions");
  }

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.82);
}

function cacheAvatarDataUrl(avatarUrl, dataUrl) {
  const bytes = estimateDataUrlBytes(dataUrl);
  if (bytes <= 0 || bytes > AVATAR_MEMORY_CACHE_ENTRY_MAX_BYTES || bytes > AVATAR_MEMORY_CACHE_MAX_BYTES) {
    return;
  }

  const existing = avatarMemoryCache.get(avatarUrl);
  if (existing) {
    avatarMemoryCacheBytes -= existing.bytes;
  }

  avatarMemoryCache.set(avatarUrl, {
    dataUrl,
    bytes,
    lastUsedAt: Date.now()
  });
  avatarMemoryCacheBytes += bytes;
  pruneAvatarMemoryCache();
}

function touchAvatarMemoryCacheEntry(avatarUrl) {
  const entry = avatarMemoryCache.get(avatarUrl);
  if (entry) {
    entry.lastUsedAt = Date.now();
  }
}

function pruneAvatarMemoryCache() {
  while (avatarMemoryCacheBytes > AVATAR_MEMORY_CACHE_MAX_BYTES && avatarMemoryCache.size > 0) {
    let oldestKey = null;
    let oldestUsedAt = Infinity;
    avatarMemoryCache.forEach((entry, key) => {
      if (entry.lastUsedAt < oldestUsedAt) {
        oldestUsedAt = entry.lastUsedAt;
        oldestKey = key;
      }
    });
    if (!oldestKey) {
      break;
    }
    const entry = avatarMemoryCache.get(oldestKey);
    avatarMemoryCache.delete(oldestKey);
    avatarMemoryCacheBytes -= entry?.bytes || 0;
  }
}

function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil((payload.length * 3) / 4);
}

function appendTopicRepliesMeta(parent, topic) {
  const replyCount = getReplyCount(topic);
  const link = document.createElement("a");
  link.href = topicUrl(topic, "firstPost");
  link.className = "ldsv-topic-replies-badge";
  link.setAttribute("aria-label", LDSV.messages.topic.replies(replyCount));

  const icon = createTopicMetricIcon("replies");

  const count = document.createElement("span");
  count.className = "ldsv-topic-replies-count";
  count.textContent = formatNumber(replyCount);

  link.append(icon, count);
  parent.appendChild(link);
}

function appendTopicViewsMeta(parent, topic) {
  const viewCount = Number(topic.views) || 0;
  const wrapper = document.createElement("span");
  wrapper.className = "ldsv-topic-views";
  wrapper.setAttribute("aria-label", LDSV.messages.topic.views(viewCount));
  wrapper.title = LDSV.messages.topic.views(formatNumber(viewCount));

  const icon = createTopicMetricIcon("views");

  const count = document.createElement("span");
  count.className = "ldsv-topic-views-count";
  count.textContent = formatNumber(viewCount);

  wrapper.append(icon, count);
  parent.appendChild(wrapper);
}

function appendTopicActivityMeta(parent, topic) {
  const activityDate = topic.bumped_at || topic.last_posted_at || topic.created_at;
  const label = formatRelativeDate(activityDate);
  if (!label) {
    return;
  }

  const link = document.createElement("a");
  link.href = topicUrl(topic, "lastPost");
  link.className = "ldsv-topic-activity-meta";
  link.title = activityTitle(topic);
  link.append(createTopicMetricIcon("activity"), document.createTextNode(label));
  parent.appendChild(link);
}

function createTopicMetricIcon(type) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.entries({
    class: `ldsv-topic-metric-icon ldsv-topic-${type}-icon`,
    viewBox: "0 0 24 24",
    width: "1em",
    height: "1em",
    "aria-hidden": "true",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  }).forEach(([name, value]) => icon.setAttribute(name, value));

  const metricIcon = LDSV.metricIcons[type];
  if (metricIcon?.paths) {
    metricIcon.paths.forEach((d) => appendSvgPath(icon, d));
  }
  if (metricIcon?.circles) {
    metricIcon.circles.forEach((attributes) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      Object.entries(attributes).forEach(([name, value]) => circle.setAttribute(name, value));
      icon.appendChild(circle);
    });
  }

  return icon;
}

function appendSvgPath(parent, d) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  parent.appendChild(path);
}

function appendCategoryBadge(parent, topic) {
  const categoryId = topic.category_id;
  if (categoryId == null) {
    return;
  }
  const category = getCategoryById(categoryId) || {
    id: categoryId,
    name: topic.category_name || topic.category_slug || LDSV.messages.topic.categoryFallback(categoryId),
    slug: topic.category_slug,
    color: topic.category_color,
    text_color: topic.category_text_color
  };

  const wrapper = document.createElement("span");
  wrapper.className = "ldsv-topic-category badge-category__wrapper";
  wrapper.style.setProperty("--category-badge-color", normalizeColor(category.color, "0088cc"));
  wrapper.style.setProperty("--category-badge-text-color", normalizeColor(category.text_color, "ffffff"));

  const badge = document.createElement("span");
  badge.className = categoryBadgeClassName(category);
  badge.dataset.categoryId = category.id;
  badge.dataset.dropClose = "true";
  const parentCategoryId = categoryParentId(category);
  if (parentCategoryId != null) {
    badge.dataset.parentCategoryId = parentCategoryId;
  }
  const description = category.description_text || category.description_excerpt || category.description;
  if (description) {
    badge.title = description;
  }

  if (shouldShowCategoryIcon(category)) {
    appendDiscourseSvgIcon(badge, category.icon);
  }
  if (category.read_restricted) {
    appendDiscourseSvgIcon(badge, "lock");
  }

  const name = document.createElement("span");
  name.className = "badge-category__name ldsv-topic-category-name";
  name.dir = "auto";
  name.textContent = category.name || category.slug || LDSV.messages.topic.categoryFallback(category.id);
  badge.appendChild(name);
  wrapper.appendChild(badge);
  parent.appendChild(wrapper);
}

function categoryBadgeClassName(category) {
  const classes = ["badge-category", "ldsv-topic-category-badge"];
  const parentCategoryId = categoryParentId(category);
  const styleType = safeCategoryStyleType(category.style_type, Boolean(safeIconName(category.icon)));
  if (category.read_restricted) {
    classes.push("restricted");
  }
  if (parentCategoryId != null) {
    classes.push("--has-parent");
  }
  classes.push(`--style-${styleType}`);
  return classes.join(" ");
}

function safeCategoryStyleType(styleType, hasIcon) {
  return ["icon", "emoji", "square"].includes(styleType)
    ? styleType
    : (hasIcon ? "icon" : "square");
}

function shouldShowCategoryIcon(category) {
  return safeCategoryStyleType(category.style_type, Boolean(safeIconName(category.icon))) === "icon" && Boolean(safeIconName(category.icon));
}

function appendTags(parent, topic) {
  if (!Array.isArray(topic.tags) || topic.tags.length === 0) {
    return;
  }

  const tags = document.createElement("span");
  tags.className = "ldsv-topic-tags";
  tags.setAttribute("aria-label", LDSV.messages.controls.tag);

  topic.tags.forEach((tag) => {
    const tagRecord = resolveTopicTag(tag);
    const tagName = tagDisplayName(tagRecord || tag);
    if (!tagName) {
      return;
    }

    const badge = document.createElement("span");
    badge.className = "discourse-tag box ldsv-topic-tag";
    applyTagBadgeStyle(badge, tagRecord);
    badge.appendChild(document.createTextNode(tagName));
    tags.appendChild(badge);
  });

  if (tags.children.length > 0) {
    parent.appendChild(tags);
  }
}

function resolveTopicTag(tag) {
  const tagId = normalizeTagId(tag);
  const tagName = tagDisplayName(tag);
  const normalizedName = tagName.trim().toLowerCase();
  return getTagById(tagId) || getTagById(tagName) || getTagById(normalizedName) || (tag && typeof tag === "object" ? tag : null);
}

function tagDisplayName(tag) {
  if (tag == null) {
    return "";
  }
  return typeof tag === "string" ? tag : (tag.name || tag.text || tag.slug || "");
}

function applyTagBadgeStyle(badge, tag) {
  if (!tag || typeof tag !== "object") {
    return;
  }

  const backgroundColor = tag.color || tag.bg_color || tag.background_color;
  const textColor = tag.text_color || tag.foreground_color;
  if (backgroundColor) {
    badge.style.setProperty("--color1", normalizeColor(backgroundColor, "e9ecef"));
  }
  if (textColor) {
    badge.style.setProperty("--color2", normalizeColor(textColor, "222222"));
  }
}

function appendDiscourseSvgIcon(parent, iconName) {
  const safeIcon = safeIconName(iconName);
  if (!safeIcon) {
    return;
  }

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", `fa d-icon d-icon-${safeIcon} svg-icon fa-width-auto svg-string`);
  icon.setAttribute("width", "1em");
  icon.setAttribute("height", "1em");
  icon.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${safeIcon}`);
  icon.appendChild(use);
  parent.appendChild(icon);
}

function safeIconName(iconName) {
  const text = String(iconName || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

function onTopicRowActivate(event) {
  if (wantsNewWindow(event)) {
    return;
  }

  const row = event.currentTarget;
  const topicId = getTopicIdForRow(row);
  if (topicId == null) {
    return;
  }

  const link = event.target.closest("a");
  if (link && !isTopicLinkForRow(link, topicId)) {
    return;
  }

  selectTopic(topicId);
}

function onTopicRowClick(event) {
  if (wantsNewWindow(event)) {
    return;
  }

  const target = event.target;
  if (target.closest("a")) {
    return;
  }

  const row = target.closest(".ldsv-topic-row");
  const topic = findTopicForRow(row);
  if (!topic) {
    return;
  }

  const link = row.querySelector(".ldsv-topic-main .ldsv-topic-title");
  if (link) {
    selectTopic(topic.id);
    link.click();
  }
}

function onTopicRowKeyDown(event) {
  if (event.key !== "Enter") {
    return;
  }

  const link = event.currentTarget.querySelector(".ldsv-topic-main .ldsv-topic-title");
  if (link) {
    selectTopic(getTopicIdForRow(event.currentTarget));
    link.click();
  }
}

function selectTopic(topicId) {
  const numericTopicId = Number(topicId);
  if (!Number.isFinite(numericTopicId)) {
    return;
  }

  selectedTopicId = numericTopicId;
  updateSelectedTopicRows();
}

function updateSelectedTopicRows() {
  forEachVisibleTopicRow((row, topicId) => {
    const isSelected = topicId === selectedTopicId;
    row.classList.toggle("selected", isSelected);
    row.classList.toggle("ldsv-active", isSelected);
    if (isSelected) {
      row.dataset.isLastViewedTopic = "true";
    } else {
      delete row.dataset.isLastViewedTopic;
    }
  });
}

function updateTopicRowReadState(topic) {
  if (!topic) {
    return;
  }

  const targetTopicId = Number(topic.id);
  forEachVisibleTopicRow((row, topicId) => {
    if (topicId !== targetTopicId) {
      return;
    }

    applyTopicRowClasses(row, topic);

    const unreadBadge = row.querySelector(".ldsv-topic-notification.unread-posts");
    const unreadCount = Number(topic.unread_posts || topic.new_posts || 0);
    if (unreadBadge) {
      if (unreadCount > 0) {
        unreadBadge.textContent = formatNumber(unreadCount);
      } else {
        const wrapper = unreadBadge.closest(".ldsv-topic-post-badges");
        wrapper?.remove();
      }
    }

    if (!topic.unseen) {
      row.querySelector(".ldsv-topic-notification.new-topic")?.closest(".ldsv-topic-post-badges")?.remove();
    }
  });
}

function updateVisibleTopicRow(topic) {
  if (!topic) {
    return false;
  }

  let updated = false;
  const currentTopicId = selectedTopicId ?? getCurrentTopicId();
  const targetTopicId = Number(topic.id);
  forEachVisibleTopicRow((row, topicId) => {
    if (topicId !== targetTopicId) {
      return;
    }

    const nextRow = createTopicRow(topic, currentTopicId);
    row.replaceWith(nextRow);
    updated = true;
  });
  return updated;
}

function forEachVisibleTopicRow(callback) {
  const panel = getPanel();
  if (!panel) {
    return;
  }

  panel.querySelectorAll(".ldsv-topic-list .ldsv-topic-row").forEach((row) => {
    callback(row, getTopicIdForRow(row));
  });
}

function getTopicIdForRow(row) {
  const topicId = Number(row?.dataset?.topicId);
  return Number.isFinite(topicId) ? topicId : null;
}

function findTopicForRow(row) {
  const topicId = getTopicIdForRow(row);
  if (topicId == null) {
    return null;
  }

  return findTopicById(topicId);
}

function isTopicLinkForRow(link, topicId) {
  try {
    return topicIdFromPath(new URL(link.href, window.location.origin).pathname) === topicId;
  } catch {
    return false;
  }
}

function getTopicRowClassName(topic) {
  const classNames = ["ldsv-topic-row"];
  TOPIC_ROW_CLASSES.forEach((rowClass) => {
    if (rowClass.enabled(topic)) {
      classNames.push(rowClass.className);
    }
  });
  if (Array.isArray(topic.tags)) {
    topic.tags.forEach((tag) => {
      const tagName = typeof tag === "string" ? tag : tag.name;
      if (tagName) {
        classNames.push(`tag-${cssSafeClass(tagName)}`);
      }
    });
  }
  return classNames.join(" ");
}

function applyTopicRowClasses(row, topic) {
  TOPIC_ROW_CLASSES.forEach((rowClass) => {
    row.classList.toggle(rowClass.className, rowClass.enabled(topic));
  });
}

function wantsNewWindow(event) {
  return (
    event.defaultPrevented ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    (event.button && event.button !== 0)
  );
}

function topicUrl(topic, mode = "base") {
  if (!topic?.id) {
    return "#";
  }

  const slug = String(topic.slug || "topic").trim() || "topic";
  const base = `/${topic.is_nested_view ? "n" : "t"}/${slug}/${topic.id}`;

  if (mode === "firstPost") {
    return `${base}/1`;
  }
  if (mode === "lastPost") {
    if (topic.is_nested_view) {
      return base;
    }
    return postUrl(base, topic.highest_post_number);
  }
  if (mode === "lastUnread") {
    if (topic.is_nested_view) {
      return base;
    }
    const lastRead = Number(topic.last_read_post_number) || 0;
    const highest = Number(topic.highest_post_number) || Number(topic.posts_count) || 0;
    const nextPost = Math.min(Math.max(lastRead + 1, 1), Math.max(highest, 1));
    return postUrl(base, nextPost);
  }

  return base;
}

function postUrl(base, postNumber) {
  const number = Number(postNumber);
  return number > 0 ? `${base}/${number}` : base;
}

