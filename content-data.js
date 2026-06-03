"use strict";

function parseTopicListResponse(data) {
  if (data?.user_bookmark_list) {
    return parseBookmarkListResponse(data);
  }

  const topicList = data?.topic_list || {};
  const topicItems = Array.isArray(topicList.topics) ? topicList.topics : [];
  const usersById = createUsersById(data);
  return {
    ...data,
    topics: topicItems.map((topic) => withTopicAuthor(topic, usersById)),
    moreTopicsUrl: topicList.more_topics_url || null,
    topic_list: topicList
  };
}

function parseBookmarkListResponse(data) {
  const bookmarkList = data.user_bookmark_list || {};
  const bookmarkTopics = Array.isArray(bookmarkList.bookmarks)
    ? bookmarkList.bookmarks.map(bookmarkToTopic).filter(Boolean)
    : [];

  return {
    ...data,
    topics: bookmarkTopics,
    moreTopicsUrl: bookmarkList.more_bookmarks_url || null,
    topic_list: {
      topics: bookmarkTopics,
      categories: bookmarkList.categories || [],
      tags: bookmarkList.tags || []
    }
  };
}

function bookmarkToTopic(bookmark) {
  const topicId = normalizeNullableNumber(bookmark?.topic_id);
  if (topicId == null) {
    return null;
  }

  return {
    id: topicId,
    title: bookmark.title,
    fancy_title: bookmark.fancy_title || escapeHTML(bookmark.title || LDSV.messages.topic.untitled),
    slug: bookmark.slug || slugFromTopicUrl(bookmark.bookmarkable_url),
    posts_count: bookmark.posts_count || bookmark.highest_post_number || 1,
    highest_post_number: bookmark.highest_post_number || bookmark.post_number || bookmark.linked_post_number || 1,
    last_read_post_number: bookmark.last_read_post_number ?? 0,
    category_id: bookmark.category_id,
    tags: bookmark.tags || [],
    bumped_at: bookmark.bumped_at || bookmark.updated_at || bookmark.created_at,
    last_posted_at: bookmark.bumped_at || bookmark.updated_at,
    created_at: bookmark.created_at,
    views: bookmark.views || 0,
    last_poster_username: bookmark.last_poster_username || bookmark.username || bookmark.user?.username || "",
    ldsv_author_username: bookmark.username || bookmark.user?.username || bookmark.post_user_username || "",
    unread_posts: bookmark.unread_posts || 0,
    new_posts: bookmark.new_posts || 0,
    unseen: Boolean(bookmark.unseen),
    bookmarked: true,
    closed: Boolean(bookmark.closed),
    archived: Boolean(bookmark.archived),
    pinned: Boolean(bookmark.pinned),
    linked_post_number: bookmark.linked_post_number
  };
}

function createUsersById(data) {
  const usersById = new Map();
  if (Array.isArray(data?.users)) {
    data.users.forEach((user) => {
      if (user?.id != null) {
        usersById.set(Number(user.id), user);
        usersById.set(String(user.id), user);
      }
    });
  }
  return usersById;
}

function withTopicAuthor(topic, usersById) {
  return {
    ...topic,
    ldsv_author_username: findTopicAuthorUsername(topic, usersById)
  };
}

function findTopicAuthorUsername(topic, usersById) {
  const posters = Array.isArray(topic?.posters) ? topic.posters : [];
  const firstPoster = posters[0];
  const firstPosterUser = firstPoster?.user ||
    usersById.get(Number(firstPoster?.user_id)) ||
    usersById.get(String(firstPoster?.user_id));
  const firstPosterUsername = firstPoster?.username || firstPosterUser?.username;

  if (firstPosterUsername) {
    return firstPosterUsername;
  }

  const directUsername =
    topic?.creator?.username ||
    topic?.user?.username ||
    topic?.created_by?.username ||
    topic?.posted_by?.username ||
    topic?.user_username ||
    topic?.username;

  if (directUsername) {
    return directUsername;
  }

  return topic?.last_poster_username || "";
}

function getTopicAuthorUsername(topic) {
  return topic?.ldsv_author_username || topic?.last_poster_username || "";
}

function slugFromTopicUrl(url) {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const match = pathname.match(/\/[tn]\/([^/]+)\/\d+/);
    return match ? decodeURIComponent(match[1]) : "topic";
  } catch {
    return "topic";
  }
}

function parseCategories(data) {
  const next = new Map();
  const categoryList = [
    ...toArray(data.topic_list?.categories),
    ...toArray(data.category_list?.categories),
    ...toArray(data.categories)
  ];
  if (Array.isArray(categoryList)) {
    flattenCategories(categoryList).forEach((category) => {
      if (category?.id != null) {
        const numericId = Number(category.id);
        next.set(category.id, category);
        next.set(String(category.id), category);
        if (Number.isFinite(numericId)) {
          next.set(numericId, category);
        }
      }
    });
  }
  return next;
}

function flattenCategories(categoryList) {
  const flattened = [];
  const appendCategory = (category) => {
    if (!category) {
      return;
    }
    flattened.push(category);
    toArray(category.subcategories || category.subcategory_list || category.children).forEach(appendCategory);
  };
  toArray(categoryList).forEach(appendCategory);
  return flattened;
}

function parseTags(data) {
  const next = new Map();
  const tagList = [
    ...(Array.isArray(data.topic_list?.tags) ? data.topic_list.tags : []),
    ...(Array.isArray(data.tags) ? data.tags : [])
  ];

  if (data.extras?.tag_groups) {
    data.extras.tag_groups.forEach((group) => {
      if (Array.isArray(group.tags)) {
        tagList.push(...group.tags);
      }
    });
  }
  if (data.extras?.categories) {
    data.extras.categories.forEach((category) => {
      if (Array.isArray(category.tags)) {
        tagList.push(...category.tags);
      }
    });
  }

  tagList.forEach((tag) => {
    const normalized = normalizeTagObject(tag);
    if (!normalized) {
      return;
    }
    next.set(normalized.id ?? normalized.name, normalized);
    if (normalized.id != null) {
      next.set(String(normalized.id), normalized);
    }
    if (normalized.name) {
      next.set(normalized.name, normalized);
    }
  });

  return next;
}

function normalizeTagObject(tag) {
  if (tag == null) {
    return null;
  }
  if (typeof tag === "string") {
    return { id: null, name: tag, slug: tag };
  }
  const name = tag.name || tag.text || tag.slug;
  const id = normalizeNullableNumber(tag.id);
  if (id == null && !name) {
    return null;
  }
  return {
    ...tag,
    id,
    name: name || String(id),
    slug: tag.slug || name || String(id)
  };
}

async function loadCategoryMetadata() {
  if (categoryMetadata) {
    return categoryMetadata;
  }

  if (!categoryMetadataLoad) {
    categoryMetadataLoad = fetchCategoryMetadata()
      .then((metadata) => {
        categoryMetadata = metadata;
        return metadata;
      })
      .catch((error) => {
        LDSV.reportError("load category metadata", error);
        categoryMetadata = new Map();
        return categoryMetadata;
      })
      .finally(() => {
        categoryMetadataLoad = null;
      });
  }

  return categoryMetadataLoad;
}

async function fetchCategoryMetadata() {
  const siteCategories = await fetchCategoriesFrom("/site.json");
  if (siteCategories.size > 0) {
    return siteCategories;
  }
  return fetchCategoriesFrom("/categories.json");
}

async function fetchCategoriesFrom(path) {
  try {
    return parseCategories(await fetchJson(path));
  } catch (error) {
    LDSV.reportError(`fetch categories from ${path}`, error);
    return new Map();
  }
}

async function loadTagMetadata() {
  if (tagMetadata) {
    return tagMetadata;
  }

  if (!tagMetadataLoad) {
    tagMetadataLoad = fetchTagMetadata()
      .then((metadata) => {
        tagMetadata = metadata;
        return metadata;
      })
      .catch((error) => {
        LDSV.reportError("load tag metadata", error);
        tagMetadata = new Map();
        return tagMetadata;
      })
      .finally(() => {
        tagMetadataLoad = null;
      });
  }

  return tagMetadataLoad;
}

async function fetchTagMetadata() {
  const fromTagsIndex = await fetchTagsFrom("/tags.json");
  if (fromTagsIndex.size > 0) {
    return fromTagsIndex;
  }
  return fetchTagsFrom("/tags/filter/search.json?limit=100&q=");
}

async function fetchTagsFrom(path) {
  try {
    const data = await fetchJson(path);
    if (Array.isArray(data.results)) {
      return parseTags({ tags: data.results });
    }
    return parseTags(data);
  } catch (error) {
    LDSV.reportError(`fetch tags from ${path}`, error);
    return new Map();
  }
}

function mergeMaps(current, next) {
  const merged = new Map(current);
  next.forEach((value, key) => {
    merged.set(key, mergeMapValue(merged.get(key), value));
  });
  return merged;
}

function mergeMapValue(current, next) {
  if (!current || !next || typeof current !== "object" || typeof next !== "object") {
    return next;
  }
  return { ...current, ...next };
}

function appendUniqueTopics(currentTopics, nextTopics) {
  const seen = new Set(currentTopics.map((topic) => topic.id));
  const merged = currentTopics.slice();
  nextTopics.forEach((topic) => {
    if (!seen.has(topic.id)) {
      seen.add(topic.id);
      merged.push(topic);
    }
  });
  return merged;
}

function getCategoryName(categoryId) {
  if (categoryId == null) {
    return LDSV.messages.topic.uncategorized;
  }
  const category = getCategoryById(categoryId);
  return categoryDisplayName(category, categoryId);
}

function isCategoryDescendantOf(categoryId, parentCategoryId) {
  const targetParentId = normalizeNullableNumber(parentCategoryId);
  let current = getCategoryById(categoryId);
  const seen = new Set();

  while (current && targetParentId != null) {
    const currentId = normalizeNullableNumber(current.id);
    if (currentId == null || seen.has(currentId)) {
      return false;
    }
    seen.add(currentId);

    const parentId = categoryParentId(current);
    if (parentId == null) {
      return false;
    }
    if (parentId === targetParentId) {
      return true;
    }
    current = getCategoryById(parentId);
  }

  return false;
}

function categoryHasDescendants(categoryId) {
  const targetCategoryId = normalizeNullableNumber(categoryId);
  if (targetCategoryId == null) {
    return false;
  }

  for (const category of categories.values()) {
    const childCategoryId = normalizeNullableNumber(category?.id);
    if (childCategoryId != null && childCategoryId !== targetCategoryId && isCategoryDescendantOf(childCategoryId, targetCategoryId)) {
      return true;
    }
  }

  return false;
}

function hasUnknownCategories(topicList) {
  return topicList.some((topic) => topic.category_id != null && !getCategoryById(topic.category_id));
}

function getCategoryById(categoryId) {
  const numericId = Number(categoryId);
  return (
    categories.get(categoryId) ||
    categories.get(String(categoryId)) ||
    (Number.isFinite(numericId) ? categories.get(numericId) : null) ||
    null
  );
}

function getTagById(tagId) {
  const numericId = Number(tagId);
  return (
    tags.get(tagId) ||
    tags.get(String(tagId)) ||
    (Number.isFinite(numericId) ? tags.get(numericId) : null) ||
    null
  );
}

function getReplyCount(topic) {
  return Math.max((Number(topic.posts_count) || 0) - 1, 0);
}

