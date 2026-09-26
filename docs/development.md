# 开发与验证

## 开始工作

使用 [.nvmrc](../.nvmrc) 指定的 Node 版本。依赖以 `package-lock.json` 为准，执行 `npm ci`。开发命令在 [package.json](../package.json)：

| 命令 | 会做什么 |
| --- | --- |
| `npm run dev` | 先离线检查肖像素材，再生成定理 HTML、health 文件并启动 Vite |
| `npm run lint` | 检查 JS/JSX/MJS 和前端导入边界；当前不检查 Worker |
| `npm test` | 在 Node 环境运行 `src/`、`worker/src/`、`scripts/` 下的 `*.test.js` |
| `npm run build` | 运行同样的生成步骤，再生成 `dist/` |
| `npm run preview` | 本地查看已有构建 |

`.env.example` 列出登录所需的公开配置。`VITE_AI_ENDPOINT` 可覆盖聊天地址；未设置时仍会调用 `https://rucmathclass.com/api/chat`。首页也会访问 Open-Meteo。需要离线或隔离验证时，应明确使用本地模拟服务，不要以为 Vite 自动模拟了这些接口。

## 内容与生成文件

| 内容 | 应修改的输入 | 如何生成 |
| --- | --- | --- |
| 首页定理和引语 | [siteContent.js](../src/data/siteContent.js) | 定理执行 `npm run theorems:render`；引语直接读取 |
| 双语证明文本 | [theoremExplanations.js](../src/data/theoremExplanations.js) | 同上；生成脚本存在不表示每份产物都正被页面使用 |
| 法语词库 | [vocab-source.json](../scripts/vocab-source.json) | 先检查导入报告，再明确指定输出 |
| 静态书目 | [resourceCatalog.js](../src/data/resourceCatalog.js) | 页面直接读取；外链经过 URL 校验 |
| 封面肖像 | [统一清单](../src/data/portraits.json) 与已入库的 `public/portraits/` | `npm run portraits:check` 离线检查缺图、JPEG 文件标记和多余文件；显式执行 `npm run portraits:fetch` 才会联网补图 |

词库命令需要传入文件，单独运行 `npm run vocab:import` 不会自动导入默认词库：

```bash
npm run vocab:import -- scripts/vocab-source.json
npm run vocab:import -- scripts/vocab-source.json --out src/data/frenchVocabulary.js
```

第一条只输出报告。第二条写生成文件；检查拒绝项、重复项和 ID 后再执行。不要直接编辑生成的 `frenchVocabulary.js` 和 `*.generated.js`。

构建生成的 `public/health.json` 记录 `status/app/version/buildTime/mode`，其中 `status: "ok"` 是固定标记，不执行数据库或 AI 探测。本地验证后，若它的变化只是新时间戳，在提交前执行 `git restore public/health.json`。不要一并还原其他手写文件。

## 这些检查能保护什么

单测覆盖排程、题型、快照、提交确认、背词与对话控制器、首页转场与天气、资源分页、认证状态和部分 Worker 聊天请求。背词控制器测试会走完提交、重试、刷新恢复和错词重练，也检查重复输入与旧账号迟到响应。接口测试使用模拟客户端，不证明生产 RLS、外部模型或邮件服务正常。

当前没有自动浏览器测试。涉及状态或布局的修改，至少在真实页面验证相关流程：账号切换、请求失败后的重试、背词最后一题与刷新恢复、资源云端失败后的静态目录、AI 保存失败提示。改首页还要确认登录前后页数变化和翻页动画，不要用注入 DOM 拼出的截图代替验证。

CI 的实际触发范围见 [.github/workflows/ci.yml](../.github/workflows/ci.yml)：推送到 `mathclass/main`，或以它为目标的 PR。以开发分支为目标的堆叠 PR 不会触发这份流程；转向主分支后要等 CI 再核对。

## 运维文件不是安装顺序

- [setup_vocabulary.sql](../setup_vocabulary.sql)、[setup_ai_history.sql](../setup_ai_history.sql) 定义进度和对话表及各自策略。
- [setup_official_content.sql](../setup_official_content.sql)、[setup_storage_buckets.sql](../setup_storage_buckets.sql) 仍包含相册表和存储桶。
- [harden_rls.sql](../harden_rls.sql)、[enable_rls.sql](../enable_rls.sql) 涉及角色、表权限和旧业务。不能全部重跑来“修一下权限”。
- [rls-live-check-2026-09-03.sql](rls-live-check-2026-09-03.sql) 有只读核查语句；文件中的历史注释不代表现在的线上结果。

[deploy.sh](../deploy.sh) 只做构建、远端建目录和 `rsync --delete`。它要求 `MATHCLASS_DEPLOY_HOST`、`MATHCLASS_DEPLOY_USER`、`MATHCLASS_DEPLOY_SSH_KEY`；`MATHCLASS_DEPLOY_DIR` 可覆盖默认目录 `/var/www/MathClassWebsite/dist`。

脚本不会替你运行 lint/test，也不检查仓库、分支或线上版本。因此发布前要明确核对这些条件和同步目标，获得用户的部署授权，并遵守部署流程。这里记录脚本行为，不是上线授权。

[deployment/nginx/](../deployment/nginx/) 是仓库里的服务器配置，不能据此宣称已在生产生效。Worker 独立构建和部署，见它的 [接口说明](../worker/README.md)。
