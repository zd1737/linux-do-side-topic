"use strict";
const CONTENT_READY_FLAG = "__linuxDoSideTopicContentReady";
const ACTIVATE_EVENT = "ldsv:extension-activated";
const LATEST_RELEASE_MESSAGE = "ldsv:latest-release";
const VERSION_RELEASE_API_URL = "https://api.github.com/repos/zd1737/linux-do-side-topic/releases/latest";
const TOPIC_PATH_PATTERN = /^\/[tn](\/|$)/;
const CONTENT_SCRIPT_FILES = [
  "content-shared.js",
  "content-bootstrap.js",
  "content-panel-dom.js",
  "content-panel-menus.js",
  "content-panel-layout.js",
  "content-panel.js",
  "content-topics.js",
  "content-updates.js",
  "content-list.js",
  "content-data.js",
  "content-utils.js",
  "content-version.js"
];
function isTopicUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin === "https://linux.do" && TOPIC_PATH_PATTERN.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}
async function isContentReady(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [CONTENT_READY_FLAG],
    func: (readyFlag) => Boolean(globalThis[readyFlag])
  });

  return Boolean(results?.[0]?.result);
}

async function activateExistingContent(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [ACTIVATE_EVENT],
    func: (eventName) => {
      window.dispatchEvent(new CustomEvent(eventName));
    }
  });
}

async function injectTopicContent(tabId) {
  if (await isContentReady(tabId)) {
    await activateExistingContent(tabId);
    return;
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["styles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
}

function injectTopicContentForNavigation(details) {
  if (details.frameId !== 0 || !isTopicUrl(details.url)) {
    return;
  }

  injectTopicContent(details.tabId).catch((error) => {
    console.warn("[LDSV] inject topic content:", error);
  });
}

async function fetchLatestRelease() {
  const response = await fetch(VERSION_RELEASE_API_URL, {
    cache: "no-store",
    headers: { accept: "application/vnd.github+json" }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== LATEST_RELEASE_MESSAGE) {
    return false;
  }
  fetchLatestRelease().then(
    (data) => sendResponse({ ok: true, data }),
    (error) => sendResponse({ ok: false, error: error?.message || String(error) })
  );
  return true;
});

chrome.webNavigation.onHistoryStateUpdated.addListener(injectTopicContentForNavigation, {
  url: [{ schemes: ["https"], hostEquals: "linux.do" }]
});
