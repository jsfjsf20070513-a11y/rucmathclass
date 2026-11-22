# 开发与验证

本地演示和页面对比见 [README](../README.md)。命令以 [package.json](../package.json) 为准。使用 `.nvmrc` 指定的 Node 版本。`npm run demo` 使用假数据。`npm run dev` 会读取本地配置，也可能请求真实服务。

## 本机依赖与 iCloud

本机仓库位于 iCloud 同步的桌面目录。2026-11-21 作者决定保留这个位置。

在 `.claude/worktrees/` 下新建工作目录后，从主目录复制依赖。复制完成后，立即给新工作目录的 `node_modules` 设置 iCloud 忽略标记。在新工作目录中执行以下命令。

```bash
cp -R ../../../node_modules ./node_modules &&
  xattr -w 'com.apple.fileprovider.ignore#P' 1 node_modules
```

补装依赖只用 `npm install`。不要运行 `npm ci`。它会重建 `node_modules`，导致忽略标记丢失。

不要给 iCloud 里已有副本的目录补打忽略标记，例如 `dist/` 和 `.cache/`。iCloud 可能把本地目录改名为「原名 2」。

## 内容与生成文件

| 内容 | 应修改的输入 | 生成方式 |
| --- | --- | --- |
| 今日定理和 Parole | [批量写稿脚本](../scripts/daily-batch/run.mjs)、[静态后备稿](../src/data/siteContent.js) | 每月写好后存入 KV。修改静态定理后运行 `npm run theorems:render`。 |
| 每日法语阅读 | [样稿](../src/data/lectureSamples.js)、[出题要求](../worker/src/lecturePrompt.js)、[批量写稿脚本](../scripts/lecture-batch/run.mjs) | 每月用 GPT 订阅批量写稿。自动检查通过后由 GPT 交叉审稿并改稿。人工核对后写入 KV。Worker 只在缺稿时兜底。见[每月写稿](#每月写稿)。 |
| 书目 | [resourceCatalog.js](../src/data/resourceCatalog.js) | 页面直接读取 |
| 封面肖像 | [portraits.json](../src/data/portraits.json)、`public/portraits/` | 平时离线检查。运行 `npm run portraits:fetch` 才联网补图。补图会转为 WebP，并去掉色彩配置等附加数据。 |

`npm run dev` 和 `npm run demo` 的阅读接口都使用三篇样稿。

旧背词的导入脚本和词库原样保存在[归档目录](archive/vocabulary/)。

`public/health.json` 的 `ok` 只表示文件成功生成，不检查数据库或 AI。普通构建若只改变了它的时间戳，提交前执行 `git restore public/health.json`。不要一并还原手写文件。

### 每月写稿

用 ChatGPT 订阅账号登录 Codex CLI。在仓库根目录运行以下命令。例子按 2027 年 1 月的 31 天排稿。

```bash
batch=.cache/lecture-batch-2027-01-01
node scripts/lecture-batch/run.mjs --start 2027-01-01 --days 31 \
  --concurrency 4 --model gpt-6.2-astra --out "$batch"
```

省略 `--out` 时，稿件保存在仓库的 `.cache/lecture-batch-<起始日期>/`。加 `--dry-run` 可离线查看排期。加 `--previous 上一批目录` 可让 GPT 排题时避开近期写过的题材。

| 产物 | 内容 |
| --- | --- |
| `plan.json` | 每天的题材和出题重心。题型与难度沿用 Worker 的轮换顺序。 |
| `drafts/日期.json` | 通过自动检查的初稿。检查未通过时，脚本将问题交回 GPT 重写。每篇最多试写三次。 |
| `review/日期.json` | 另开一次 GPT 会话独立审稿。每条意见列出位置、原文、问题和改法。 |
| `review/日期-edits.json` | 有审稿意见时生成。文件保留修改后的全文和每条意见的处理说明。 |
| `days/日期.json` | 供人工核对的完整稿件。重跑同一批次时，脚本会检查并沿用已保存的稿件。 |

逐篇对照法语原文核对译文和讲解。讲解中的语法术语要换成平实中文。先独立做题，确认每题只有一个正确答案。再检查引文能否支持这个答案。对照审稿意见核实每处修改。人工修正写在 `days/` 中。

核对完成后运行整批检查。脚本按题材表核对日期、题型和难度，并逐篇检查正文、逐句原文和引文。

```bash
node scripts/lecture-batch/check.mjs "$batch"
```

取得作者对该批次的明确授权后，运行以下命令写入线上 KV。脚本只写本批日期的正文和索引信息。已有同日期稿件会被覆盖。本地 KV 使用 `--local`。

```bash
node scripts/seed-lecture.mjs --remote --batch "$batch"
```

### 定理和 Parole 每月写稿

作者于 2026-11-22 确认按月写稿。用已登录 ChatGPT 订阅账号的 Codex CLI，在仓库根目录运行。以下命令写完 12 月的 31 天。

```bash
node scripts/daily-batch/run.mjs --start 2026-12-01 --days 31
```

加 `--dry-run` 只看日期。默认目录为 `.cache/daily-batch-2026-12-01/`。排期时核对定理名，写稿时核对法语原句。两次检查都参考静态稿，以及默认批次目录里起始日期前 30 天的稿件。用过 `--out` 自定目录时，下一批可用 `--previous 上一批目录` 指明来源。

| 文件 | 核对内容 |
| --- | --- |
| `history.json`、`plan.json` | 用于查重的定理名、法语原句，以及本批每天的定理和例子。 |
| `drafts/日期.json` | 每天一条定理和一句 Parole。写稿时检查字段、公式、重复内容和常见中文套话。 |
| `review/日期.json`、`review/日期-edits.json` | 另开 GPT 会话审稿。有意见时，改稿文件保留全文和逐条处理说明。 |
| `days/日期.json` | 定稿保留 LaTeX、纯文本和 KaTeX 生成的 HTML。重跑同一命令可接着写。 |

核对定理的适用条件，再把例子算一遍。到所列作品中找到法语原句，核对署名和中文译文。逐条查看改稿记录，再检查整批。人工修改了 LaTeX 时，给检查命令加 `--render`，重新生成定稿里的公式 HTML。

```bash
batch=.cache/daily-batch-2026-12-01
node scripts/daily-batch/check.mjs "$batch"
node scripts/seed-daily.mjs --local --batch "$batch"
```

取得作者对该批稿件的明确授权后，运行 `node scripts/seed-daily.mjs --remote --batch "$batch"`。写入前会再检查整批。每个日期写入现有 `LECTURE` 的一个 `daily:日期` 键，同日旧稿会被覆盖。提前写好的稿件在北京时间当天零点开放。

## 检查的用途和限制

提交前的检查命令在 [CLAUDE.md](../CLAUDE.md)。本地检查使用假账号、假接口和独立的测试数据库，不能证明真实邮件、账号或 AI 正常。Worker 测试使用 Cloudflare 的运行引擎，避免只在 Node 中通过、上线后却报错。

浏览器检查和截图必须来自实际页面。修改共享样式后，还要查看受影响页面。首次截图前运行 `npx playwright install chromium`。截图和失败轨迹放在 `output/playwright/`。Safari、真实手机和跨设备流程的未验事项见 [剩余问题](remaining-work.md)。

CI（GitHub 上的自动检查）的触发条件见 [ci.yml](../.github/workflows/ci.yml)。以开发分支为目标的 PR 不会触发当前流程；改为合入主分支后，要重新核对检查结果。

## 数据库文件

`sql/schema/` 保存当前表定义，`sql/audit/` 用于只读核查，`sql/legacy/` 保存旧文件。这些 SQL 不是一套可顺序执行的安装脚本。

2026-09-27 已获授权执行 [表权限修正](../sql/schema/restrict_app_table_grants.sql)，并用 [只读查询](../sql/audit/app_permissions.sql) 核对结果。以后再次修改生产数据库，仍需重新核对并取得明确授权。前端发布不会自动执行 SQL。阅读答案表使用独立的 [setup_lecture_answers.sql](../sql/schema/setup_lecture_answers.sql)。答疑分段依赖已有的 `ai_messages`，旧记录按账号和北京时间日期归段。[分段表与迁移](../sql/schema/setup_ai_conversations.sql)

## 发布前的本地检查

`npm run deploy:check` 或 `bash deploy.sh` 只做本地检查，可在工作分支运行，不需要服务器配置。工作区必须没有未提交的改动。首次依次运行 lint、测试、构建、Worker 离线打包和浏览器检查。

只有脚本确认代码、依赖和环境未变，且发布文件未被改动，才沿用上次结果。只改普通说明文档也可沿用；修改 `CLAUDE.md` 会重新检查。记录和发布文件保存在本机 `.cache/mathclass-release/`，不复用另一台机器的检查结果。检查脚本会恢复构建生成的 health 时间戳。

发布前设置 `MATHCLASS_DEPLOY_HOST`、`MATHCLASS_DEPLOY_USER` 和 `MATHCLASS_DEPLOY_SSH_KEY`。密钥必须使用绝对路径。获得明确上线授权后，运行 `bash deploy.sh --publish`。发布仅允许 `mathclass/main`，且本地提交必须与远端一致；上传前会再次核对。

上传后核对用户平时访问的首页、版本文件、脚本和样式。Cloudflare 当前会给首页插入检测脚本。检查只在比较内容时去掉已核实的完整脚本，其余内容必须与构建一致。脚本模板变化也会报错。记录保存在 `.cache/mathclass-release/records/`，失败也会记录停止位置。文件核对通过不能代替真实账号和 AI 验证。上传失败可能只更新了部分文件，脚本不会自动回滚，也不会把失败记为成功。

发布目录固定为 `/var/www/MathClassWebsite/dist`。此命令不发布 Worker，不改服务器配置，不操作同机的青协网站和代理服务。构建中的 `health.json` 会另加一串根据源码计算的校验值，用来确认发布文件对应哪份源码；它仍不检查数据库或 AI。

[deployment/nginx/](../deployment/nginx/) 是仓库里的服务器配置，不能据此宣称已在生产生效。Worker 独立构建和部署，见它的 [接口说明](../worker/README.md)。

## 最近一次发布核验

2026-11-21 每日法语阅读随 PR #60 上线，网站发布文件已通过线上核对。[PR #60 上线记录](https://github.com/jsfjsf20070513-a11y/rucmathclass/pull/60#issuecomment-7055219112)

Worker 发布版本为 `0ba89e74-2c8d-4243-926e-8a42f637e318`（回滚版本 `8f15c4a9-fb54-4329-815a-07746138b82b`）。

11 月 1 日的字体修正和发布核验器更新见 [PR #59](https://github.com/jsfjsf20070513-a11y/rucmathclass/pull/59)。合并提交、部署时间和公网核验结果记录在该 PR 中。本机详细记录保存在 `.cache/mathclass-release/records/`。

下表保留 PR #58 于 2026-10-26 发布的记录，以及 2026-11-01 在 PR #59 部署前完成的公网复核结果。

| 项目 | 结果 |
| --- | --- |
| 已发布前端源码 | `67a3eb698c75b97b429ac23aba08d0015e00d1a8`，PR #58 |
| 公网 health | 构建时间 `2026-10-26T05:53:49.276Z`，应用标记 `MathClassWebsite` |
| 源码校验值 | `c5c1f4eb800769729cbce6c022beef8392207879b129f4f01d0233d8140a57b5` |
| 发布时检查 | lint、311 项测试、构建、Worker 离线检查、21 个浏览器场景及 GitHub CI 通过 |
| 发布时文件核对 | 服务器 161 个文件与构建一致；公网桌面加载 60 张肖像，手机尺寸加载 20 张，均与发布素材一致 |
| 发布备份 | `/var/backups/mathclass-release-20261026T060547Z/` |
| 11 月 1 日公网复核 | 首页、版本文件、脚本和样式共 14 个文件通过核对；首页仅去掉已核实的 Cloudflare 检测脚本后比较 |

2026-11-01 的首页检测脚本与 10 月 5 日的模板不同，原核验脚本因此报错。逐字比对确认，首页只有这一处注入差异。核验器现同时识别这两个完整模板，并核对响应、脚本参数和新版脚本 URL 中的 ray。未知脚本、正文变化和重复注入仍不能通过。

本地证据保存在 `.cache/mathclass-release/release-67a3eb6.json`、`public-portraits-67a3eb6.json`、`records/2026-10-26T06-12-09.111Z-cb5ff186.json` 和 `public-reverified-20261101.json`。这些是本机核验记录，不随 Git 分发。

10 月 26 日未发布 Worker。2026-11-01 通过 Cloudflare API 核实，`mathclass-ai` 仍由版本 `8780d6b7-4d6c-420d-a368-04cba2d6e70e` 承接 100% 流量，部署时间为 2026-10-05。此前的数据库和接口核验见 [10 月 5 日记录](https://github.com/jsfjsf20070513-a11y/rucmathclass/blob/67a3eb698c75b97b429ac23aba08d0015e00d1a8/docs/development.md#最近一次发布核验)。

### 2026-11-01 真实使用核验

使用一个真实账号，在 macOS Safari 中验证了登录。背词作答时，保存期间不能进入下一题，保存成功后按钮恢复。刷新后从下一题继续。AI 测试问题得到回答，刷新后仍能读到这轮对话。匿名和无效令牌调用聊天接口均返回 401，匿名语音请求返回 401，预检返回 204，错误方法返回 405。真实账号流程只测试了一个账号。接口探测只代表当次请求的结果，也不能保证模型以后仍有额度。

公式字体 `KaTeX_Size3` 的内嵌 WOFF2 被线上 CSP 拦截，本站 WOFF 备用文件可正常加载。本次修正让字体始终输出为本站文件，不调整 CSP。桌面与手机尺寸共 12 组未登录页面对比，每组前后截图逐像素一致；截图保存在 `output/playwright/20261101-audit/`。

真 iPhone 的 Safari 已检查首页、翻页、当日公式、登录、背词预习和答疑页，未见文字裁切或内容溢出。同一账号在手机上读到了电脑保存的测试问答。电脑原先从 `bonjour` 开始学习。保存该词后，手机新建学习队列从 `merci` 开始。这次检查覆盖了一题背词保存和一轮对话读取。手机朗读已由现场用户确认能听到法语声音。

尚未验证的范围继续保留在 [剩余问题](remaining-work.md)。
