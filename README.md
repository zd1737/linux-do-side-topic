# Linux.do Side Topic
[![友链 linux.do](https://img.shields.io/badge/LINUX--DO-Community-blue.svg?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI%2BPGNsaXBQYXRoIGlkPSJhIj48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI0NyIvPjwvY2xpcFBhdGg%2BPGNpcmNsZSBmaWxsPSIjZjBmMGYwIiBjeD0iNjAiIGN5PSI2MCIgcj0iNTAiLz48cmVjdCBmaWxsPSIjMWMxYzFlIiBjbGlwLXBhdGg9InVybCgjYSkiIHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIzMCIvPjxyZWN0IGZpbGw9IiNmMGYwZjAiIGNsaXAtcGF0aD0idXJsKCNhKSIgeD0iMTAiIHk9IjQwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjQwIi8%2BPHJlY3QgZmlsbD0iI2ZmYjAwMyIgY2xpcC1wYXRoPSJ1cmwoI2EpIiB4PSIxMCIgeT0iODAiIHdpZHRoPSIxMDAiIGhlaWdodD0iMzAiLz48L3N2Zz4%3D&style=flat)](https://linux.do/)

一个用于 [linux.do](https://linux.do) 话题详情页的 Manifest V3 浏览器扩展。在 Discourse 话题页右侧显示可拖动、可调整大小的话题列表悬浮窗，点击列表项会跳转到对应话题。

## 功能

### 核心功能
- **话题列表悬浮窗**：在 `/t/...` 和 `/n/...` 话题详情页右侧显示侧边面板，面板内展示话题列表。
- **SPA 导航支持**：监听 Discourse 的 History API 导航（`pushState` / `replaceState` / `popstate`），在站内页面切换时自动同步面板可见性和话题列表。
- **后台脚本注入**：Service Worker（`background.js`）监听 `webNavigation.onHistoryStateUpdated`，在 SPA 跳转进入话题页时按需注入内容脚本和样式。

### 列表类型
- **最新**（`/latest.json`）—— 最新发布的话题
- **新话题**（`/new.json`）—— 支持子集筛选：话题 / 回复
- **未读**（`/unread.json`）—— 当前用户未读的话题
- **排行榜**（`/top.json`）—— 热门话题
- **我的帖子**（`/posted.json`）—— 当前用户发布的话题
- **书签**（`/bookmarks.json`）—— 当前用户收藏的话题

### 分类和标签筛选
- **分类筛选**：多级分类菜单，支持父子分类层级展开，点击分类过滤话题列表
- **标签筛选**：搜索式标签选择器，支持输入过滤、键盘上下导航、回车确认
- **清除筛选**：一键清除分类和标签筛选条件

### 拖拽和调整尺寸
- **拖拽移动**：拖拽标题栏任意位置移动面板（折叠状态下拖拽圆形浮标也可移动）
- **八向调整尺寸**：拖拽面板四边（N/E/S/W）和四角（NE/SE/SW/NW）调整宽高
- **边界限制**：面板始终限制在可视窗口内，最小 340×180px，最大 920×窗口高度

### 折叠/展开
- **折叠状态**：面板折叠为 48×48px 圆形浮标，显示"话"字，背景为主题色
- **展开状态**：恢复原始位置和尺寸，支持从折叠锚点位置恢复
- **智能展开**：折叠浮标被点击（未拖动）时展开；被拖动时保持折叠
- **位置记忆**：折叠/展开时自动保存展开位置，确保展开后回到原位

### 实时更新（MessageBus 集成）
- **Discourse MessageBus 桥接**：通过注入页面脚本（`message-bus-bridge.js`）连接 Discourse 的 MessageBus 和 AppEvents
- **阅读进度同步**：监听 `topic:current-post-changed` 事件，实时更新话题已读/未读状态
- **话题追踪**：订阅 `/latest`、`/new`、`/unread`、`/delete`、`/recover`、`/destroy` 频道，实时接收话题变更
- **新/更新话题提示**：检测到新话题或话题更新时，在悬浮按钮上显示通知数量，点击后拉取并添加到列表顶部

### 轮询
- **可见时轮询**：当前话题页可见时，每 60 秒轮询一次话题列表
- **隐藏时降频**：页面不可见时，轮询间隔延长至 180 秒
- **错误退避**：轮询连续失败时，间隔延长至 240 秒
- **自动重试**：轮询请求支持指数退避重试（最多 2 次，基础延迟 500ms）
- **MessageBus 优先**：当 MessageBus 桥接成功建立后，自动停止轮询，改用实时推送

### 静音/过滤
- **分类静音**：支持 Discourse 的分类静音设置（`mutedCategoryIds` / `indirectlyMutedCategoryIds`）
- **标签静音**：支持标签静音规则（`always` / `only_muted` 模式）
- **话题静音/取消静音**：实时追踪话题静音状态变化，自动过滤静音话题
- **默认全部静音**：支持 `muteAllCategoriesByDefault` 站点设置

### 虚拟滚动
- **虚拟列表渲染**：大量话题时仅渲染可视区域内的行 + 上下 over-scan 缓冲
- **自适应行高**：首次渲染后自动测量话题行实际高度，后续渲染使用精确步长
- **滚动时增量渲染**：通过 `requestAnimationFrame` 调度，仅重建可见窗口内的行
- **首尾占位符**：可视区域外使用 spacer 行占位，保持滚动条位置准确

### 话题行渲染
- **话题标题**：支持 Discourse 的 HTML 标题（`fancy_title`），经过安全清洗
- **状态标识**：书签 ⬛、已关闭 ✕、已归档 ◻、已置顶 ●
- **行样式**：已访问（半透明）、未读（蓝色圆点）、有新回复（蓝色数字角标）、已点赞、已收藏、已关闭
- **分类徽章**：显示话题分类颜色徽章，使用 Discourse 原版分类色彩
- **标签列表**：显示话题标签，内联逗号分隔
- **作者**：显示发帖人用户名（带 `@` 前缀）
- **回复数**：显示回复数（带图标），点击跳转到首帖
- **浏览数**：显示浏览次数（带图标）
- **活动时间**：相对时间显示（刚刚 / X 分 / X 小时 / X 天 / 月日），点击跳转到最新帖
- **大数字格式化**：超过 10,000 自动使用紧凑格式（如 1.2万）

### 持久化
- **状态保存**：面板位置、尺寸、折叠状态、列表类型、分类和标签筛选条件自动保存
- **存储优先级**：优先使用 `chrome.storage.local`（扩展存储），回退使用 `window.localStorage`
- **防抖保存**：状态变更后 150ms 防抖保存，避免频繁写入

### 版本检测
- **GitHub Releases 检测**：启动后检测 `zd1737/linux-do-side-topic` 最新 Release，发现新版本时在面板内提示
- **缓存降频**：版本检测结果缓存 12 小时，减少 GitHub API 请求
- **忽略版本**：可忽略当前提示的版本，忽略值随扩展状态持久化保存

### 交互细节
- **键盘导航**：ESC 关闭所有下拉菜单；标签输入框支持 ↑↓ 导航选项、Enter 确认
- **下拉菜单**：Feed 和分类菜单支持 hover 展开子菜单、focus 展开子菜单
- **新窗口打开**：Ctrl/Cmd/Shift + 点击或中键点击话题行，使用浏览器默认行为在新标签页打开
- **当前话题高亮**：当前正在浏览的话题行高亮显示（蓝色边框）
- **快捷按钮**：右下角浮动按钮 —— 回到顶部 ↑、刷新 ↻、新/更新话题通知
- **窗口 resize 处理**：浏览器窗口大小变化时自动调整面板位置，确保不超出可视区域

### 安全
- **HTML 清洗**：话题标题经过安全清洗，移除 `script/style/iframe/object/embed/base/link/meta` 标签
- **URL 协议检测**：检测并移除 `javascript:` / `data:` / `vbscript:` 等危险 URL 属性
- **扩展上下文失效处理**：捕获扩展重载/卸载导致的上下文失效错误，静默处理避免报错

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页（`chrome://extensions` 或 `edge://extensions`）。
2. 开启「开发者模式」。
3. 选择「加载已解压的扩展程序」。
4. 选择本目录。
5. 打开任意 `https://linux.do/t/...` 或 `https://linux.do/n/...` 话题页。

## 文件结构

```
├── manifest.json              # 扩展声明（权限、内容脚本、web 可访问资源）
├── background.js              # Service Worker（监听 SPA 导航，按需注入脚本和样式）
├── styles.css                 # 悬浮窗完整样式
│
├── content-shared.js          # 命名空间、常量、工具函数、状态 schema、cleanup 框架
├── content-bootstrap.js       # 初始化入口、运行时就绪检测、清理触发
│
├── content-panel-dom.js       # 面板 DOM 创建、控件查询、面板状态应用
├── content-panel-menus.js     # 通用菜单控制器、Feed/分类/标签菜单逻辑
├── content-panel-layout.js    # 拖拽、调整尺寸、折叠/展开、位置钳制
├── content-panel.js           # 事件绑定、菜单交互、筛选器编排
│
├── content-topics.js          # 话题列表加载、渲染编排、URL 构建
├── content-updates.js         # MessageBus 桥接、轮询、话题追踪、实时更新
├── content-list.js            # 话题行渲染、虚拟滚动、行事件处理
├── content-data.js            # API 数据解析、分类/标签元数据、书签转换
├── content-utils.js           # 格式化、网络请求、状态持久化、导航监听
├── content-version.js         # GitHub Releases 版本检测、更新提示、忽略版本
│
└── message-bus-bridge.js      # 页面脚本：Discourse MessageBus 桥接（注入到页面上下文）
```

## 技术栈

- **Manifest V3**：Chrome 扩展最新清单版本
- **Service Worker**：后台脚本，无持久化后台页面
- **Content Scripts**：直接注入到页面 DOM 的内容脚本
- **Web Accessible Resources**：注入到页面上下文的脚本（`message-bus-bridge.js`）
- **Discourse API**：通过站内 JSON 接口获取话题列表数据
- **Discourse MessageBus**：通过页面脚本连接 Discourse 的实时消息总线
- **GitHub Releases API**：检测扩展最新版本
- **Pointer Events**：统一的拖拽和调整尺寸交互（支持触控和鼠标）
- **Virtual Scrolling**：大量话题列表的虚拟渲染优化
- **CSS Custom Properties**：适配 Discourse 站点的 CSS 变量主题系统
