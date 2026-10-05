# 开发与验证

## 开始工作

使用 [.nvmrc](../.nvmrc) 指定的 Node 版本。依赖以 `package-lock.json` 为准，执行 `npm ci`。开发命令在 [package.json](../package.json)：

| 命令 | 会做什么 |
| --- | --- |
| `npm run dev` | 先离线检查肖像素材，再生成定理 HTML、health 文件并启动 Vite |
| `npm run lint` | 检查前端、Worker 与脚本的 JS/JSX/MJS，以及前端导入边界 |
| `npm test` | 运行 `src/`、`worker/src/`、`scripts/` 下的测试；其中 Worker 运行时检查会启动本地 workerd |
| `npm run build` | 运行同样的生成步骤，再生成 `dist/` |
| `npm run worker:check` | 离线打包 Worker 到 `worker/.wrangler/check`，不发布 |
| `npm run browser:check` | 临时构建，检查公开页面、模拟账号页面、平板导航及下载失败恢复；所有外部请求被拦截 |
| `npm run preview` | 本地查看已有构建 |

`.env.example` 列出登录所需的公开配置。`VITE_AI_ENDPOINT` 可覆盖聊天地址；未设置时仍会调用 `https://rucmathclass.com/api/chat`。首页也会访问 Open-Meteo。需要离线或隔离验证时，应明确使用本地模拟服务，不要以为 Vite 自动模拟了这些接口。

## 内容与生成文件

| 内容 | 应修改的输入 | 如何生成 |
| --- | --- | --- |
| 首页定理和引语 | [siteContent.js](../src/data/siteContent.js) | 定理执行 `npm run theorems:render`；引语直接读取 |
| 法语词库 | [vocab-source.json](../scripts/vocab-source.json) | 先检查导入报告，再明确指定输出 |
| 静态书目 | [resourceCatalog.js](../src/data/resourceCatalog.js) | 页面直接读取；外链经过 URL 校验 |
| 封面肖像 | [统一清单](../src/data/portraits.json) 与已入库的 `public/portraits/` | `npm run portraits:check` 离线检查缺图、JPEG 文件标记和多余文件；显式执行 `npm run portraits:fetch` 才会联网补图 |

词库命令需要传入文件，单独运行 `npm run vocab:import` 不会自动导入默认词库：

```bash
npm run vocab:import -- scripts/vocab-source.json
npm run vocab:import -- scripts/vocab-source.json --out src/data/frenchVocabulary.js
```

第一条只输出报告。第二条写词条数据。有拒绝项或重复 ID 时，命令报错且不改文件。写入当前词库时，还会检查旧 ID 是否缺失，以及已有法语词是否换了 ID。这个命令不导入用户的背词进度。不要直接编辑生成的 `frenchVocabulary.js` 和 `dailyTheoremNotes.generated.js`。

构建生成的 `public/health.json` 记录 `status/app/version/buildTime/mode`，其中 `status: "ok"` 是固定标记，不执行数据库或 AI 探测。本地验证后，若它的变化只是新时间戳，在提交前执行 `git restore public/health.json`。不要一并还原其他手写文件。

启动失败恢复脚本仍编辑 `public/boot-start.js`。生产构建由 `vite.config.js` 按文件内容生成 `assets/boot-start-<hash>.js` 并替换 HTML 引用，避免 CDN 把旧脚本与新页面混用。它保持普通脚本形式，即使模块入口下载失败，也能显示重新加载按钮。

## 这些检查能保护什么

单测覆盖排程、题型、快照、提交确认、背词与对话控制器、首页转场与天气、资源分页、认证状态和Worker 聊天、语音、请求取消、输入限制和入口分派。背词控制器测试会走完提交、重试、刷新恢复和错词重练，也检查重复输入与旧账号迟到响应。接口测试使用模拟客户端，不证明生产 RLS、外部模型或邮件服务正常。

`worker/src/runtime.test.js` 用 Miniflare 启动 workerd，直接执行 Worker 源码，核对失效令牌、有效身份进入输入校验，以及认证重定向不转发令牌。兼容日期取自 `worker/wrangler.toml`；所有外部请求使用假接口，禁止访问真实网络。引擎冷启动在准备阶段单独等待，不占用请求断言的时限。它能发现 Node 与 Workers 的 API 差异，但不能证明真实模型或账号可用。

`scripts/lib/databaseGrants.test.js` 用 PGlite 的隔离 PostgreSQL 17 内存实例检查权限 SQL，也随 `npm test` 在 CI 运行。它验证正常个人读写、跨账号拒绝、公开书架、原资源管理员操作、重复应用时保留记录和行策略，以及 RLS 关闭时停止修改。测试账号与记录都是本地构造，不接收生产连接串或密钥；PGlite 仅是开发依赖，不进入网页。这是 SQL 行为检查，不是生产权限已经修好的证明。

`npm run browser:check` 使用 Chromium 验证 390×844 与 1280×800 的首页翻页、登录展开、书架翻到末页、资源失败后恢复、表单入口、旧资源推荐地址回书架、404 出口，以及模拟登录后的背词预习、答疑历史、清空和退出。另查 800×1024 的页内导航、“减少动态效果”模式，以及路由慢下载、模块失败、入口脚本失败后的重载。首次使用前执行 `npx playwright install chromium`。它使用占位接口配置，账号和历史由 `scripts/browser-account-fixture.mjs` 模拟，拦截全部外部 HTTP 和 WebSocket；临时构建不覆盖 `dist/`，完成后恢复原 health 文件。截图和失败轨迹放在 `output/playwright/`，CI 失败时上传。这些检查不代表真实认证服务已通过验收。

这些检查还没有覆盖真实移动设备、Safari 或登录后的完整流程。涉及相关状态或布局的修改，仍需在真实页面验证：账号切换、请求失败后的重试、背词最后一题与刷新恢复、资源云端失败后的静态目录、AI 保存失败提示。改首页还要确认登录前后页数变化和翻页动画、窄屏肖像加载和横向溢出。改路由加载时，用本地生产构建验证慢下载、模块失败和整个入口脚本失败后的重载。不要用注入 DOM 拼出的截图代替验证。

CI 的实际触发范围见 [.github/workflows/ci.yml](../.github/workflows/ci.yml)：推送到 `mathclass/main`，或以它为目标的 PR。以开发分支为目标的堆叠 PR 不会触发这份流程；转向主分支后要等 CI 再核对。

## 数据库文件

SQL 按用途放在 `sql/`，没有脚本会自动执行它们。这些文件是供核对的定义与历史记录，不是一套安装顺序，也不证明生产已应用。

- [schema/setup_vocabulary.sql](../sql/schema/setup_vocabulary.sql)、[schema/setup_ai_history.sql](../sql/schema/setup_ai_history.sql) 对应现役个人进度和对话表。
- [schema/restrict_app_table_grants.sql](../sql/schema/restrict_app_table_grants.sql) 已于 2026-09-27 获用户授权后在生产执行，并核对实际权限与匿名接口。它在一个事务内收紧四张表的浏览器角色授权，不改记录或行策略；表缺失或 RLS 未开启时终止。以后再次执行前仍要重新核对现场，并取得当次生产变更授权，不能把前端部署理解成自动执行此 SQL。
- [legacy/setup_official_content.sql](../sql/legacy/setup_official_content.sql) 混合了现役 resources 和退役相册，不能当作完整的当前 schema。
- `sql/legacy/` 其余文件保留旧存储桶、角色和综合授权 SQL；不要整段重跑来修权限。
- [audit/comments_permissions.sql](../sql/audit/comments_permissions.sql) 只有三条 SELECT，查看执行时的列授权、表授权和行策略，不保存过去的生产结论。
- [audit/app_permissions.sql](../sql/audit/app_permissions.sql) 只读现役表和资料表的所有者、行策略、表授权、额外列授权、客户端角色及新建表的默认授权。它不读个人记录；查询结果描述执行当时的状态。

## 发布前的本地检查

`npm run deploy:check` 或 `bash deploy.sh` 只做本地检查，可在工作分支运行，不需要服务器配置。工作区必须没有未提交的改动。首次依次运行 lint、测试、构建、Worker 离线打包和浏览器检查。

源码、依赖文件和构建配置未变时，直接使用上次检查通过的文件。只改普通说明文档也可沿用；修改 `CLAUDE.md` 会重新检查。记录和发布文件保存在本机 `.cache/mathclass-release/`，不复用另一台机器的检查结果。检查脚本会恢复构建生成的 health 时间戳。

发布前设置 `MATHCLASS_DEPLOY_HOST`、`MATHCLASS_DEPLOY_USER` 和 `MATHCLASS_DEPLOY_SSH_KEY`。密钥必须使用绝对路径。获得明确上线授权后，运行 `bash deploy.sh --publish`。发布仅允许 `mathclass/main`，且本地提交必须与远端一致；上传前会再次核对。

上传后核对用户平时访问的首页、版本文件、脚本和样式。记录保存在 `.cache/mathclass-release/records/`，失败也会记录停止位置。文件核对通过不能代替真实账号和 AI 验证。上传失败可能只更新了部分文件，脚本不会自动回滚，也不会把失败记为成功。

发布目录固定为 `/var/www/MathClassWebsite/dist`。此命令不发布 Worker，不改服务器配置，不操作同机的青协网站和代理服务。构建中的 `health.json` 会另加源码摘要，用来核对检查结果和发布文件是否对应；它仍不检查数据库或 AI。

[deployment/nginx/](../deployment/nginx/) 是仓库里的服务器配置，不能据此宣称已在生产生效。Worker 独立构建和部署，见它的 [接口说明](../worker/README.md)。

## 最近一次发布核验

2026-09-27 获用户授权后发布了班级站；Raccord 未发布。这是当次现场记录，以后发布仍需重新核对。

| 项目 | 已核验结果 |
| --- | --- |
| 前端源码 | `85567d605aba1b546613cab5f69e9779bcb5da49`，已合并 PR #54 |
| 公网 health | `2026-09-27T06:58:56.817Z`，北京时间 14:58；应用标记为 `MathClassWebsite` |
| Worker | `mathclass-ai`，版本 `63bb4a7c-9379-422d-9b8f-13ab2e1d60db`，承接 100% 流量；源码来自 `d6f9bd7`，PR #54 未改服务实现 |
| 身份服务 | Worker 与前端使用班级站项目 `xfwkjhajrqxsakzovcwx`；模型 secret 保留 |
| 服务器文件 | `/var/www/MathClassWebsite/dist`；源站 HTML 与本地发布产物一致 |
| 静态文件 | 公网主 JS、CSS、带内容哈希的启动脚本均为 200，内容与发布产物一致 |
| 网页与接口 | 首页、书架、背词、答疑、登录地址为 200；未登录及失效令牌为 401，错误方法 405，未知语音路径 404，预检 204 并允许 Authorization |
| 页面查看 | 桌面和手机首页、书架已查看，天气与答疑未登录提示正常；补发后检查手机翻页、返回封面及恢复桌面尺寸，画布重新启动且未再报错 |

班级站的 CSP snippet 已更新，允许 Open-Meteo，移除 Solana devnet。Nginx 配置检查通过后 reload；主站配置文件未替换。旧静态文件及原 Nginx 配置保存在服务器 `/var/backups/mathclass-release-20260927T062732Z/`。本次部署没有执行数据库 SQL 或改个人记录。

发布检查包括 lint、251 项测试、生产构建、Worker 离线打包和 15 个 Chromium 场景，CI 通过。公网核验发现并修复了启动脚本旧缓存、Workers 不支持 `redirect: 'error'`、雨天首帧出现负半径三个问题；手机和桌面的首页检查现已覆盖雨天。真实账号的登录、模型回答及历史保存仍未验收，见 [剩余问题](remaining-work.md)。后续仅更新说明或测试的提交不代表再次部署。
