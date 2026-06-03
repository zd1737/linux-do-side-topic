(function () {
  "use strict";

  if (!window.LDSV?.shared || !window.LDSV?.constants) {
    throw new Error("LDSV shared runtime is required before message-bus-bridge.js");
  }

  const {
    MESSAGE_BUS_STATUS_EVENT: STATUS_EVENT,
    READ_PROGRESS_EVENT,
    TOPIC_TRACKING_EVENT
  } = window.LDSV.constants;
  const {
    getValue,
    normalizeTrackingCurrentUser,
    normalizeTrackingSiteSettings
  } = window.LDSV.shared;
  const BRIDGE_KEY = "__linuxDoSideTopicMessageBusBridge";
  const MAX_ATTEMPTS = 80;
  const RETRY_DELAY = 250;
  const TOPIC_TRACKING_CHANNELS = [
    "/latest",
    "/new",
    "/unread",
    "/delete",
    "/recover",
    "/destroy"
  ];

  function dispatch(type, payload) {
    window.dispatchEvent(new CustomEvent(type, {
      detail: JSON.stringify(payload)
    }));
  }

  function getOwner() {
    return window.Discourse || null;
  }

  function lookup(owner, name) {
    if (owner?.lookup) {
      return owner.lookup(name);
    }
    return owner?.__container__?.lookup?.(name);
  }

  function cleanupExistingBridge() {
    try {
      window[BRIDGE_KEY]?.cleanup?.();
    } catch {
      // Ignore stale bridge cleanup failures.
    }
  }

  cleanupExistingBridge();

  let stopped = false;
  const cleanups = [];

  window[BRIDGE_KEY] = {
    cleanup() {
      stopped = true;
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        try {
          cleanup();
        } catch {
          // Keep tearing down the remaining subscriptions.
        }
      }
    }
  };

  function subscribe() {
    const owner = getOwner();
    const appEvents = owner && lookup(owner, "service:app-events");
    const messageBus = owner && lookup(owner, "service:message-bus");
    const currentUser = owner && lookup(owner, "service:current-user");
    const siteSettings = owner && lookup(owner, "service:site-settings");

    if (!appEvents?.on || !appEvents?.off || !messageBus?.subscribe || !messageBus?.unsubscribe) {
      return false;
    }

    const readProgressHandler = ({ post } = {}) => {
      const postNumber = Number(getValue(post, "post_number"));
      const topicId = Number(getValue(post, "topic_id") || getValue(post, "topic.id"));
      if (Number.isFinite(topicId) && Number.isFinite(postNumber)) {
        dispatch(READ_PROGRESS_EVENT, { topicId, postNumber });
      }
    };

    appEvents.on("topic:current-post-changed", readProgressHandler);
    cleanups.push(() => appEvents.off("topic:current-post-changed", readProgressHandler));

    const topicTrackingHandler = (data, globalId, messageId) => {
      dispatch(TOPIC_TRACKING_EVENT, { data, globalId, messageId });
    };

    const channels = TOPIC_TRACKING_CHANNELS.slice();
    const currentUserState = normalizeTrackingCurrentUser(currentUser);
    if (currentUserState.id != null) {
      channels.push(`/unread/${currentUserState.id}`);
    }

    channels.forEach((channel) => {
      messageBus.subscribe(channel, topicTrackingHandler);
      cleanups.push(() => messageBus.unsubscribe(channel, topicTrackingHandler));
    });

    dispatch(STATUS_EVENT, {
      status: "ready",
      channels,
      currentUser: currentUserState,
      siteSettings: normalizeTrackingSiteSettings(siteSettings)
    });
    return true;
  }

  let attempts = 0;
  const retryTimer = window.setInterval(() => {
    if (stopped) {
      window.clearInterval(retryTimer);
      return;
    }

    if (subscribe()) {
      window.clearInterval(retryTimer);
      return;
    }

    attempts += 1;
    if (attempts >= MAX_ATTEMPTS) {
      window.clearInterval(retryTimer);
      dispatch(STATUS_EVENT, { status: "unavailable" });
    }
  }, RETRY_DELAY);

  cleanups.push(() => window.clearInterval(retryTimer));
})();
