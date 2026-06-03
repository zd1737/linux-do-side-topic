"use strict";
function setupVersionCheck() {
  syncUpdateNotice();
  if (isCheckingVersion) {
    return;
  }
  const controller = new AbortController();
  versionCheckAbortController = controller;
  isCheckingVersion = true;
  LDSV.registerCleanup(() => {
    controller.abort();
    if (versionCheckAbortController === controller) {
      versionCheckAbortController = null;
    }
  });
  checkLatestVersion(controller.signal)
    .catch((error) => {
      if (error.name !== "AbortError") {
        LDSV.reportError("check latest version", error);
      }
    })
    .finally(() => {
      if (versionCheckAbortController === controller) {
        versionCheckAbortController = null;
      }
      isCheckingVersion = false;
    });
}

async function checkLatestVersion(signal) {
  const release = await loadLatestRelease(signal);
  const currentVersion = getExtensionVersion();
  if (!release || !isRemoteVersionNewer(release.version, currentVersion)) {
    updateNotice = null;
    syncUpdateNotice();
    return;
  }

  updateNotice = {
    version: release.version,
    normalizedVersion: normalizeReleaseVersion(release.version),
    url: release.url || VERSION_RELEASES_URL,
    currentVersion
  };
  syncUpdateNotice();
}

async function loadLatestRelease(signal) {
  const cache = await loadVersionCheckCache();
  if (isFreshVersionCheckCache(cache)) {
    return cache.release || null;
  }
  try {
    const data = await requestLatestRelease(signal);
    const release = summarizeRelease(data);
    await saveVersionCheckCache({
      checkedAt: Date.now(),
      release
    });
    return release;
  } catch (error) {
    if (signal?.aborted || !cache?.release) {
      throw error;
    }
    return cache.release;
  }
}

async function requestLatestRelease(signal) {
  throwIfVersionCheckAborted(signal);
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) {
    return null;
  }
  try {
    const response = await runtime.sendMessage({ type: LATEST_RELEASE_MESSAGE });
    throwIfVersionCheckAborted(signal);
    if (!response) {
      return null;
    }
    if (!response.ok) {
      throw new Error(response.error || "Version request failed");
    }
    return response.data || null;
  } catch (error) {
    if (LDSV.isExtensionContextInvalidated(error)) {
      return null;
    }
    throw error;
  }
}

function throwIfVersionCheckAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || new DOMException("Aborted", "AbortError");
  }
}

function summarizeRelease(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const version = String(data.tag_name || data.name || "").trim();
  if (!version) {
    return null;
  }

  return {
    version,
    url: String(data.html_url || VERSION_RELEASES_URL)
  };
}

function isFreshVersionCheckCache(cache) {
  const checkedAt = Number(cache?.checkedAt) || 0;
  return checkedAt > 0 && Date.now() - checkedAt < VERSION_CHECK_INTERVAL;
}

async function loadVersionCheckCache() {
  const storage = LDSV.getExtensionStorageLocal();
  try {
    if (storage) {
      const result = await storage.get(VERSION_CACHE_STORAGE_KEY);
      return result[VERSION_CACHE_STORAGE_KEY] || {};
    }
    return JSON.parse(window.localStorage.getItem(VERSION_CACHE_STORAGE_KEY) || "{}");
  } catch (error) {
    LDSV.reportError("load version check cache", error);
    return {};
  }
}

async function saveVersionCheckCache(cache) {
  const storage = LDSV.getExtensionStorageLocal();
  if (storage) {
    try {
      await storage.set({ [VERSION_CACHE_STORAGE_KEY]: cache });
    } catch (error) {
      LDSV.reportError("save version check cache", error);
    }
    return;
  }
  try {
    window.localStorage.setItem(VERSION_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    LDSV.reportError("save version check cache", error);
  }
}

function getExtensionVersion() {
  try {
    return chrome.runtime.getManifest().version || "";
  } catch (error) {
    LDSV.reportError("read extension version", error);
    return "";
  }
}

function isRemoteVersionNewer(remoteVersion, currentVersion) {
  const comparison = compareSemanticVersions(remoteVersion, currentVersion);
  if (comparison != null) {
    return comparison > 0;
  }
  const remote = normalizeReleaseVersion(remoteVersion);
  const current = normalizeReleaseVersion(currentVersion);
  return Boolean(remote && remote !== current);
}

function compareSemanticVersions(leftVersion, rightVersion) {
  const left = parseSemanticVersion(leftVersion);
  const right = parseSemanticVersion(rightVersion);
  if (!left || !right) {
    return null;
  }

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] || 0;
    const rightPart = right[index] || 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }
  return 0;
}

function parseSemanticVersion(value) {
  const match = normalizeReleaseVersion(value).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? match.slice(1).filter((part) => part != null).map((part) => Number(part)) : null;
}

function normalizeReleaseVersion(value) {
  return String(value || "").trim().replace(/^v(?=\d)/i, "").trim();
}

function syncUpdateNotice() {
  const panel = getPanel();
  if (!panel) {
    return;
  }
  const controls = getPanelControls(panel);
  const notice = controls.updateNotice;
  if (!notice) {
    return;
  }

  const visibleNotice = visibleUpdateNotice();
  notice.hidden = !visibleNotice;
  if (!visibleNotice) {
    return;
  }

  const title = LDSV.messages.update.currentAndLatest(visibleNotice.currentVersion, visibleNotice.version);
  controls.updateText.textContent = LDSV.messages.update.available(visibleNotice.version);
  controls.openReleaseButton.title = title;
  controls.openReleaseButton.setAttribute("aria-label", title);
  controls.ignoreVersionButton.title = LDSV.messages.update.ignoreVersion;
  controls.ignoreVersionButton.setAttribute("aria-label", LDSV.messages.update.ignoreVersion);
}

function visibleUpdateNotice() {
  if (!updateNotice) {
    return null;
  }

  const ignoredVersion = normalizeReleaseVersion(state.ignoredUpdateVersion);
  const noticeVersion = updateNotice.normalizedVersion || normalizeReleaseVersion(updateNotice.version);
  return ignoredVersion && ignoredVersion === noticeVersion ? null : updateNotice;
}

function onOpenUpdateReleaseClick(event) {
  event.preventDefault();
  event.stopPropagation();
  window.open(updateNotice?.url || VERSION_RELEASES_URL, "_blank", "noopener,noreferrer");
}

function onIgnoreUpdateVersionClick(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!updateNotice) {
    return;
  }

  state.ignoredUpdateVersion = updateNotice.normalizedVersion || normalizeReleaseVersion(updateNotice.version);
  saveStateDebounced();
  syncUpdateNotice();
}
