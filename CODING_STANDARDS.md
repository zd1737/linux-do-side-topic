# 代码规范 — Linux.do Side Topic View

本规范适用于本项目所有 JavaScript 和 CSS 代码。新代码必须遵循本规范，修改旧代码时遇风格问题应一并修正。

---

## 一、JavaScript 语言规范

### 1.1 严格模式

每个 `.js` 文件第一行必须是：

```javascript
"use strict";
```

### 1.2 变量声明

- **永远不用 `var`**。使用 `const` 声明常量，`let` 声明可变变量。
- 常量优先——除非确实需要重新赋值，否则一律用 `const`。

```javascript
// ✅ 正确
const FEED_OPTIONS = Object.freeze([...]);
let scrollTop = 0;

// ❌ 错误
var FEED_OPTIONS = [...];
var scrollTop = 0;
```

### 1.3 相等比较

- 检查 `null` 或 `undefined` 时使用 `== null` / `!= null`（同时匹配两者）。
- 其他情况使用严格相等 `===` / `!==`。

```javascript
// ✅ 正确
if (value == null) { return; }
if (state.collapsed && event.target.closest("button, input, select, a")) { return; }

// ❌ 错误
if (value === null || value === undefined) { return; }
if (state.collapsed == true) { return; }
```

### 1.4 不可变数据

对外暴露的常量对象必须使用 `Object.freeze` 冻结：

```javascript
// ✅ 正确
const FEEDS = Object.freeze({
  latest: Object.freeze({ label: "最新", path: "/latest.json" }),
  new: Object.freeze({ label: "新话题", path: "/new.json" })
});

const TOPIC_ROW_CLASSES = Object.freeze([
  Object.freeze({ className: "visited", enabled: (topic) => Boolean(topic.visited) })
]);
```

嵌套对象也必须冻结（深层 `Object.freeze`）。

### 1.5 全局变量

- 本项目不使用 ES 模块。跨文件共享的状态和函数通过 `LDSV` 命名空间暴露。
- 常量和可变状态通过 `content-shared.js` 的 `installGlobalAccessors()` 挂载到 `globalThis`，使用 `Object.defineProperty` 的 getter/setter 代理到 `LDSV.store`。
- **禁止在文件顶层使用裸变量声明**（包括 `const`/`let`）来跨文件共享状态——必须通过 `LDSV.store` 或 `LDSV` 命名空间。

```javascript
// ✅ 正确 —— 在 content-shared.js 的 mutableStateKeys 中注册
const mutableStateKeys = Object.freeze([
  "state",
  "topics",
  "isLoadingTopics",
  // ...
]);

// ❌ 错误 —— 裸的跨文件变量
let someSharedState = 0;
```

### 1.6 函数声明

- 使用 `function` 声明而非函数表达式，以利用提升（hoisting）特性。
- 箭头函数仅用于短小的回调（如 `.map()`、`.filter()`、`.forEach()`）。
- 事件处理器使用命名函数，便于 `removeEventListener`。

```javascript
// ✅ 正确
function onQuickRefreshClick(event) {
  event.preventDefault();
  loadTopics();
}
controls.quickRefreshButton.addEventListener("click", onQuickRefreshClick);

// ❌ 错误 —— 匿名箭头函数无法移除
controls.quickRefreshButton.addEventListener("click", () => loadTopics());
```

---

## 二、模块和文件组织

### 2.1 文件职责

| 文件 | 职责 |
|------|------|
| `content-shared.js` | 命名空间、常量、工具函数、状态 schema、cleanup 框架 |
| `content-bootstrap.js` | 初始化入口、运行时就绪检测 |
| `content-panel-dom.js` | 面板 DOM 创建、控件查询、面板状态应用 |
| `content-panel-menus.js` | 菜单控制器、Feed/分类/标签菜单组件 |
| `content-panel-layout.js` | 拖拽、调整尺寸、折叠/展开、位置钳制 |
| `content-panel.js` | 事件绑定、面板交互编排 |
| `content-topics.js` | 话题列表加载、渲染编排、URL 构建 |
| `content-updates.js` | MessageBus 桥接、轮询、消息追踪 |
| `content-list.js` | 话题行渲染、虚拟滚动、行事件处理 |
| `content-data.js` | API 数据解析、分类/标签元数据 |
| `content-utils.js` | 格式化、网络请求、状态持久化、导航监听 |
| `content-version.js` | GitHub Releases 版本检测、更新提示、忽略版本 |
| `message-bus-bridge.js` | 页面脚本：Discourse MessageBus 桥接 |
| `background.js` | Service Worker 入口 |

**规则**：
- 所有代码文件统一行数上限为 1000 行；单个文件超过 1000 行时，必须拆分为多个文件。
- 新增功能优先考虑放入现有文件的职责范围内，否则创建新文件。
- 新文件必须在 `manifest.json` 的 `content_scripts.js` 数组和 `background.js` 的 `CONTENT_SCRIPT_FILES` 数组中**同时注册**。

### 2.2 加载顺序

`manifest.json` 中 `content_scripts.js` 数组的加载顺序即依赖顺序：

```
content-shared.js       ← 命名空间和工具函数（无依赖）
content-bootstrap.js    ← 初始化入口（依赖 shared）
content-panel-dom.js    ← DOM 创建（依赖 shared）
content-panel-menus.js  ← 菜单系统（依赖 shared, panel-dom）
content-panel-layout.js ← 布局逻辑（依赖 shared, panel-dom）
content-panel.js        ← 事件编排（依赖所有 panel-*）
content-topics.js       ← 话题加载（依赖 shared, panel-menus）
content-updates.js      ← 实时更新（依赖 shared, topics）
content-list.js         ← 列表渲染（依赖 shared, data, utils）
content-data.js         ← 数据解析（依赖 shared, utils）
content-utils.js        ← 工具函数（依赖 shared）
content-version.js      ← 版本检测（依赖 shared, utils, panel-dom）
```

- `background.js` 中的 `CONTENT_SCRIPT_FILES` 数组必须与此列表**完全相同**。

---

## 三、命名空间和状态管理

### 3.1 常量

所有跨文件使用的常量定义在 `content-shared.js` 的 `constants` 对象中：

```javascript
const constants = Object.freeze({
  PANEL_ID: "linux-do-side-topic-view",
  STORAGE_KEY: "linuxDoSideTopicViewState",
  // ...
});
```

新增常量步骤：
1. 在 `constants` 对象中添加键值对
2. 在 `installGlobalAccessors()` 的 `constantKeys` 数组中添加键名
3. 使用时直接通过全局变量名访问（如 `PANEL_ID`、`STORAGE_KEY`）

### 3.2 可变状态

所有跨文件共享的可变状态定义在 `content-shared.js` 的 `createInitialStore()` 中：

```javascript
function createInitialStore() {
  return {
    state: createDefaultState(),
    topics: [],
    isLoadingTopics: false,
    // ...
  };
}
```

新增状态步骤：
1. 在 `createInitialStore()` 返回对象中添加字段和初始值
2. 在 `mutableStateKeys` 数组中添加键名
3. 使用时直接通过全局变量名读写（如 `topics = []`、`isLoadingTopics = true`）

### 3.3 命名空间

扩展自己的 API 挂载到 `LDSV` 命名空间：

```javascript
// 共享工具
LDSV.shared.getValue(object, key);
LDSV.shared.firstValue(object, keys);

// 资源管理
LDSV.registerCleanup(callback);
LDSV.runCleanups();

// 错误处理
LDSV.errorMessage(error);
LDSV.reportError(context, error);
LDSV.isExtensionContextInvalidated(error);

// 扩展存储
LDSV.getExtensionStorageLocal();
LDSV.getExtensionResourceUrl(path);
```

---

## 四、资源管理和清理

### 4.1 Cleanup 框架

任何创建了需要后续清理的资源（事件监听器、定时器、Observer 等）的函数，**必须**通过 `LDSV.registerCleanup()` 注册清理回调：

```javascript
// ✅ 正确 —— 注册 cleanup
document.addEventListener("pointerdown", onDocumentPointerDown);
LDSV.registerCleanup(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});

navigationFallbackTimer = window.setInterval(check, INTERVAL);
LDSV.registerCleanup(() => {
  window.clearInterval(navigationFallbackTimer);
  navigationFallbackTimer = null;
});
```

### 4.2 需要清理的资源

| 资源类型 | 清理方式 |
|----------|----------|
| `addEventListener` | `removeEventListener` |
| `setTimeout` | `clearTimeout`（仅在回调尚未执行时需要） |
| `setInterval` | `clearInterval` |
| `MutationObserver` | `.disconnect()` |
| `requestAnimationFrame` | `cancelAnimationFrame` |
| `AbortController` | `.abort()` |
| 对全局 API 的 patch（如 `history.pushState`） | 恢复原始实现 |

### 4.3 Cleanup 触发时机

- **页面卸载**：`pagehide` 事件 → `LDSV.runCleanups()`
- **扩展重新注入**：`content-bootstrap.js` 检测到已初始化 → `LDSV.runCleanups()` → `LDSV.resetStore()`

---

## 五、网络请求

### 5.1 使用 `fetchJson`

所有 API 请求统一使用 `content-utils.js` 中的 `fetchJson` 函数：

```javascript
const data = await fetchJson(url, {
  cache: "no-store",     // 可选：禁用缓存
  signal: abortSignal,   // 可选：AbortController.signal
  retries: 2,            // 可选：重试次数（默认 0）
  retryDelay: 500        // 可选：基础重试延迟 ms（默认 250）
});
```

- `fetchJson` 自动携带 `credentials: "same-origin"` 和 `Accept: application/json`
- 非 2xx 响应抛出 `Error("HTTP {status}")`
- 重试使用指数退避：延迟 = `retryDelay * 2^attempt`
- 如果传入 `signal` 且被 abort，立即停止重试并抛出 `AbortError`

### 5.2 错误处理

所有网络请求的错误必须妥善处理，区分以下情况：

```javascript
try {
  const data = await fetchJson(url, { signal: controller.signal });
  // 处理数据
} catch (error) {
  if (error.name === "AbortError") {
    // 请求被取消（组件卸载、轮询切换等），静默忽略
    return;
  }
  // 真实的网络/服务器错误，记录并更新 UI 状态
  loadError = LDSV.messages.loading.loadFailed(LDSV.errorMessage(error));
}
```

---

## 六、事件处理

### 6.1 事件处理器命名

使用 `on` + 名词 + 事件类型 的命名方式：

```javascript
function onDragStart(event) { ... }
function onDragMove(event) { ... }
function onDragEnd(event) { ... }
function onFeedTriggerClick(event) { ... }
function onTagInputKeyDown(event) { ... }
function onDocumentPointerDown(event) { ... }
```

### 6.2 事件处理器参数

- 第一个参数始终命名为 `event`（不用 `e`、`evt` 等缩写）。
- 获取当前元素用 `event.currentTarget`，获取实际触发元素用 `event.target`。

### 6.3 DOM 事件绑定

- 全部使用 `addEventListener`，不使用 HTML `on*` 属性或 DOM 元素的 `on*` 属性。

### 6.4 防止默认行为和冒泡

```javascript
event.preventDefault();     // 阻止浏览器默认行为
event.stopPropagation();    // 阻止事件冒泡
```

仅在确实需要时调用，并添加注释说明原因。

---

## 七、CSS 规范

### 7.1 命名约定

- 所有类名使用 `ldsv-` 前缀（Linux Do Side View）。
- 使用 BEM 风格：`ldsv-block__element--modifier`。

```css
.ldsv-panel                  /* 块 */
.ldsv-panel.ldsv-collapsed   /* 块的状态变体 */
.ldsv-header                 /* 块 */
.ldsv-feed-menu-item         /* 块-元素 */
.ldsv-feed-menu-item.is-active  /* 元素的状态变体 */
.ldsv-topic-status.--pinned  /* 元素的状态变体 */
```

### 7.2 选择器

- 使用 `ldsv-panel` 作为所有选择器的根，限定样式作用域，避免影响宿主页面：

```css
.ldsv-panel .ldsv-topic-list .ldsv-topic-row { ... }
```

- **禁止重复定义同一个选择器**。每个选择器在文件中只能出现一次。新增样式时先检查该选择器是否已存在。

### 7.3 CSS 变量

- 优先使用 Discourse 站点的 CSS 变量，并始终提供 fallback 值：

```css
color: var(--primary, #111827);
background: var(--secondary, #ffffff);
border: 1px solid var(--primary-low, rgba(17, 24, 39, 0.1));
```

### 7.4 性能

- 动画和过渡仅使用 `transform` 和 `opacity`（GPU 加速）。
- 避免在滚动事件中修改样式——使用 `will-change` 提示浏览器。
- 使用 `container-type: inline-size` 实现容器查询。

---

## 八、代码质量

### 8.1 DRY — 消除重复

- 三个或以上相似的代码块必须抽象为函数或配置对象。
- 本项目已有 `createMenuController` 和 `parseSlashIdValue` 作为通用抽象的范例，参考其模式。

### 8.2 命名

- **函数**：动词开头，描述操作（`loadTopics`、`syncFeedControl`、`applyPanelState`）。
- **布尔值**：`is/has/should` 前缀（`isLoadingTopics`、`hasIncomingNoticeState`、`shouldPollTopics`）。
- **Map/Set 集合**：复数名词（`categories`、`tags`、`topicTrackingStates`）。
- **事件处理函数**：`on` + 名词 + 事件（`onDragStart`）。
- **常量**：`UPPER_SNAKE_CASE`（`PANEL_ID`、`TOPIC_POLL_VISIBLE_INTERVAL`）。

### 8.3 注释

- 不需要为显而易见的操作添加注释。
- 复杂算法（如虚拟滚动窗口计算、坐标钳制）需要注释说明意图。
- 非常规代码（如绕过浏览器 bug 的 workaround）需要注释说明原因。

### 8.4 空值检查

- 函数入口处尽早检查参数有效性并返回：

```javascript
function syncFeedControl(panel) {
  if (!panel) {
    return;
  }
  // 正常逻辑
}
```

---

## 九、提交前检查清单

- [ ] 无 `var` 关键字
- [ ] 所有常量使用 `Object.freeze`
- [ ] 所有事件监听器注册了对应的 `LDSV.registerCleanup`
- [ ] 所有 `setTimeout`/`setInterval`/`requestAnimationFrame` 在 cleanup 中清除
- [ ] 修改 `content-shared.js` 时，同步更新 `background.js` 和 `manifest.json`
- [ ] 新增文件在 `manifest.json` 的 `content_scripts.js` 和 `background.js` 的 `CONTENT_SCRIPT_FILES` 中都已注册
- [ ] CSS 选择器无重复定义
- [ ] CSS 作用域限定在 `.ldsv-panel` 下
- [ ] 无匿名箭头函数作为事件处理器（除非不需要移除）
- [ ] 网络请求使用 `fetchJson`，错误处理区分 `AbortError`
- [ ] 所有 CSS 变量有 fallback 值
