# CLAUDE.md — 班级网站线(Carnet de classe)

> 本文件 2026-08-21 重写,2026-08-25 随拆仓更新拓扑表述,2026-09-02 AI 协作债清理(Web3 残留、黑客松文档、照片注入链路全部删除)。旧版"双语链上版 / web3+AI 叠加层"身份已随 2026-08-13 线重启作废。
> 你在仓 **`rucmathclass`** 的分支 **`mathclass/main`**(目录 `line_math/班级网站`,独立主 clone)——这是**班级网站线**,
> 线上 `rucmathclass.com` 现役构建就来自本分支,GitHub 默认分支也是它(2026-08-25 起)。
> Raccord 作者作品站(未首发)已于 2026-08-25 拆到**独立仓 `raccord`**(目录 `line_math/Raccord`);本仓旧 `main`
> 分支只是拆仓前的只读引用(tag `backup/pre-split-2026-08-25`),**不要在上面动手**。
> 两线关系与部署互斥见线级 `line_math/CLAUDE.md`(正本);08-21 摸底现场记录已归档在本仓 `docs/archive/math线摸底_2026-08-21.md`。

## 这是什么

**Carnet de classe**——中法数学班的班级手册站,产品身份是**减法**后的两件事:**读 + 练**。
「中文和法语是这个网站的灵魂」(作者原话,2026-08-13)。2026-08-20 起整站为**杂志刊形态**(5 页横翻扉页)。

- **扉页 /**:每日定理(48 条,对齐大二上四门课,双语证明,KaTeX 构建期预渲)+ Parole du jour(38 条真实引语)
- **资源书架 /resources**:静态目录 + Supabase `resources` 增补,外链全部经 sanitizeStoredUrl 消毒
- **SRS 背词 /vocabulary**:3652 词艾宾浩斯(纯核心 `src/lib/srsScheduler.js` 已单测),进度存 `review_states`(per-user RLS)。词库真相源是 `scripts/vocab-source.json`(`npm run vocab:import` 生成 `frenchVocabulary.js`,不手改生成物);词条 `id` 绑用户复习进度,不可改动
- **AI 助手 /assistant(杂志第 05 页,登录后)**:经 Worker `/api/chat` 调 Gemini(降级链动态发现),云端历史 `ai_messages`

## 技术栈与红线

- React 18 + React Router 7 + Vite 5 **静态 SPA** + Supabase(anon key + RLS)+ KaTeX。保持此形态,别回退服务端单体,前端不引入需 service-role 的写法。
- 🔴 **Supabase 与归档仓共享同一项目**,RLS 是唯一且共享的安全边界;本线依赖 7 张表(comments/profiles/review_states/ai_messages/albums/album_photos/resources,全 RLS on)。**恢复任何公开读策略前必须先核列级授权**(comments.user_email 列级 REVOKE 已于 08-13 落地,别退)。
- 🔴 **共享 Cloudflare Worker(mathclass-ai)正本在本线**(2026-08-21 拍板):改 `worker/` 在本目录部署;改 `/api` 契约前核对 `src/lib/assistantClient.js` 与 `src/hooks/useVocabularyAudio.js`。聊天实现位于 `worker/src/chat.js`,保留 `{messages→text}` 和旧 `body.image`,新增 `messages[].image` 支持当页图片追问;发布此改动时先更新 Worker 再更新前端。Raccord 首发时会把 raccord 路由/CORS 合并进本线配置(见 raccord-deploy skill),届时别当成异物删掉。
- 🔴 **视觉最高裁定 = `docs/design-constitution.md`(宪法)+ `docs/aesthetic-profile.md`(审美档案)**,改任何页面先读;验证必须在真实渲染页上量,禁止注入 DOM 截图验证。

## 命令与质量闸

```bash
npm install
npm run dev      # predev 自动跑 render-theorems + generate-health
npm run lint && npm test && npm run build   # 三连绿再继续(镜像 CI;CI 已含 mathclass/main 触发)
```

- 每个 commit 独立可构建;`public/health.json` 是构建落痕,**提交前 `git restore public/health.json`**。
- 分支工作流、commit 规范见 mathclass-dev-workflow skill。

## 部署

走 **mathclass-deploy skill**(2026-08-21 按真实路径重写):发布源=本目录(`班级网站`),
不设 `MATHCLASS_DEPLOY_DIR`(默认即线上目录),部署前记 buildTime、部署后对照。需用户原文点名授权。
私有照片注入链路已退役(相册走 Supabase);deploy.sh 的注入段与 prepare/cleanup-private-assets 两脚本已于 09-02 删除,`MATHCLASS_PRIVATE_REPO` 不再被读取。

## 关键文档

- `docs/mathclass-line-restart-2026-08-13.md` —— 线重启底稿:五维盘点、风险清单、roadmap(阶段1✅;阶段2 诚实性刷新原定 9 月前,**已到期、三件事未逐项核验**;阶段3 等作者点方向)
- `docs/design-constitution.md` + `docs/aesthetic-profile.md` —— 视觉宪法(08-20 立宪)
- `docs/INDEX.md` —— 文档导航

## 已知债(重启盘点遗留,动相关模块前看一眼)

- 资源推荐闭环断裂:`/resources/curate` 提交入 ops 队列但站内审核 UI 已下线,提交安静堆积
- Web3 已整线退役:寄语墙 08-13 拆除(`17e9fd9`),Anchor 程序与 wallet 代码 09-02 删除,历史在 git。`comments` 表仍由 `src/lib/opsQueue.js` 使用,不是寄语墙残留
- Worker TTS 用 preview 模型(无稳定性承诺)
