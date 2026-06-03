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
  const stride = Math.max(1, virtualTopicStride);
  const visibleCount = Math.min(
    topicCount,
    Math.ceil(viewportHeight / stride) + VIRTUAL_TOPIC_OVERSCAN * 2
  );
  const maxStart = Math.max(0, topicCount - visibleCount);
  const start = clamp(Math.floor(localScrollTop / stride) - VIRTUAL_TOPIC_OVERSCAN, 0, maxStart);
  const end = clamp(start + visibleCount, start, topicCount);
  const topSpacer = spacerHeightForTopicCount(start);
  const bottomSpacer = spacerHeightForTopicCount(topicCount - end);

  return { start, end, topSpacer, bottomSpacer };
}

function spacerHeightForTopicCount(topicCount) {
  if (topicCount <= 0) {
    return 0;
  }

  return Math.max(0, topicCount * virtualTopicStride - VIRTUAL_TOPIC_ROW_GAP);
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

function rerenderVisibleTopicWindow(list) {
  const table = list?.querySelector(".ldsv-topic-list");
  const oldBody = table?.querySelector(".ldsv-topic-list-body");
  if (!list || !table || !oldBody || topics.length === 0) {
    renderTopics({ preserveScroll: true });
    return;
  }

  const previousScrollTop = list.scrollTop;
  const currentTopicId = selectedTopicId ?? getCurrentTopicId();
  const virtualWindow = getVirtualTopicWindow(
    list,
    topics.length,
    previousScrollTop,
    getCurrentTopicTableTop(list)
  );

  const nextBody = createTopicListBody(topics, currentTopicId, virtualWindow);
  oldBody.replaceWith(nextBody);
  syncVirtualTopicRenderState(virtualWindow, topics.length);
  list.scrollTop = previousScrollTop;
}

function hasReusableTopicTable(list) {
  return Boolean(
    list?.querySelector(".ldsv-topic-list") &&
    !list.querySelector(".ldsv-loader, .ldsv-load-error, .ldsv-empty") &&
    topics.length > 0 &&
    topics.length === virtualRenderedTopicCount &&
    virtualRenderedStart >= 0 &&
    !virtualTopicStrideNeedsRefresh
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
  virtualTopicStrideNeedsRefresh = true;
}

function measureVirtualTopicStride(table) {
  const rows = [...table.querySelectorAll(".ldsv-topic-row")];
  if (rows.length === 0) {
    return false;
  }

  let measuredStride = 0;
  if (rows.length > 1) {
    let total = 0;
    let count = 0;
    rows.forEach((row, index) => {
      const nextRow = rows[index + 1];
      if (!nextRow) {
        return;
      }

      const distance = nextRow.offsetTop - row.offsetTop;
      if (distance > 0) {
        total += distance;
        count += 1;
      }
    });
    measuredStride = count > 0 ? total / count : 0;
  }

  if (measuredStride <= 0) {
    measuredStride = rows[0].getBoundingClientRect().height + VIRTUAL_TOPIC_ROW_GAP;
  }

  if (Number.isFinite(measuredStride) && measuredStride > 0) {
    const nextStride = clamp(Math.round(measuredStride), 48, 220);
    if (virtualTopicStrideNeedsRefresh && nextStride !== virtualTopicStride) {
      virtualTopicStride = nextStride;
      virtualTopicStrideNeedsRefresh = false;
      return true;
    }
  }
  virtualTopicStrideNeedsRefresh = false;
  return false;
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

function createTopicCell(topic) {
  const cell = document.createElement("td");
  cell.className = "ldsv-topic-main ldsv-topic-list-data";

  const taxonomy = document.createElement("span");
  taxonomy.className = "ldsv-topic-taxonomy";
  appendCategoryBadge(taxonomy, topic);
  appendTags(taxonomy, topic);

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
  appendTopicBadges(topLine, topic);

  const bottomLine = document.createElement("div");
  bottomLine.className = "ldsv-topic-bottom-line";

  const meta = document.createElement("span");
  meta.className = "ldsv-topic-meta";
  appendTopicAuthor(meta, topic);
  appendTopicRepliesMeta(meta, topic);
  appendTopicViewsMeta(meta, topic);
  appendTopicActivityMeta(meta, topic);

  if (taxonomy.children.length > 0) {
    cell.appendChild(taxonomy);
  }
  cell.appendChild(topLine);
  if (meta.children.length > 0) {
    bottomLine.appendChild(meta);
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
    wrapper.appendChild(status);
  });

  if (wrapper.children.length > 0) {
    parent.appendChild(wrapper);
  }
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

  const link = document.createElement("a");
  link.href = `/u/${encodeURIComponent(username)}`;
  link.className = "ldsv-topic-author";
  link.title = LDSV.messages.topic.author(username);
  link.textContent = username;
  parent.appendChild(link);
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
  wrapper.className = "ldsv-topic-category";
  wrapper.style.setProperty("--category-badge-color", normalizeColor(category.color, "0088cc"));
  if (category.text_color) {
    wrapper.style.setProperty("--category-badge-text-color", normalizeColor(category.text_color, "ffffff"));
  }

  const badge = document.createElement("span");
  badge.className = "ldsv-topic-category-badge";
  badge.dataset.categoryId = category.id;

  const name = document.createElement("span");
  name.className = "ldsv-topic-category-name";
  name.textContent = category.name || category.slug || LDSV.messages.topic.categoryFallback(category.id);
  badge.appendChild(name);
  wrapper.appendChild(badge);
  parent.appendChild(wrapper);
}

function appendTags(parent, topic) {
  if (!Array.isArray(topic.tags) || topic.tags.length === 0) {
    return;
  }

  const tags = document.createElement("ul");
  tags.className = "ldsv-topic-tags";
  tags.setAttribute("aria-label", LDSV.messages.controls.tag);

  topic.tags.forEach((tag, index) => {
    const tagName = typeof tag === "string" ? tag : tag.name;
    if (!tagName) {
      return;
    }

    const item = document.createElement("li");
    const link = document.createElement("span");
    link.className = "ldsv-topic-tag";
    link.textContent = tagName;
    item.appendChild(link);

    if (index < topic.tags.length - 1) {
      const separator = document.createElement("span");
      separator.className = "ldsv-topic-tag-separator";
      separator.textContent = ",";
      item.appendChild(separator);
    }

    tags.appendChild(item);
  });

  if (tags.children.length > 0) {
    parent.appendChild(tags);
  }
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

