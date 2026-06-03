"use strict";

function clampState(nextState) {
  const bounds = getPanelBounds();
  const width = clamp(Number(nextState.width) || DEFAULT_STATE.width, bounds.minWidth, bounds.maxWidth);
  const height = clamp(Number(nextState.height) || DEFAULT_STATE.height, bounds.minHeight, bounds.maxHeight);
  const fallbackLeft = Math.max(12, window.innerWidth - width - 24);
  const visibleWidth = nextState.collapsed ? COLLAPSED_SIZE : width;
  const visibleHeight = nextState.collapsed ? COLLAPSED_SIZE : height;
  const { left, top } = clampRect({
    left: nextState.left == null ? fallbackLeft : Number(nextState.left),
    top: nextState.top == null ? DEFAULT_STATE.top : Number(nextState.top),
    width: visibleWidth,
    height: visibleHeight
  }, { bounds, lockSize: true });
  const feed = FEEDS[nextState.feed] ? nextState.feed : DEFAULT_STATE.feed;
  const feedSubset = feed === "new" ? normalizeFeedSubset(nextState.feedSubset) : "";
  const parentCategoryId = normalizeFilterId(nextState.parentCategoryId);
  const categoryId = normalizeFilterId(nextState.categoryId);
  const tagId = normalizeFilterId(nextState.tagId);

  return {
    ...nextState,
    left,
    top,
    width,
    height,
    expandedLeft: normalizeCoordinate(nextState.expandedLeft),
    expandedTop: normalizeCoordinate(nextState.expandedTop),
    feed,
    feedSubset,
    parentCategoryId,
    categoryId,
    categorySlug: String(nextState.categorySlug || "").trim(),
    tagName: String(nextState.tagName || "").trim(),
    tagId,
    ignoredUpdateVersion: String(nextState.ignoredUpdateVersion || "").trim(),
    collapsed: Boolean(nextState.collapsed)
  };
}

function normalizeCoordinate(value) {
  if (value == null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeFilterId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
}

function getPanelBounds() {
  const minWidth = Math.min(340, Math.max(240, window.innerWidth - 24));
  const minHeight = 180;
  const maxWidth = Math.min(920, Math.max(minWidth, window.innerWidth - 24));
  const maxHeight = Math.max(220, window.innerHeight - 24);

  return { minWidth, minHeight, maxWidth, maxHeight };
}

function clampRect(rect, options = {}) {
  const bounds = options.bounds || getPanelBounds();
  const lockSize = Boolean(options.lockSize);
  const width = lockSize
    ? Math.max(0, Number(rect.width) || 0)
    : clamp(Number(rect.width) || bounds.minWidth, bounds.minWidth, bounds.maxWidth);
  const height = lockSize
    ? Math.max(0, Number(rect.height) || 0)
    : clamp(Number(rect.height) || bounds.minHeight, bounds.minHeight, bounds.maxHeight);
  return {
    left: clamp(Number(rect.left) || 0, 0, Math.max(0, window.innerWidth - width)),
    top: clamp(Number(rect.top) || 0, 0, Math.max(0, window.innerHeight - height)),
    width,
    height
  };
}

function onDragStart(event) {
  if (event.button !== 0 || (!state.collapsed && event.target.closest("button, input, select, a"))) {
    return;
  }

  const panel = getPanel();
  if (!panel) {
    return;
  }

  event.preventDefault();

  const rect = panel.getBoundingClientRect();
  panel.style.transform = "";
  dragging = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    width: rect.width,
    height: rect.height,
    nextLeft: rect.left,
    nextTop: rect.top,
    moved: false
  };
  panel.classList.add("ldsv-dragging");
  panel.setPointerCapture(event.pointerId);
  panel.addEventListener("pointermove", onDragMove);
  panel.addEventListener("pointerup", onDragEnd);
  panel.addEventListener("pointercancel", onDragEnd);
}

function onDragMove(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) {
    return;
  }

  if (Math.abs(event.clientX - dragging.startX) > 3 || Math.abs(event.clientY - dragging.startY) > 3) {
    dragging.moved = true;
  }
  if (collapsedButtonPointer && event.pointerId === collapsedButtonPointer.pointerId) {
    collapsedButtonPointer.moved = true;
  }

  dragging.nextLeft = clamp(
    dragging.startLeft + event.clientX - dragging.startX,
    0,
    Math.max(0, window.innerWidth - dragging.width)
  );
  dragging.nextTop = clamp(
    dragging.startTop + event.clientY - dragging.startY,
    0,
    Math.max(0, window.innerHeight - dragging.height)
  );
  scheduleDragRender();
}

function onDragEnd(event) {
  const panel = getPanel();
  if (panel && dragging && event.pointerId === dragging.pointerId) {
    const nextLeft = Math.round(dragging.nextLeft);
    const nextTop = Math.round(dragging.nextTop);
    cancelDragRender();
    panel.releasePointerCapture(event.pointerId);
    panel.removeEventListener("pointermove", onDragMove);
    panel.removeEventListener("pointerup", onDragEnd);
    panel.removeEventListener("pointercancel", onDragEnd);
    panel.classList.remove("ldsv-dragging");
    if (state.collapsed && !dragging.moved && collapsedButtonPointer?.pointerId === event.pointerId) {
      state.collapsed = false;
      restoreFromCollapsedAnchor();
      applyPanelState(panel);
      ignoreCollapseClickUntil = performance.now() + 250;
    } else {
      state.left = nextLeft;
      state.top = nextTop;
      panel.style.left = `${state.left}px`;
      panel.style.top = `${state.top}px`;
      if (state.collapsed && dragging.moved) {
        state.expandedLeft = null;
        state.expandedTop = null;
      }
    }
    if (!state.collapsed) {
      state.expandedLeft = state.left;
      state.expandedTop = state.top;
    }
    saveStateDebounced();
    dragging = null;
    return;
  }
  if (!panel) {
    cancelDragRender();
  }
  dragging = null;
}

function scheduleDragRender() {
  if (dragRenderFrame) {
    return;
  }

  dragRenderFrame = window.requestAnimationFrame(() => {
    dragRenderFrame = 0;
    applyDragPosition();
  });
}

function cancelDragRender() {
  if (!dragRenderFrame) {
    return;
  }

  window.cancelAnimationFrame(dragRenderFrame);
  dragRenderFrame = 0;
}

function applyDragPosition() {
  if (!dragging) {
    return;
  }

  const panel = getPanel();
  if (!panel) {
    return;
  }

  panel.style.left = `${Math.round(dragging.nextLeft)}px`;
  panel.style.top = `${Math.round(dragging.nextTop)}px`;
}

function onCollapseButtonPointerDown(event) {
  collapsedButtonPointer = {
    pointerId: event.pointerId,
    collapsedAtStart: state.collapsed,
    moved: false
  };

  if (state.collapsed) {
    onDragStart(event);
    event.stopPropagation();
  }
}

function onCollapseClick(event) {
  const panel = getPanel();
  if (!panel) {
    return;
  }

  if (performance.now() < ignoreCollapseClickUntil) {
    collapsedButtonPointer = null;
    return;
  }
  ignoreCollapseClickUntil = 0;

  if (collapsedButtonPointer?.collapsedAtStart && collapsedButtonPointer.moved) {
    event.preventDefault();
    collapsedButtonPointer = null;
    return;
  }

  if (state.collapsed) {
    state.collapsed = false;
    restoreFromCollapsedAnchor();
  } else {
    const panelRect = panel.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const collapsedRect = clampRect({
      left: buttonRect.left + buttonRect.width / 2 - COLLAPSED_SIZE / 2,
      top: buttonRect.top + buttonRect.height / 2 - COLLAPSED_SIZE / 2,
      width: COLLAPSED_SIZE,
      height: COLLAPSED_SIZE
    }, { lockSize: true });
    state.expandedLeft = Math.round(panelRect.left);
    state.expandedTop = Math.round(panelRect.top);
    state.left = Math.round(collapsedRect.left);
    state.top = Math.round(collapsedRect.top);
    state.collapsed = true;
  }
  applyPanelState(panel);
  saveStateDebounced();
  collapsedButtonPointer = null;
}

function restoreFromCollapsedAnchor() {
  const bounds = getPanelBounds();
  const width = clamp(Number(state.width) || DEFAULT_STATE.width, bounds.minWidth, bounds.maxWidth);
  const height = clamp(Number(state.height) || DEFAULT_STATE.height, bounds.minHeight, bounds.maxHeight);
  const savedRect = savedExpandedRect(width, height, bounds);

  if (savedRect) {
    state.width = width;
    state.height = height;
    state.left = Math.round(savedRect.left);
    state.top = Math.round(savedRect.top);
    state.expandedLeft = state.left;
    state.expandedTop = state.top;
    state = clampState(state);
    return;
  }

  const centerX = state.left + COLLAPSED_SIZE / 2;
  const centerY = state.top + COLLAPSED_SIZE / 2;
  const buttonCenterX = Math.min(Math.max(24, width - HEADER_COLLAPSE_BUTTON_RIGHT), width - 14);
  const buttonCenterY = Math.min(HEADER_BUTTON_CENTER_Y, Math.max(22, height - 22));
  const rect = clampRect({
    left: centerX - buttonCenterX,
    top: centerY - buttonCenterY,
    width,
    height
  }, { bounds });

  state.width = width;
  state.height = height;
  state.left = Math.round(rect.left);
  state.top = Math.round(rect.top);
  state.expandedLeft = state.left;
  state.expandedTop = state.top;
  state = clampState(state);
}

function savedExpandedRect(width, height, bounds) {
  const left = normalizeCoordinate(state.expandedLeft);
  const top = normalizeCoordinate(state.expandedTop);

  if (left == null || top == null) {
    return null;
  }

  return clampRect({ left, top, width, height }, { bounds });
}

function onResizeStart(event) {
  if (event.button !== 0 || state.collapsed) {
    return;
  }

  const panel = getPanel();
  if (!panel) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const rect = panel.getBoundingClientRect();
  resizing = {
    pointerId: event.pointerId,
    edge: event.currentTarget.dataset.resizeEdge,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    startWidth: rect.width,
    startHeight: rect.height
  };

  panel.classList.add("ldsv-resizing");
  panel.setPointerCapture(event.pointerId);
  panel.addEventListener("pointermove", onResizeMove);
  panel.addEventListener("pointerup", onResizeEnd);
  panel.addEventListener("pointercancel", onResizeEnd);
}

function onResizeMove(event) {
  if (!resizing || event.pointerId !== resizing.pointerId) {
    return;
  }

  const panel = getPanel();
  if (!panel) {
    return;
  }

  const nextRect = resizedRect(event);
  state.left = nextRect.left;
  state.top = nextRect.top;
  state.width = nextRect.width;
  state.height = nextRect.height;

  panel.style.left = `${Math.round(nextRect.left)}px`;
  panel.style.top = `${Math.round(nextRect.top)}px`;
  panel.style.width = `${Math.round(nextRect.width)}px`;
  panel.style.height = `${Math.round(nextRect.height)}px`;
}

function onResizeEnd(event) {
  const panel = getPanel();
  if (panel && resizing && event.pointerId === resizing.pointerId) {
    panel.releasePointerCapture(event.pointerId);
    panel.removeEventListener("pointermove", onResizeMove);
    panel.removeEventListener("pointerup", onResizeEnd);
    panel.removeEventListener("pointercancel", onResizeEnd);
    panel.classList.remove("ldsv-resizing");
    state.left = Math.round(state.left);
    state.top = Math.round(state.top);
    state.width = Math.round(state.width);
    state.height = Math.round(state.height);
    state.expandedLeft = state.left;
    state.expandedTop = state.top;
    virtualTopicStrideNeedsRefresh = true;
    renderTopics({ preserveScroll: true });
    saveStateDebounced();
  }
  resizing = null;
}

function resizedRect(event) {
  const edge = resizing.edge;
  const deltaX = event.clientX - resizing.startX;
  const deltaY = event.clientY - resizing.startY;
  const bounds = getPanelBounds();

  let left = resizing.startLeft;
  let top = resizing.startTop;
  let right = resizing.startLeft + resizing.startWidth;
  let bottom = resizing.startTop + resizing.startHeight;

  if (edge.includes("w")) {
    left = clamp(resizing.startLeft + deltaX, 0, right - bounds.minWidth);
  }
  if (edge.includes("e")) {
    right = clamp(resizing.startLeft + resizing.startWidth + deltaX, left + bounds.minWidth, window.innerWidth);
  }
  if (edge.includes("n")) {
    top = clamp(resizing.startTop + deltaY, 0, bottom - bounds.minHeight);
  }
  if (edge.includes("s")) {
    bottom = clamp(resizing.startTop + resizing.startHeight + deltaY, top + bounds.minHeight, window.innerHeight);
  }

  const size = clampRect({
    left,
    top,
    width: right - left,
    height: bottom - top
  }, { bounds });
  let width = size.width;
  let height = size.height;

  if (edge.includes("w")) {
    left = right - width;
  } else {
    right = left + width;
  }

  if (edge.includes("n")) {
    top = bottom - height;
  } else {
    bottom = top + height;
  }

  return clampRect({ left, top, width, height }, { bounds });
}
