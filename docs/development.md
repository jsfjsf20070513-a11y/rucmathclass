# 开发与验证

## 开始工作

使用 [.nvmrc](../.nvmrc) 指定的 Node 版本。依赖以 `package-lock.json` 为准，执行 `npm ci`。开发命令在 [package.json](../package.json)：

| 命令 | 会做什么 |
| --- | --- |
| `npm run dev` | 先离线检查肖像素材，再生成定理 HTML、health 文件并启动 Vite |
| `npm run lint` | 检查前端、Worker 与脚本的 JS/JSX/MJS，以及前端导入边界 |
| `npm test` | 在 Node 环境运行 `src/`、`worker/src/`、`scripts/` 下的 `*.test.js` |
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

第一条只输出报告。第二条写词条数据；检查拒绝项、重复项和 ID 后再执行。这个命令不导入用户的背词进度。不要直接编辑生成的 `frenchVocabulary.js` 和 `dailyTheoremNotes.generated.js`。

构建生成的 `public/health.json` 记录 `status/app/version/buildTime/mode`，其中 `status: "ok"` 是固定标记，不执行数据库或 AI 探测。本地验证后，若它的变化只是新时间戳，在提交前执行 `git restore public/health.json`。不要一并还原其他手写文件。

## 这些检查能保护什么

单测覆盖排程、题型、快照、提交确认、背词与对话控制器、首页转场与天气、资源分页、认证状态和Worker 聊天、语音、请求取消、输入限制和入口分派。背词控制器测试会走完提交、重试、刷新恢复和错词重练，也检查重复输入与旧账号迟到响应。接口测试使用模拟客户端，不证明生产 RLS、外部模型或邮件服务正常。

`npm run browser:check` 使用 Chromium 验证 390×844 与 1280×800 的首页翻页、登录展开、书架翻到末页、资源失败后恢复、表单入口、旧资源推荐地址回书架、404 出口，以及模拟登录后的背词预习、答疑历史、清空和退出。另查 800×1024 的页内导航、“减少动态效果”模式，以及路由慢下载、模块失败、入口脚本失败后的重载。首次使用前执行 `npx playwright install chromium`。它使用占位接口配置，账号和历史由 `scripts/browser-account-fixture.mjs` 模拟，拦截全部外部 HTTP 和 WebSocket；临时构建不覆盖 `dist/`，完成后恢复原 health 文件。截图和失败轨迹放在 `output/playwright/`，CI 失败时上传。这些检查不代表真实认证服务已通过验收。

这些检查还没有覆盖真实移动设备、Safari 或登录后的完整流程。涉及相关状态或布局的修改，仍需在真实页面验证：账号切换、请求失败后的重试、背词最后一题与刷新恢复、资源云端失败后的静态目录、AI 保存失败提示。改首页还要确认登录前后页数变化和翻页动画、窄屏肖像加载和横向溢出。改路由加载时，用本地生产构建验证慢下载、模块失败和整个入口脚本失败后的重载。不要用注入 DOM 拼出的截图代替验证。

CI 的实际触发范围见 [.github/workflows/ci.yml](../.github/workflows/ci.yml)：推送到 `mathclass/main`，或以它为目标的 PR。以开发分支为目标的堆叠 PR 不会触发这份流程；转向主分支后要等 CI 再核对。

## 数据库文件

SQL 按用途放在 `sql/`，没有脚本会自动执行它们。这些文件是供核对的定义与历史记录，不是一套安装顺序，也不证明生产已应用。

- [schema/setup_vocabulary.sql](../sql/schema/setup_vocabulary.sql)、[schema/setup_ai_history.sql](../sql/schema/setup_ai_history.sql) 对应现役个人进度和对话表。
- [legacy/setup_official_content.sql](../sql/legacy/setup_official_content.sql) 混合了现役 resources 和退役相册，不能当作完整的当前 schema。
- `sql/legacy/` 其余文件保留旧存储桶、角色和综合授权 SQL；不要整段重跑来修权限。
- [audit/comments_permissions.sql](../sql/audit/comments_permissions.sql) 只有三条 SELECT，查看执行时的列授权、表授权和行策略，不保存过去的生产结论。

## 发布前的本地检查

`npm run deploy:check` 或 `bash deploy.sh` 默认只检查本地，不执行 SSH 或 rsync。入口从脚本路径确定仓库根，要求 origin 是班级站仓库、分支是 `mathclass/main`、工作区干净；目标固定为 `/var/www/MathClassWebsite/dist`，拒绝用环境变量改到其他目录。

需要提供 `MATHCLASS_DEPLOY_HOST`、`MATHCLASS_DEPLOY_USER` 和密钥的绝对路径 `MATHCLASS_DEPLOY_SSH_KEY`。检查依次运行 lint、测试、新构建，只还原生成的 `public/health.json`，再次检查工作区与提交未变，并核对新构建标记。它不会读取密钥内容、连接服务器或确认远端版本。

只有用户明确授权部署后，才可按部署流程执行 `bash deploy.sh --publish`。这会重复相同检查，然后远端建目录并执行 `rsync --delete`；原先不带参数就发布的行为已经取消。发布前后的线上 health 与页面仍需另行核对，本地检查成功不是上线授权。

[deployment/nginx/](../deployment/nginx/) 是仓库里的服务器配置，不能据此宣称已在生产生效。Worker 独立构建和部署，见它的 [接口说明](../worker/README.md)。
