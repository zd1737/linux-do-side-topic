"use strict";

function createPanel(root) {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "ldsv-panel";
  panel.setAttribute("aria-label", LDSV.messages.panelAriaLabel);
  panel.innerHTML = `
    <div class="ldsv-header" data-drag-handle>
      <div class="ldsv-drag-grip" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
      </div>
      <div class="ldsv-title">
        <div class="ldsv-feed-picker" data-feed-picker>
          <button class="ldsv-select ldsv-feed-trigger" type="button" data-feed-trigger aria-haspopup="menu" aria-expanded="false" aria-label="${LDSV.messages.controls.listType}"></button>
          <div class="ldsv-feed-menu" data-feed-menu role="menu" hidden></div>
        </div>
        <div class="ldsv-category-picker" data-category-picker>
          <button class="ldsv-filter-select ldsv-category-trigger" type="button" data-category-trigger aria-haspopup="menu" aria-expanded="false" aria-label="${LDSV.messages.controls.category}"></button>
          <div class="ldsv-category-menu" data-category-menu role="menu" hidden></div>
        </div>
        <div class="ldsv-tag-picker" data-tag-picker>
          <input class="ldsv-filter-select ldsv-tag-input" name="tag" type="text" data-tag-input role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="ldsv-tag-menu" autocomplete="off" placeholder="${LDSV.messages.controls.allTags}" aria-label="${LDSV.messages.controls.tag}">
          <div class="ldsv-tag-menu" id="ldsv-tag-menu" data-tag-menu role="listbox" hidden></div>
        </div>
        <button class="ldsv-icon-button ldsv-clear-filters" type="button" data-action="clear-filters" title="${LDSV.messages.controls.clearFilters}" aria-label="${LDSV.messages.controls.clearFilters}">清</button>
      </div>
      <div class="ldsv-actions">
        <a class="ldsv-icon-button ldsv-github-link" href="${GITHUB_REPOSITORY_URL}" target="_blank" rel="noopener noreferrer" data-action="open-github" title="${LDSV.messages.controls.githubRepository}" aria-label="${LDSV.messages.controls.githubRepository}">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.42c-2.24.49-2.71-.95-2.71-.95-.36-.92-.89-1.16-.89-1.16-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.79-.2-3.67-.9-3.67-3.98 0-.88.31-1.6.83-2.16-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.82A7.6 7.6 0 0 1 8 3.9c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.52.56.83 1.28.83 2.16 0 3.09-1.89 3.77-3.69 3.97.29.25.55.74.55 1.5v2.22c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z"></path></svg>
        </a>
        <button class="ldsv-icon-button" type="button" data-action="collapse" title="${LDSV.messages.controls.collapse}" aria-label="${LDSV.messages.controls.collapse}">−</button>
      </div>
    </div>
    <div class="ldsv-update-notice" data-update-notice role="status" hidden>
      <span class="ldsv-update-text" data-update-text></span>
      <div class="ldsv-update-actions">
        <button class="ldsv-update-button ldsv-update-link" type="button" data-action="open-release" title="${LDSV.messages.update.openRelease}" aria-label="${LDSV.messages.update.openRelease}">${LDSV.messages.update.openRelease}</button>
        <button class="ldsv-update-button ldsv-update-ignore" type="button" data-action="ignore-version" title="${LDSV.messages.update.ignoreVersion}" aria-label="${LDSV.messages.update.ignoreVersion}">${LDSV.messages.update.ignoreVersion}</button>
      </div>
    </div>
    <div class="ldsv-list" role="list"></div>
    <div class="ldsv-quick-actions" aria-label="${LDSV.messages.controls.quickActions}">
      <button class="ldsv-incoming-badge" type="button" data-action="show-incoming" hidden title="${LDSV.messages.controls.incoming}" aria-label="${LDSV.messages.controls.incoming}"></button>
      <button class="ldsv-quick-button" type="button" data-action="scroll-top" title="${LDSV.messages.controls.scrollTop}" aria-label="${LDSV.messages.controls.scrollTop}">↑</button>
      <button class="ldsv-quick-button" type="button" data-action="quick-refresh" title="${LDSV.messages.controls.refresh}" aria-label="${LDSV.messages.controls.refresh}">↻</button>
    </div>
    <div class="ldsv-resize-handle ldsv-resize-n" data-resize-edge="n" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-e" data-resize-edge="e" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-s" data-resize-edge="s" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-w" data-resize-edge="w" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-ne" data-resize-edge="ne" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-se" data-resize-edge="se" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-sw" data-resize-edge="sw" aria-hidden="true"></div>
    <div class="ldsv-resize-handle ldsv-resize-nw" data-resize-edge="nw" aria-hidden="true"></div>
  `;

  root.appendChild(panel);
  applyPanelState(panel);

  initializePanelControls(panel);
  bindPanelEvents(panel);
}

function getPanelControls(panel) {
  return {
    feedPicker: panel.querySelector("[data-feed-picker]"),
    feedTrigger: panel.querySelector("[data-feed-trigger]"),
    feedMenu: panel.querySelector("[data-feed-menu]"),
    categoryPicker: panel.querySelector("[data-category-picker]"),
    categoryTrigger: panel.querySelector("[data-category-trigger]"),
    categoryMenu: panel.querySelector("[data-category-menu]"),
    tagPicker: panel.querySelector("[data-tag-picker]"),
    tagInput: panel.querySelector("[data-tag-input]"),
    tagMenu: panel.querySelector("[data-tag-menu]"),
    dragHandle: panel.querySelector("[data-drag-handle]"),
    clearFiltersButton: panelActionButton(panel, "clear-filters"),
    scrollTopButton: panelActionButton(panel, "scroll-top"),
    showIncomingButton: panelActionButton(panel, "show-incoming"),
    quickRefreshButton: panelActionButton(panel, "quick-refresh"),
    updateNotice: panel.querySelector("[data-update-notice]"),
    updateText: panel.querySelector("[data-update-text]"),
    openReleaseButton: panelActionButton(panel, "open-release"),
    ignoreVersionButton: panelActionButton(panel, "ignore-version"),
    collapseButton: panelActionButton(panel, "collapse"),
    list: panel.querySelector(".ldsv-list"),
    resizeHandles: panel.querySelectorAll("[data-resize-edge]")
  };
}

function panelActionButton(panel, action) {
  return panel.querySelector(`[data-action='${action}']`);
}

function applyPanelState(panel) {
  const clamped = clampState(state);
  state = clamped;
  panel.style.left = `${clamped.left}px`;
  panel.style.top = `${clamped.top}px`;
  panel.style.transform = "";
  panel.style.width = `${clamped.collapsed ? COLLAPSED_SIZE : clamped.width}px`;
  panel.style.height = `${clamped.collapsed ? COLLAPSED_SIZE : clamped.height}px`;
  panel.classList.toggle("ldsv-collapsed", clamped.collapsed);

  const collapseButton = getPanelControls(panel).collapseButton;
  if (collapseButton) {
    const label = clamped.collapsed ? LDSV.messages.controls.expand : LDSV.messages.controls.collapse;
    collapseButton.textContent = clamped.collapsed ? LDSV.messages.controls.topicListShort : "−";
    collapseButton.title = label;
    collapseButton.setAttribute("aria-label", label);
  }
}

