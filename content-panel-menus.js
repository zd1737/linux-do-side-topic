"use strict";

LDSV.feedMenuController = createMenuController({
  pickerKey: "feedPicker",
  triggerKey: "feedTrigger",
  menuKey: "feedMenu",
  columnSelector: ".ldsv-feed-menu-column",
  itemSelector: ".ldsv-feed-menu-item",
  floatingColumnWidth: 104,
  render: (panel, controls) => renderFeedMenu(controls.feedMenu),
  afterOpen: (panel, controls) => revealSelectedFeedPath(controls.feedMenu)
});
LDSV.categoryMenuController = createMenuController({
  pickerKey: "categoryPicker",
  triggerKey: "categoryTrigger",
  menuKey: "categoryMenu",
  columnSelector: ".ldsv-category-menu-column",
  itemSelector: ".ldsv-category-menu-item",
  floatingColumnWidth: 148,
  beforeClose: (controls) => rememberCategoryRootScrollTop(controls.categoryMenu),
  render: (panel, controls) => renderCategoryMenu(controls.categoryMenu),
  afterOpen: (panel, controls) => revealSelectedCategoryPathAfterRootScroll(controls.categoryMenu)
});
LDSV.tagMenuController = createMenuController({
  pickerKey: "tagPicker",
  triggerKey: "tagInput",
  menuKey: "tagMenu",
  itemSelector: ".ldsv-tag-menu-item",
  minWidth: 148,
  widthFromTrigger: true,
  clearWidth: true,
  render: (panel) => renderTagMenu(panel),
  afterClose: (controls) => controls.tagInput?.removeAttribute("aria-activedescendant")
});

function createMenuController(config) {
  function controlsFor(panel) {
    return panel ? getPanelControls(panel) : {};
  }

  function position(panel) {
    const controls = controlsFor(panel || getPanel());
    const trigger = controls[config.triggerKey];
    const menu = controls[config.menuKey];
    if (!trigger || !menu || menu.hidden) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const minWidth = config.widthFromTrigger
      ? Math.max(triggerRect.width, config.minWidth || 0)
      : menu.offsetWidth;
    if (config.widthFromTrigger) {
      menu.style.width = `${minWidth}px`;
    }
    const menuWidth = minWidth || menu.offsetWidth;
    const top = Math.min(triggerRect.bottom + 4, window.innerHeight - 48);
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${Math.max(8, Math.min(triggerRect.left, window.innerWidth - menuWidth - 8))}px`;
  }

  return {
    open(panel) {
      if (!panel) {
        return;
      }
      const controls = controlsFor(panel);
      const picker = controls[config.pickerKey];
      const trigger = controls[config.triggerKey];
      const menu = controls[config.menuKey];
      if (!picker || !trigger || !menu) {
        return;
      }

      config.render?.(panel, controls);
      menu.hidden = false;
      picker.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      position(panel);
      config.afterOpen?.(panel, controls);
    },
    close(panel) {
      if (!panel) {
        return;
      }
      const controls = controlsFor(panel);
      const picker = controls[config.pickerKey];
      const trigger = controls[config.triggerKey];
      const menu = controls[config.menuKey];
      config.beforeClose?.(controls);
      menu?.replaceChildren();
      if (menu) {
        menu.hidden = true;
        menu.style.left = "";
        menu.style.top = "";
        if (config.clearWidth) {
          menu.style.width = "";
        }
      }
      picker?.classList.remove("is-open");
      trigger?.setAttribute("aria-expanded", "false");
      config.afterClose?.(controls);
    },
    isOpen(panel) {
      return Boolean(panel && !controlsFor(panel)[config.menuKey]?.hidden);
    },
    position,
    setActiveItem(item) {
      if (!config.columnSelector) {
        return;
      }
      const column = item.closest(config.columnSelector);
      column?.querySelectorAll(`${config.itemSelector}.is-active`).forEach((activeItem) => {
        activeItem.classList.remove("is-active");
      });
      item.classList.add("is-active");
    },
    pruneColumns(menu, depth) {
      if (!config.columnSelector) {
        return;
      }
      menu.querySelectorAll(config.columnSelector).forEach((column) => {
        if (Number(column.dataset.depth) > depth) {
          column.remove();
        }
      });
    },
    positionSubmenuColumn(column, parentItem) {
      const parentRect = parentItem.getBoundingClientRect();
      const columnWidth = column.offsetWidth || config.floatingColumnWidth || 148;
      const columnHeight = column.offsetHeight || 0;
      const gap = 4;
      let left = parentRect.right + gap;
      let top = parentRect.top;

      if (left + columnWidth > window.innerWidth - 8) {
        left = Math.max(8, parentRect.left - columnWidth - gap);
      }
      if (top + columnHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - columnHeight - 8);
      }

      column.classList.add("is-floating");
      column.style.position = "fixed";
      column.style.left = `${left}px`;
      column.style.top = `${top}px`;
    }
  };
}

function syncFilterControls(panel) {
  if (!panel) {
    return;
  }
  normalizeCategorySelectionState();
  normalizeFeedSelectionState();
  syncFeedControl(panel);
  syncCategoryControl(panel);
  syncTagControl(panel);
}

async function refreshFilterOptions(panel = getPanel()) {
  if (!panel) {
    return;
  }

  const [categoryMap, tagMap] = await Promise.all([
    loadCategoryMetadata(),
    loadTagMetadata()
  ]);

  categories = mergeMaps(categories, categoryMap);
  tags = mergeMaps(tags, tagMap);
  const controls = getPanelControls(panel);
  normalizeCategorySelectionState();
  syncCategoryControl(panel);
  populateTagOptions(controls.tagPicker);
  syncFilterControls(panel);
}

function syncFeedControl(panel) {
  if (!panel) {
    return;
  }

  normalizeFeedSelectionState();
  const { feedTrigger, feedMenu } = getPanelControls(panel);
  if (feedTrigger) {
    const label = feedSelectionLabel();
    feedTrigger.textContent = label;
    feedTrigger.title = label;
  }
  if (feedMenu && !feedMenu.hidden) {
    renderFeedMenu(feedMenu);
    positionFeedMenu(panel);
  }
}

function openFeedMenu(panel) {
  LDSV.feedMenuController.open(panel);
}

function closeFeedMenu(panel) {
  LDSV.feedMenuController.close(panel);
}

function isFeedMenuOpen(panel) {
  return LDSV.feedMenuController.isOpen(panel);
}

function renderFeedMenu(menu) {
  menu.replaceChildren();
  const rootColumn = document.createElement("div");
  rootColumn.className = "ldsv-feed-menu-column";
  rootColumn.dataset.depth = "0";
  rootColumn.setAttribute("role", "group");
  FEED_OPTIONS.forEach((option) => {
    rootColumn.appendChild(createFeedMenuItem(option, 0));
  });
  menu.appendChild(rootColumn);
}

function createFeedMenuItem(option, depth, parentFeed = "") {
  const item = document.createElement("button");
  const feed = depth === 0 ? option.value : parentFeed;
  const subset = depth === 0 ? "" : option.value;
  item.type = "button";
  item.className = "ldsv-feed-menu-item";
  item.dataset.feedValue = feed;
  item.dataset.feedSubset = subset;
  item.dataset.depth = String(depth);
  item.setAttribute("role", "menuitem");

  const label = document.createElement("span");
  label.className = "ldsv-feed-menu-label";
  label.textContent = option.label;
  item.appendChild(label);

  if (Array.isArray(option.children) && option.children.length > 0) {
    item.classList.add("has-children");
    item.setAttribute("aria-haspopup", "menu");
    const chevron = document.createElement("span");
    chevron.className = "ldsv-feed-menu-chevron";
    chevron.textContent = "›";
    item.appendChild(chevron);
  }
  if (isSelectedFeedOption(feed, subset)) {
    item.classList.add("is-selected");
    item.setAttribute("aria-current", "true");
  }

  return item;
}

function showFeedSubmenuForItem(item) {
  const menu = item.closest("[data-feed-menu]");
  const depth = Number(item.dataset.depth) || 0;
  if (!menu) {
    return;
  }

  setActiveFeedMenuItem(item);
  pruneFeedMenuColumns(menu, depth);
  if (depth > 0) {
    return;
  }

  const option = FEED_OPTIONS.find((feedOption) => feedOption.value === item.dataset.feedValue);
  const children = option?.children || [];
  if (children.length === 0) {
    positionFeedMenu(getPanel());
    return;
  }

  const childColumn = document.createElement("div");
  childColumn.className = "ldsv-feed-menu-column";
  childColumn.dataset.depth = String(depth + 1);
  childColumn.setAttribute("role", "group");
  children.forEach((child) => {
    childColumn.appendChild(createFeedMenuItem(child, depth + 1, option.value));
  });
  menu.appendChild(childColumn);
  positionFeedSubmenuColumn(childColumn, item);
}

function revealSelectedFeedPath(menu) {
  if (currentFeed() !== "new" || !currentFeedSubset()) {
    return;
  }

  const item = menu.querySelector(".ldsv-feed-menu-item[data-feed-value='new'][data-depth='0']");
  if (item) {
    showFeedSubmenuForItem(item);
  }
}

function setActiveFeedMenuItem(item) {
  LDSV.feedMenuController.setActiveItem(item);
}

function pruneFeedMenuColumns(menu, depth) {
  LDSV.feedMenuController.pruneColumns(menu, depth);
}

function positionFeedMenu(panel) {
  LDSV.feedMenuController.position(panel);
}

function positionFeedSubmenuColumn(column, parentItem) {
  LDSV.feedMenuController.positionSubmenuColumn(column, parentItem);
}

async function applyFeedSelection(feed, subset) {
  const panel = getPanel();
  state.feed = FEEDS[feed] ? feed : DEFAULT_STATE.feed;
  state.feedSubset = state.feed === "new" ? normalizeFeedSubset(subset) : "";
  closeFeedMenu(panel);
  syncFeedControl(panel);
  saveStateDebounced();
  await loadTopics();
}

function syncCategoryControl(panel) {
  if (!panel) {
    return;
  }

  const { categoryTrigger, categoryMenu } = getPanelControls(panel);
  if (categoryTrigger) {
    const label = categorySelectionLabel();
    categoryTrigger.textContent = label;
    categoryTrigger.title = label;
  }
  if (categoryMenu && !categoryMenu.hidden) {
    renderCategoryMenu(categoryMenu);
    positionCategoryMenu(panel);
    revealSelectedCategoryPathAfterRootScroll(categoryMenu);
  }
}

function populateTagOptions(tagPicker) {
  if (!tagPicker) {
    return;
  }

  syncTagControl(tagPicker.closest(".ldsv-panel"));
}

function uniqueCategories() {
  const seen = new Set();
  const result = [];
  categories.forEach((category) => {
    const id = normalizeNullableNumber(category?.id);
    if (id == null || seen.has(id)) {
      return;
    }
    seen.add(id);
    result.push(category);
  });
  return result;
}

function uniqueTags() {
  const seen = new Set();
  const result = [];
  tags.forEach((tag) => {
    const key = normalizeTagId(tag);
    if (key == null || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(tag);
  });
  return result;
}

function sortedTags() {
  return uniqueTags()
    .slice()
    .sort((a, b) => tagOptionLabel(a).localeCompare(tagOptionLabel(b), preferredLocale()));
}

function syncTagControl(panel) {
  if (!panel) {
    return;
  }

  const { tagInput, tagMenu } = getPanelControls(panel);
  if (!tagInput) {
    return;
  }

  tagInput.value = tagSelectionLabel();
  tagInput.dataset.tagValue = formatTagFilterValue();
  tagInput.title = tagInput.value || LDSV.messages.controls.allTags;
  if (tagMenu && !tagMenu.hidden) {
    renderTagMenu(panel);
    positionTagMenu(panel);
  }
}

function openTagMenu(panel) {
  LDSV.tagMenuController.open(panel);
}

function closeTagMenu(panel) {
  LDSV.tagMenuController.close(panel);
}

function closeTagMenuAndBlur(panel) {
  if (!panel) {
    return;
  }

  const { tagInput } = getPanelControls(panel);
  closeTagMenu(panel);
  if (document.activeElement === tagInput) {
    tagInput.blur();
  }
}

function isTagMenuClosed(panel) {
  return !LDSV.tagMenuController.isOpen(panel);
}

function renderTagMenu(panel) {
  const { tagInput, tagMenu } = getPanelControls(panel);
  if (!tagInput || !tagMenu) {
    return;
  }

  tagMenu.replaceChildren();
  const query = normalizeTagSearchText(tagInput.value);
  const options = [{ value: ALL_FILTER_VALUE, label: LDSV.messages.controls.allTags, isAll: true }];
  const matchedTags = sortedTags()
    .filter((tag) => tagMatchesQuery(tag, query))
    .slice(0, TAG_FILTER_OPTION_LIMIT);
  matchedTags.forEach((tag) => {
    options.push({
      value: tagOptionValue(tag),
      label: tagOptionLabel(tag),
      isAll: false
    });
  });

  options.forEach((option, index) => {
    tagMenu.appendChild(createTagMenuItem(option, index, query ? index === 1 : index === 0));
  });
}

function createTagMenuItem(option, index, isActive) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "ldsv-tag-menu-item";
  item.id = `ldsv-tag-option-${index}`;
  item.dataset.tagValue = option.value;
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", option.value === formatTagFilterValue() ? "true" : "false");
  item.textContent = option.label;
  if (option.value === formatTagFilterValue()) {
    item.classList.add("is-selected");
  }
  if (isActive) {
    item.classList.add("is-active");
  }
  return item;
}

function positionTagMenu(panel) {
  LDSV.tagMenuController.position(panel);
}

function moveActiveTagOption(tagMenu, direction) {
  const options = [...(tagMenu?.querySelectorAll(".ldsv-tag-menu-item") || [])];
  if (options.length === 0) {
    return;
  }

  const currentIndex = Math.max(0, options.findIndex((option) => option.classList.contains("is-active")));
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  options.forEach((option) => option.classList.remove("is-active"));
  options[nextIndex].classList.add("is-active");
  options[nextIndex].scrollIntoView({ block: "nearest" });
  tagMenu.closest(".ldsv-panel")?.querySelector("[data-tag-input]")?.setAttribute("aria-activedescendant", options[nextIndex].id);
}

async function applyTagSelection(panel, value) {
  if (!panel) {
    return;
  }

  const tag = parseTagFilterInput(value || "");
  state.tagName = tag.name;
  state.tagId = tag.id;
  closeTagMenu(panel);
  syncFilterControls(panel);
  saveStateDebounced();
  await loadTopics();
}

async function applyTagTextInput(panel) {
  if (!panel) {
    return;
  }

  const { tagInput } = getPanelControls(panel);
  const text = String(tagInput?.value || "").trim();
  if (!text) {
    await applyTagSelection(panel, ALL_FILTER_VALUE);
    return;
  }

  const matchedTag = findTagByLabel(text);
  await applyTagSelection(panel, matchedTag ? tagOptionValue(matchedTag) : encodePathSegment(text));
}

function tagMatchesQuery(tag, query) {
  if (!query) {
    return true;
  }

  return normalizeTagSearchText(tagOptionLabel(tag)).includes(query) ||
    normalizeTagSearchText(tag?.slug || "").includes(query);
}

function findTagByLabel(label) {
  const normalizedLabel = normalizeTagSearchText(label);
  return sortedTags().find((tag) => {
    return normalizeTagSearchText(tagOptionLabel(tag)) === normalizedLabel ||
      normalizeTagSearchText(tag?.slug || "") === normalizedLabel;
  }) || null;
}

function normalizeTagSearchText(value) {
  return String(value || "").trim().toLocaleLowerCase(preferredLocale());
}

function openCategoryMenu(panel) {
  LDSV.categoryMenuController.open(panel);
}

function closeCategoryMenu(panel) {
  LDSV.categoryMenuController.close(panel);
}

function isCategoryMenuOpen(panel) {
  return LDSV.categoryMenuController.isOpen(panel);
}

function renderCategoryMenu(menu) {
  rememberCategoryRootScrollTop(menu);
  menu.replaceChildren();
  const { roots, childrenByParentId } = categoryMenuTree();
  const rootColumn = createCategoryMenuColumn(roots, childrenByParentId, 0);
  rootColumn.prepend(createAllCategoryMenuItem());
  menu.appendChild(rootColumn);
}

function categoryMenuTree() {
  const categoryList = uniqueCategories();
  const childrenByParentId = categoryChildrenByParentId(categoryList);
  const categoryIds = new Set(categoryList.map((category) => normalizeNullableNumber(category?.id)).filter((id) => id != null));
  const roots = categoryList.filter((category) => {
    const parentId = categoryParentId(category);
    return parentId == null || !categoryIds.has(parentId);
  });

  return {
    childrenByParentId,
    roots: sortCategoriesByName(roots)
  };
}

function categoryChildrenByParentId(categoryList) {
  const childrenByParentId = new Map();
  categoryList.forEach((category) => {
    const parentId = categoryParentId(category);
    if (parentId == null) {
      return;
    }
    const children = childrenByParentId.get(parentId) || [];
    children.push(category);
    childrenByParentId.set(parentId, children);
  });
  return childrenByParentId;
}

function createCategoryMenuColumn(categoryList, childrenByParentId, depth) {
  const column = document.createElement("div");
  column.className = "ldsv-category-menu-column";
  column.dataset.depth = String(depth);
  column.setAttribute("role", "group");
  sortCategoriesByName(categoryList).forEach((category) => {
    column.appendChild(createCategoryMenuItem(category, childrenByParentId, depth));
  });
  return column;
}

function rememberCategoryRootScrollTop(menu) {
  const rootColumn = menu?.querySelector?.(".ldsv-category-menu-column[data-depth='0']");
  if (rootColumn) {
    categoryRootScrollTop = rootColumn.scrollTop;
  }
}

function restoreCategoryRootScrollTop(rootColumn) {
  if (!rootColumn || categoryRootScrollTop <= 0) {
    return false;
  }
  rootColumn.scrollTop = categoryRootScrollTop;
  return true;
}

function revealSelectedCategoryPathAfterRootScroll(menu) {
  const rootColumn = menu?.querySelector?.(".ldsv-category-menu-column[data-depth='0']");
  restoreCategoryRootScrollTop(rootColumn);
  window.requestAnimationFrame(() => {
    restoreCategoryRootScrollTop(rootColumn);
    revealSelectedCategoryPath(menu);
  });
}

function createAllCategoryMenuItem() {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "ldsv-category-menu-item";
  item.dataset.categoryValue = ALL_FILTER_VALUE;
  item.dataset.depth = "0";
  item.setAttribute("role", "menuitem");
  item.textContent = LDSV.messages.controls.allCategories;
  if (!state.categoryId) {
    item.classList.add("is-selected");
    item.setAttribute("aria-current", "true");
  }
  return item;
}

function createCategoryMenuItem(category, childrenByParentId, depth) {
  const categoryId = normalizeNullableNumber(category?.id);
  const item = document.createElement("button");
  item.type = "button";
  item.className = "ldsv-category-menu-item";
  item.dataset.categoryValue = categoryOptionValue(category);
  item.dataset.categoryId = String(categoryId);
  item.dataset.depth = String(depth);
  item.setAttribute("role", "menuitem");

  const label = document.createElement("span");
  label.className = "ldsv-category-menu-label";
  label.textContent = categoryDisplayName(category);
  item.appendChild(label);

  const children = childrenByParentId.get(categoryId) || [];
  if (children.length > 0) {
    item.classList.add("has-children");
    item.setAttribute("aria-haspopup", "menu");
    const chevron = document.createElement("span");
    chevron.className = "ldsv-category-menu-chevron";
    chevron.textContent = "›";
    item.appendChild(chevron);
  }
  if (normalizeFilterId(state.categoryId) === String(categoryId)) {
    item.classList.add("is-selected");
    item.setAttribute("aria-current", "true");
  }

  return item;
}

function showCategorySubmenuForItem(item) {
  const menu = item.closest("[data-category-menu]");
  const categoryId = normalizeNullableNumber(item.dataset.categoryId);
  const depth = Number(item.dataset.depth) || 0;
  if (!menu) {
    return;
  }

  setActiveCategoryMenuItem(item);
  pruneCategoryMenuColumns(menu, depth);
  if (categoryId == null) {
    positionCategoryMenu(getPanel());
    return;
  }

  const { childrenByParentId } = categoryMenuTree();
  const children = sortCategoriesByName(childrenByParentId.get(categoryId) || []);
  if (children.length > 0) {
    const childColumn = createCategoryMenuColumn(children, childrenByParentId, depth + 1);
    menu.appendChild(childColumn);
    positionCategorySubmenuColumn(childColumn, item);
  }
}

function revealSelectedCategoryPath(menu) {
  const selectedPath = selectedCategoryPath();
  if (selectedPath.length === 0) {
    return;
  }

  const { childrenByParentId } = categoryMenuTree();
  selectedPath.forEach((category, depth) => {
    const categoryId = normalizeNullableNumber(category?.id);
    const item = menu.querySelector(`.ldsv-category-menu-item[data-category-id='${categoryId}'][data-depth='${depth}']`);
    if (!item) {
      return;
    }

    setActiveCategoryMenuItem(item);
    const children = sortCategoriesByName(childrenByParentId.get(categoryId) || []);
    if (children.length > 0 && depth < selectedPath.length - 1) {
      const childColumn = createCategoryMenuColumn(children, childrenByParentId, depth + 1);
      menu.appendChild(childColumn);
      positionCategorySubmenuColumn(childColumn, item);
    }
  });
}

function selectedCategoryPath() {
  const selectedCategoryId = normalizeNullableNumber(state.categoryId);
  if (selectedCategoryId == null) {
    return [];
  }

  const path = [];
  const seen = new Set();
  let current = getCategoryById(selectedCategoryId);
  while (current) {
    const currentId = normalizeNullableNumber(current.id);
    if (currentId == null || seen.has(currentId)) {
      break;
    }
    seen.add(currentId);
    path.unshift(current);

    const parentId = categoryParentId(current);
    current = parentId == null ? null : getCategoryById(parentId);
  }
  return path;
}

function setActiveCategoryMenuItem(item) {
  LDSV.categoryMenuController.setActiveItem(item);
}

function pruneCategoryMenuColumns(menu, depth) {
  LDSV.categoryMenuController.pruneColumns(menu, depth);
}

function positionCategoryMenu(panel) {
  LDSV.categoryMenuController.position(panel);
}

function positionCategorySubmenuColumn(column, parentItem) {
  LDSV.categoryMenuController.positionSubmenuColumn(column, parentItem);
}

function categorySelectionLabel() {
  const categoryId = normalizeFilterId(state.categoryId);
  if (!categoryId) {
    return LDSV.messages.controls.allCategories;
  }
  const category = getCategoryById(categoryId);
  return categoryDisplayName(category, categoryId);
}

function feedSelectionLabel() {
  const feed = currentFeed();
  const feedLabel = FEEDS[feed]?.label || FEEDS[DEFAULT_STATE.feed].label;
  const subset = currentFeedSubset();
  if (feed !== "new" || !subset) {
    return feedLabel;
  }

  return `${feedLabel}/${LDSV.messages.feedSubset[subset]}`;
}

function isSelectedFeedOption(feed, subset) {
  return currentFeed() === feed && currentFeedSubset() === normalizeFeedSubset(subset);
}

function currentFeedSubset() {
  return currentFeed() === "new" ? normalizeFeedSubset(state.feedSubset) : "";
}

function normalizeFeedSelectionState() {
  state.feed = FEEDS[state.feed] ? state.feed : DEFAULT_STATE.feed;
  state.feedSubset = state.feed === "new" ? normalizeFeedSubset(state.feedSubset) : "";
}

function sortCategoriesByName(categoryList) {
  return categoryList
    .slice()
    .sort((a, b) => categoryDisplayName(a).localeCompare(categoryDisplayName(b), preferredLocale()));
}

function categoryOptionValue(category) {
  const id = normalizeNullableNumber(category?.id);
  if (id == null) {
    return "";
  }
  return `${categorySlugPath(category)}/${id}`;
}

function tagOptionValue(tag) {
  const id = normalizeNullableNumber(tag?.id);
  const name = tag?.slug || tag?.name || tag?.text || "";
  if (id != null && name) {
    return `${encodePathSegment(name)}/${id}`;
  }
  if (id != null) {
    return String(id);
  }
  return encodePathSegment(name);
}

function tagOptionLabel(tag) {
  return tag?.name || tag?.slug || tag?.text || String(tag?.id || "");
}

function tagSelectionLabel() {
  const tagId = normalizeNullableNumber(state.tagId);
  const tagName = String(state.tagName || "").trim();
  if (tagId == null && !tagName) {
    return "";
  }

  const tag = tagId == null ? null : getTagById(tagId);
  return tagOptionLabel(tag) || tagName || String(tagId);
}

function applyCategorySelection(value) {
  const category = parseCategoryFilterInput(value || "");
  state.categoryId = category.id;
  state.categorySlug = category.slug;
  state.parentCategoryId = category.id;
  normalizeCategorySelectionState();
  syncFilterControls(getPanel());
}

function normalizeCategorySelectionState() {
  const categoryId = normalizeFilterId(state.categoryId);
  let parentCategoryId = normalizeFilterId(state.parentCategoryId);
  if (!categoryId) {
    state.parentCategoryId = "";
    state.categoryId = "";
    state.categorySlug = "";
    return;
  }

  const category = getCategoryById(categoryId);
  const derivedParentId = normalizeNullableNumber(categoryParentId(category));
  if (!parentCategoryId) {
    parentCategoryId = derivedParentId == null ? categoryId : String(derivedParentId);
  }
  if (derivedParentId != null) {
    parentCategoryId = String(derivedParentId);
  }

  state.parentCategoryId = parentCategoryId;
  state.categoryId = categoryId;
  if (category) {
    state.categorySlug = categorySlugPath(category);
  }
}

function formatTagFilterValue() {
  const name = String(state.tagName || "").trim();
  const id = String(state.tagId || "").trim();
  if (!name && !id) {
    return ALL_FILTER_VALUE;
  }
  const namePath = name ? encodePathSegment(name) : "";
  if (namePath && id) {
    return `${namePath}/${id}`;
  }
  return namePath || id;
}

function parseCategoryFilterInput(value) {
  return parseSlashIdValue(value, "slug");
}

function parseTagFilterInput(value) {
  return parseSlashIdValue(value, "name");
}

function parseSlashIdValue(value, pathKey) {
  const text = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!text || text === ALL_FILTER_VALUE) {
    return { id: "", [pathKey]: "" };
  }

  const parts = text.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  if (/^\d+$/.test(last)) {
    return {
      id: last,
      [pathKey]: decodePath(parts.slice(0, -1).join("/"))
    };
  }

  return {
    id: "",
    [pathKey]: decodePath(parts.join("/"))
  };
}

