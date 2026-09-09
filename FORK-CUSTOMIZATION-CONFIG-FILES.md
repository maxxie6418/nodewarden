# Fork 定制备忘：配置文件（Config Files）功能

> 用途：本仓库为上游 [shuaiplus/nodewarden](https://github.com/shuaiplus/nodewarden) 的 fork。
> 当从上游拉取更新（merge/rebase upstream main）时，本文件列出的改动点可能产生冲突，
> 请按此备忘逐项核对解决，避免丢失本 fork 的定制功能。

## 功能概述

新增"配置文件"管理页面（`/config-files`，入口位于侧栏"工具"分组）。
实现方式**不新增任何后端表/接口**，而是复用 Bitwarden 官方 cipher 加密管道：

- 配置文件以**官方 type 2（安全笔记 Secure Note）** 存储；
  （历史教训：早期版本用过自定义 `type = 9`，导致新版官方客户端 SDK 严格枚举
  （Rust serde：`invalid value: 9, expected one of: 1..8`）在同步时直接崩溃，故废弃。
  type 2 为官方类型，所有客户端均能正常同步与显示。）
- 识别方式：**固定名称文件夹"配置文件" + 名称前缀 `[配置文件] `** 双保险；
  前端 `/config-files` 页按"type 2 且（带前缀 或 位于配置文件文件夹）"过滤展示；
- 进入 `/config-files` 若"配置文件"文件夹不存在会自动创建；
- 新建/编辑时由 `ConfigFilesPage` 包装保存层强制 type=2、folderId=配置文件文件夹、
  名称自动加前缀（去重幂等）；主保险库中这些条目以普通安全笔记出现、可编辑；
- 附件仍走官方 attachments 加密链路，无需额外存储设计。

## 核心改动文件（冲突高风险）

| 文件 | 改动内容 | 上游冲突时的处理 |
|---|---|---|
| `webapp/src/components/vault/vault-page-helpers.tsx` | 常量 `CONFIG_FILE_CIPHER_TYPE = 2`、`CONFIG_FILE_FOLDER_NAME = '配置文件'`、`CONFIG_FILE_NAME_PREFIX = '[配置文件] '`；`isConfigFileFolder()` / `isConfigFileCipher()` / `withConfigFileNamePrefix()` / `stripConfigFileNamePrefix()`；导出 `TypeOption` | 若上游改动类型常量区/导出，逐行合并，保留本 fork 常量与函数 |
| `webapp/src/components/vault/VaultEditor.tsx` | 附件操作按钮化（上传文字按钮、`attachment-empty` 空态、替换按钮）；`createTypeOptions` prop 用于单类型下拉 | 上游若重排附件区 JSX，需把本 fork 的按钮改造重放上去 |
| `webapp/src/components/vault/VaultListPanel.tsx` | `createTypeOptions` prop；`singleCreateOption`（单类型点"+"直接新建，不弹菜单） | 上游若改"新建"菜单逻辑，保留单选项短路逻辑 |
| `webapp/src/components/vault/VaultSidebar.tsx` | `hideTypeSection` prop（单类型视图隐藏侧栏"类型"容器） | 上游若改侧栏结构，保留该可选 prop |
| `webapp/src/components/VaultPage.tsx` | 新增可选 props：`defaultCreateType` / `lockedSidebarFilter` / `createTypeOptions` / `hideTypeSection` / `defaultFolderId`；`changeFilter` 适配锁定筛选 | 主保险库不传这些 props，行为与上游一致，冲突一般可安全保留 |
| `webapp/src/components/ConfigFilesPage.tsx` | **新增文件**（页面本体：自动建文件夹 → 过滤 type2+标记 → 包装保存层强制 type/folder/前缀 → 渲染 VaultPage） | 上游不会创建此文件，无冲突 |
| `webapp/src/components/App.tsx` | 路由白名单 `APP_ROUTE_PATHS` 增加 `/config-files`；页面标题分支 | 上游新增路由时留意勿删 `/config-files` 白名单（否则 404） |
| `webapp/src/components/AppMainRoutes.tsx` | lazy 挂载 `/config-files` 路由 + 桌面/移动入口链接 | 上游路由结构调整时重放 |
| `webapp/src/components/AppAuthenticatedShell.tsx` | 侧栏"工具"下新增"配置文件"入口链接 | 同上游导航结构改动 |
| `webapp/src/lib/demo.ts` | demo 预置"配置文件"文件夹（folder-config）+ 一条 `[配置文件] nginx.conf`（type 2） | 上游若增删 demo 数据，注意保留该条目或按需更新 |
| `webapp/src/styles/vault.css` | `.attachment-empty` 空态样式；`.attachment-add-btn` nowrap | 低风险 |
| `webapp/src/lib/i18n/locales/*.ts`（10 个） | `nav_config_files`（页面名）+ `txt_no_attachments` / `txt_replace_attachment`（附件 UI 文案） | 若上游 i18n key 校验脚本报缺失，检查本 fork 新增的三个 key 是否仍在各 locale |
| `.gitignore` | 追加 `.wrangler-local/`（本地开发沙箱目录，非功能） | 可直接丢弃此行 |

## 冲突解决常规步骤

1. `git fetch upstream && git rebase upstream/main`（或 merge），出现冲突时逐个文件按上表核对；
2. 文件级别原则：**本 fork 全部改动都设计为可选/附加**（新增 prop、新增页面、附加过滤），
   与上游冲突时优先保留上游的新写法，再把本 fork 的增量合并回去；
3. 解完冲突后跑三件事：
   - `npx tsc -p webapp/tsconfig.json --noEmit`
   - `npm run i18n`（校验 10 个 locale key 齐全）
   - `npm run build`
4. 启动 demo（`npm run dev:demo`）访问 `/config-files` 冒烟验证：列表/新建/编辑/附件上传替换。

## 回归要点（合并后手动抽查）

- 主保险库 `/vault`：新建仍弹 8 类菜单、侧栏仍有"类型"容器；`[配置文件] xx` 条目以"安全笔记"
  出现且可编辑，不影响同步（type 2 为官方类型）；
- `/config-files`：侧栏"类型"容器隐藏；点"+ 新增"直达编辑器（类型"配置文件"、默认入"配置文件"
  文件夹、保存自动加前缀）；普通安全笔记不会混入本页；
- 首次进入若"配置文件"文件夹缺失会自动创建；
- 附件卡片：空态虚线引导 + "上传附件"按钮；已有附件行含"替换附件"按钮；
- 生产数据清理：历史遗留 `type = 9` 条目需手动删除（官方客户端无法读取），
  参考 SQL：`DELETE FROM ciphers WHERE type = 9;`（按实际库结构调整）。

## 历史记录

- 2026-09 初版曾使用自定义 `type = 9`；因官方客户端 Rust SDK 对 cipher type 严格枚举校验，
  同步即崩（`invalid value: 9, expected one of: 1..8`），已重构为 `type = 2 + 文件夹 + 前缀` 方案。
