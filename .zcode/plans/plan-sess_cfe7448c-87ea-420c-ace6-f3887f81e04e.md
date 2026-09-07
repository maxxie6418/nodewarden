1. 新增一个正式的 `HomePage` 组件，复用 `decryptedCiphers`、`decryptedFolders` 和现有 `Cipher` 类型，不建立第二套数据源。
   - 中间区域展示从登录条目 URI 派生的书签；支持列表/卡片切换、全部/收藏筛选。
   - 右侧展示安全笔记（`cipher.type === 2`），提供搜索和最近笔记列表。
   - 书签和笔记点击后通过回调导航到对应的 `/bookmarks` 或 `/notes` 页面，后续可继续接入现有 Vault 编辑详情。
2. 新增 `NotesPage` 和 `BookmarksPage` 两个轻量页面，使用同一批 `decryptedCiphers` 数据，分别展示完整笔记和书签集合；不增加数据库字段、不改 Worker API。
3. 在 `AppMainRoutes.tsx` 中增加懒加载页面和三条路由（`/`、`/notes`、`/bookmarks`）。扩展路由 props，仅传递页面实际需要的 ciphers、folders、loading、error、刷新和通知能力。
4. 在 `App.tsx` 中：
   - 把 `/notes`、`/bookmarks` 加入认证应用路由白名单；
   - 将登录后的根路径默认重定向从 `/vault` 改为 `/`，首页作为默认入口；
   - 为首页、笔记、书签补充移动端主路由和页面标题分支。
5. 在 `AppAuthenticatedShell.tsx` 中把导航顺序调整为：首页、笔记、书签，然后是现有密码库、Send、工具/设置；复用 `lucide-preact` 图标和现有导航 class，移动端保留现有底部导航，避免扩大移动端改动范围。
6. 增加一个专用样式文件（或在现有 `styles.css` 增加隔离 class），使用项目现有 token：桌面端左侧导航 + 中间书签 + 右侧笔记，内容区不使用不必要的卡片嵌套；书签卡片模式使用现有边框、圆角、轻阴影；响应式下改为上下布局。
7. 增加至少英文和简体中文文案，运行 `npm run i18n:validate`、`npm run build`；如果环境仍缺少依赖，明确报告并执行可用的静态检查。