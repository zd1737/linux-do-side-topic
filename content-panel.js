"use strict";

async function init() {
  if (document.getElementById(PANEL_ID)) {
    return;
  }

  const root = await waitForDiscourseRoot();
  if (!root || document.getElementById(PANEL_ID)) {
    return;
  }

  state = clampState({ ...DEFAULT_STATE, ...(await loadState()) });
  createPanel(root);
  syncPanelVisibility();
  observeDiscourseNavigation();
  setupTopicListUpdates();
  setupVersionCheck();
  if (isTopicPage()) {
    await loadTopics();
  }
}
function isTopicPage() {
  return /^\/[tn](\/|$)/.test(window.location.pathname);
}

function initializePanelControls(panel) {
  const controls = getPanelControls(panel);

  syncFeedControl(panel);
  syncCategoryControl(panel);
  populateTagOptions(controls.tagPicker);
  syncFilterControls(panel);
  refreshFilterOptions(panel);
}

function bindPanelEvents(panel) {
  const controls = getPanelControls(panel);

  controls.dragHandle.addEventListener("pointerdown", onDragStart);
  controls.clearFiltersButton.addEventListener("click", onClearFilters);
  controls.scrollTopButton.addEventListener("click", onScrollTopClick);
  controls.showIncomingButton.addEventListener("click", onShowIncomingClick);
  controls.quickRefreshButton.addEventListener("click", onQuickRefreshClick);
  controls.openReleaseButton.addEventListener("click", onOpenUpdateReleaseClick);
  controls.ignoreVersionButton.addEventListener("click", onIgnoreUpdateVersionClick);
  controls.collapseButton.addEventListener("pointerdown", onCollapseButtonPointerDown);
  controls.collapseButton.addEventListener("click", onCollapseClick);
  controls.list.addEventListener("scroll", onListScroll);
  controls.resizeHandles.forEach((handle) => {
    handle.addEventListener("pointerdown", onResizeStart);
  });
  controls.feedTrigger.addEventListener("click", onFeedTriggerClick);
  controls.feedMenu.addEventListener("click", onFeedMenuClick);
  controls.feedMenu.addEventListener("pointerover", onFeedMenuPointerOver);
  controls.feedMenu.addEventListener("focusin", onFeedMenuFocusIn);
  controls.categoryTrigger.addEventListener("click", onCategoryTriggerClick);
  controls.categoryMenu.addEventListener("click", onCategoryMenuClick);
  controls.categoryMenu.addEventListener("pointerover", onCategoryMenuPointerOver);
  controls.categoryMenu.addEventListener("focusin", onCategoryMenuFocusIn);
  controls.categoryMenu.addEventListener("scroll", onCategoryMenuScroll, true);
  controls.tagInput.addEventListener("input", onTagFilterInput);
  controls.tagInput.addEventListener("pointerdown", onTagInputPointerDown);
  controls.tagInput.addEventListener("focus", onTagInputFocus);
  controls.tagInput.addEventListener("keydown", onTagInputKeyDown);
  controls.tagMenu.addEventListener("pointerdown", onTagMenuPointerDown);
  controls.tagMenu.addEventListener("click", onTagMenuClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);
  LDSV.registerCleanup(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    document.removeEventListener("keydown", onDocumentKeyDown);
  });
}

function onQuickRefreshClick(event) {
  event.preventDefault();
  loadTopics();
}

function onScrollTopClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const list = event.currentTarget.closest(".ldsv-panel")?.querySelector(".ldsv-list");
  if (!list) {
    return;
  }

  list.scrollTop = 0;
  renderTopics({ preserveScroll: true });
  list.scrollTop = 0;
}

function onFeedTriggerClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const panel = event.currentTarget.closest(".ldsv-panel");
  if (isFeedMenuOpen(panel)) {
    closeFeedMenu(panel);
    return;
  }
  openFeedMenu(panel);
}

async function onFeedMenuClick(event) {
  const item = event.target.closest("[data-feed-value]");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }

  event.preventDefault();
  await applyFeedSelection(item.dataset.feedValue || "", item.dataset.feedSubset || "");
}

function onFeedMenuPointerOver(event) {
  const item = event.target.closest(".ldsv-feed-menu-item");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }
  showFeedSubmenuForItem(item);
}

function onFeedMenuFocusIn(event) {
  const item = event.target.closest(".ldsv-feed-menu-item");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }
  showFeedSubmenuForItem(item);
}

function onTagFilterInput(event) {
  const panel = event.currentTarget.closest(".ldsv-panel");
  openTagMenu(panel);
}

function onTagInputFocus(event) {
  openTagMenu(event.currentTarget.closest(".ldsv-panel"));
  event.currentTarget.select();
}

function onTagInputPointerDown(event) {
  const panel = event.currentTarget.closest(".ldsv-panel");
  if (isTagMenuClosed(panel)) {
    window.requestAnimationFrame(() => openTagMenu(panel));
  }
}

async function onTagInputKeyDown(event) {
  const panel = event.currentTarget.closest(".ldsv-panel");
  if (!panel) {
    return;
  }

  const { tagMenu } = getPanelControls(panel);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (isTagMenuClosed(panel)) {
      openTagMenu(panel);
    }
    moveActiveTagOption(tagMenu, event.key === "ArrowDown" ? 1 : -1);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    if (!isTagMenuClosed(panel)) {
      const activeOption = tagMenu.querySelector(".ldsv-tag-menu-item.is-active");
      if (activeOption) {
        await applyTagSelection(panel, activeOption.dataset.tagValue || "");
        return;
      }
    }
    await applyTagTextInput(panel);
    return;
  }

  if (event.key === "Escape") {
    closeTagMenu(panel);
    syncTagControl(panel);
    event.currentTarget.blur();
  }
}

function onTagMenuPointerDown(event) {
  if (event.target.closest("[data-tag-value]")) {
    event.preventDefault();
  }
}

async function onTagMenuClick(event) {
  const item = event.target.closest("[data-tag-value]");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }

  event.preventDefault();
  await applyTagSelection(event.currentTarget.closest(".ldsv-panel"), item.dataset.tagValue || "");
}

function onCategoryTriggerClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const panel = event.currentTarget.closest(".ldsv-panel");
  if (isCategoryMenuOpen(panel)) {
    closeCategoryMenu(panel);
    return;
  }
  openCategoryMenu(panel);
}

async function onCategoryMenuClick(event) {
  const item = event.target.closest("[data-category-value]");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }

  event.preventDefault();
  applyCategorySelection(item.dataset.categoryValue || "");
  closeCategoryMenu(getPanel());
  saveStateDebounced();
  await loadTopics();
}
function onCategoryMenuPointerOver(event) {
  const item = event.target.closest(".ldsv-category-menu-item");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }
  showCategorySubmenuForItem(item);
}

function onCategoryMenuFocusIn(event) {
  const item = event.target.closest(".ldsv-category-menu-item");
  if (!item || !event.currentTarget.contains(item)) {
    return;
  }
  showCategorySubmenuForItem(item);
}

function onCategoryMenuScroll(event) {
  const column = event.target.closest?.(".ldsv-category-menu-column");
  if (column?.dataset.depth === "0") {
    categoryRootScrollTop = column.scrollTop;
  }
}

function onDocumentPointerDown(event) {
  const panel = getPanel();
  if (!panel) {
    return;
  }
  if (
    isFeedMenuOpen(panel) &&
    !event.target.closest("[data-feed-picker]") &&
    !event.target.closest("[data-feed-menu]")
  ) {
    closeFeedMenu(panel);
  }
  if (
    isCategoryMenuOpen(panel) &&
    !event.target.closest("[data-category-picker]") &&
    !event.target.closest("[data-category-menu]")
  ) {
    closeCategoryMenu(panel);
  }
  if (!isTagMenuClosed(panel) && !event.target.closest("[data-tag-picker]")) {
    closeTagMenuAndBlur(panel);
    syncTagControl(panel);
  }
}

function onDocumentKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }
  const panel = getPanel();
  closeFeedMenu(panel);
  closeCategoryMenu(panel);
  closeTagMenuAndBlur(panel);
  syncTagControl(panel);
}

async function onClearFilters(event) {
  const panel = event.currentTarget.closest(".ldsv-panel");
  state.parentCategoryId = "";
  state.categoryId = "";
  state.categorySlug = "";
  state.tagName = "";
  state.tagId = "";
  state.feedSubset = "";
  syncFeedControl(panel);
  closeFeedMenu(panel);
  closeCategoryMenu(panel);
  syncFilterControls(panel);
  saveStateDebounced();
  await loadTopics();
}
