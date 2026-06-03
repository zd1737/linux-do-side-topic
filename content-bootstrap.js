"use strict";

LDSV.installGlobalAccessors();

LDSV.shouldInitialize = !globalThis[CONTENT_READY_FLAG];

if (!LDSV.shouldInitialize) {
  window.dispatchEvent(new CustomEvent(ACTIVATE_EVENT));
} else {
  globalThis[CONTENT_READY_FLAG] = true;
  LDSV.runCleanups();
  LDSV.resetStore();
}

function startLinuxDoSideTopicView() {
  if (!LDSV.shouldInitialize) {
    return;
  }

  trackingCurrentUser = createDefaultTrackingCurrentUser();
  trackingSiteSettings = createDefaultTrackingSiteSettings();
  window.addEventListener(ACTIVATE_EVENT, syncPanelVisibility);
  window.addEventListener("pagehide", LDSV.runCleanups);
  LDSV.registerCleanup(() => window.removeEventListener(ACTIVATE_EVENT, syncPanelVisibility));
  LDSV.registerCleanup(() => window.removeEventListener("pagehide", LDSV.runCleanups));
  LDSV.startAttempts = 0;
  init();
}

LDSV.startAttempts = 0;
function startWhenPanelRuntimeReady() {
  if (!LDSV.shouldInitialize) {
    return;
  }
  if (
    typeof init !== "function" ||
    typeof syncPanelVisibility !== "function" ||
    typeof setupVersionCheck !== "function"
  ) {
    LDSV.startAttempts += 1;
    if (LDSV.startAttempts <= 50) {
      window.setTimeout(startWhenPanelRuntimeReady, 10);
      return;
    }
    LDSV.reportError("start content script", new Error("Panel runtime did not finish loading"));
    return;
  }
  startLinuxDoSideTopicView();
}

window.setTimeout(startWhenPanelRuntimeReady, 0);
