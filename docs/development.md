# 开发与验证

本地演示和页面对比见 [README](../README.md)。命令以 [package.json](../package.json) 为准。使用 `.nvmrc` 指定的 Node 版本，再执行 `npm ci`。`npm run demo` 使用假数据；`npm run dev` 会读取本地配置，也可能请求真实服务。

## 内容与生成文件

| 内容 | 应修改的输入 | 生成方式 |
| --- | --- | --- |
| 首页定理和引语 | [siteContent.js](../src/data/siteContent.js) | 定理运行 `npm run theorems:render`；引语直接读取 |
| 法语词库 | [vocab-source.json](../scripts/vocab-source.json) | `npm run vocab:import -- 文件路径` 先看报告；加 `--out` 才写文件 |
| 书目 | [resourceCatalog.js](../src/data/resourceCatalog.js) | 页面直接读取 |
| 封面肖像 | [portraits.json](../src/data/portraits.json)、`public/portraits/` | 平时离线检查；明确执行 `npm run portraits:fetch` 才联网补图 |

词条 ID 用来对应已有学习进度，不能因整理词库而重排。导入有错误时停止写入。不要手改生成的 `frenchVocabulary.js` 和 `dailyTheoremNotes.generated.js`。

`public/health.json` 的 `ok` 只表示文件成功生成，不检查数据库或 AI。普通构建若只改变了它的时间戳，提交前执行 `git restore public/health.json`。不要一并还原手写文件。

## 检查的用途和限制

提交前的检查命令在 [CLAUDE.md](../CLAUDE.md)。本地检查使用假账号、假接口和独立的测试数据库，不能证明真实邮件、账号或 AI 正常。Worker 测试使用 Cloudflare 的运行引擎，避免只在 Node 中通过、上线后却报错。

浏览器检查和截图必须来自实际页面。修改共享样式后，还要查看受影响页面。首次截图前运行 `npx playwright install chromium`。截图和失败轨迹放在 `output/playwright/`。Safari、真实手机和跨设备流程的未验事项见 [剩余问题](remaining-work.md)。

CI（GitHub 上的自动检查）的触发条件见 [ci.yml](../.github/workflows/ci.yml)。以开发分支为目标的 PR 不会触发当前流程；改为合入主分支后，要重新核对检查结果。

## 数据库文件

`sql/schema/` 保存当前表定义，`sql/audit/` 用于只读核查，`sql/legacy/` 保存旧文件。这些 SQL 不是一套可顺序执行的安装脚本。

2026-09-27 已获授权执行 [表权限修正](../sql/schema/restrict_app_table_grants.sql)，并用 [只读查询](../sql/audit/app_permissions.sql) 核对结果。以后再次修改生产数据库，仍需重新核对并取得明确授权。前端发布不会自动执行 SQL。

## 发布前的本地检查

`npm run deploy:check` 或 `bash deploy.sh` 只做本地检查，可在工作分支运行，不需要服务器配置。工作区必须没有未提交的改动。首次依次运行 lint、测试、构建、Worker 离线打包和浏览器检查。

只有脚本确认代码、依赖和环境未变，且发布文件未被改动，才沿用上次结果。只改普通说明文档也可沿用；修改 `CLAUDE.md` 会重新检查。记录和发布文件保存在本机 `.cache/mathclass-release/`，不复用另一台机器的检查结果。检查脚本会恢复构建生成的 health 时间戳。

发布前设置 `MATHCLASS_DEPLOY_HOST`、`MATHCLASS_DEPLOY_USER` 和 `MATHCLASS_DEPLOY_SSH_KEY`。密钥必须使用绝对路径。获得明确上线授权后，运行 `bash deploy.sh --publish`。发布仅允许 `mathclass/main`，且本地提交必须与远端一致；上传前会再次核对。

上传后核对用户平时访问的首页、版本文件、脚本和样式。记录保存在 `.cache/mathclass-release/records/`，失败也会记录停止位置。文件核对通过不能代替真实账号和 AI 验证。上传失败可能只更新了部分文件，脚本不会自动回滚，也不会把失败记为成功。

发布目录固定为 `/var/www/MathClassWebsite/dist`。此命令不发布 Worker，不改服务器配置，不操作同机的青协网站和代理服务。构建中的 `health.json` 会另加一串根据源码计算的校验值，用来确认发布文件对应哪份源码；它仍不检查数据库或 AI。

[deployment/nginx/](../deployment/nginx/) 是仓库里的服务器配置，不能据此宣称已在生产生效。Worker 独立构建和部署，见它的 [接口说明](../worker/README.md)。

## 最近一次发布核验

以下是 2026-09-27 的现场记录，不代表工作分支已经上线。此次发布获用户明确授权；没有读取、复制或修改个人记录。

| 项目 | 当次结果 |
| --- | --- |
| 前端源码 | `85567d605aba1b546613cab5f69e9779bcb5da49`，PR #54 |
| 公网 health | `2026-09-27T06:58:56.817Z`，应用标记 `MathClassWebsite` |
| Worker | `mathclass-ai`，版本 `63bb4a7c-9379-422d-9b8f-13ab2e1d60db`，100% 流量；源码 `d6f9bd7` |
| 身份服务 | 前端与 Worker 均使用班级站项目 `xfwkjhajrqxsakzovcwx` |
| 文件与备份 | 发布目录 `/var/www/MathClassWebsite/dist`；旧文件和 Nginx 配置在 `/var/backups/mathclass-release-20260927T062732Z/` |
| 已核对 | 源站 HTML、公网主 JS/CSS 和启动脚本与产物一致；桌面、手机首页及书架可用 |
| 接口 | 未登录和失效令牌为 401，错误方法 405，未知语音路径 404，预检 204 |

当次调整了班级站的网页资源访问限制（CSP），允许天气请求，移除 Solana devnet。Nginx 检查通过后重新加载，主站配置文件未替换。Raccord 未发布。真实账号、模型回答和历史保存仍未验证，见 [剩余问题](remaining-work.md)。
