# Carnet de classe · 前端宪法(2026-08-20 立)

改动任何页面前先读这份。它是 2026-08 杂志刊改版的**最高裁定**,来源于三方合议:
Claude Design 交接包(`docs/handoff-2026-08-20/`)+ 用户三轮口头拍板 + 审美档案
(`docs/aesthetic-profile.md`)。与旧对齐契约(math_网站/AGENTS.md 2026-06-21 节)冲突处,
以本宪法为准;落地后同步改 AGENTS.md。

## 0. 总纲:全站是一本书

**封面一本杂志,背词一叠卡片,书目一册图录,答疑一沓信笺——四种纸,一套翻法。**

- 一页(一停)只讲一件事;内容进场有先后,一件一件呈现,不一次堆满。
- 封面浓(60 人肖像墙),内页疏(只有字与发丝线)——浓淡本身是节奏。
- 居中不是教条,编排才是:一页内允许编辑式不对称,但该页必须只有一个主角、
  构图自身平衡。整册的秩序靠"一页一停 + 同一套翻页物理 + 常驻 folio"保证。

## 1. 权威来源与优先级

1. 本宪法(含下述"编排版"内页契约);
2. `docs/handoff-2026-08-20/DESIGN.md`(交接规范 v2)——除被本宪法明改处外全部有效;
3. `Home-B-Galerie.dc.html` —— **首页按稿原样执行**(用户明确满意),含天气 canvas 全部粒子代码、翻页编排、撕开转场,可直接移植;
4. `Interieur v2.dc.html` —— 三内页稿的**视觉语言**(字级、发丝线、选中反白、Q./R. 体例)继续有效;其**静态单页排版被本宪法第 5 节的编排版取代**。

## 2. 三大禁令(内页杂乱的病根,不许回潮)

1. **肖像只住封面。** 数学家肖像是全站最强的一手,只出现一次。内页禁止邮票、
   守护人索引带、幽灵字母等任何肖像/装饰复读。词↔人映射整个作废。
2. **元数据一屏一条。** 每个停顿至多一条计数(如底部进度线右端 `12 / 48`)。
   Série/正确率/配额等其余统计只住开始屏与结算屏。条目三件套(目录号+标签+简介)
   减为两件:标题外链 + 酒红小标签,简介一行在下。
3. **筛选器只在停顿处。** NIVEAU/THÈME 等控制项只出现在开始屏/结算屏,
   答题与浏览中绝不常驻。

## 3. 色纸墨 · 字 · 数字

纸色分层(页页不同,逐页收深):

| 页 | 底色 |
|---|---|
| 01 封面 / 06 Connexion | `#f4efe6` |
| 02 Vocabulaire 引导 / /vocabulary | `#faf6ee` |
| 03 Théorème / /assistant | `#fdfcf8` |
| 04 Bibliothèque 引导 / /resources | `#f0eae0` |
| 05 Parole | `#b9a58a` 山毛榉木色,文字容器 `mix-blend-mode: multiply; color: rgba(20,13,7,0.96)`,辅助字 `#4a3a28`,发丝线 `rgba(46,34,20,0.4)` |

墨:`#1a130e` / `#221d18`;灰墨 `#6f675e`;酒红 `#7d2f28`(hover `#7f302b`);
发丝线 `rgba(34,29,24,0.14~0.22)`。

字体(全部自托管,走 @fontsource + vendor.css @font-face,禁热链 Google Fonts):

- 花体刊名 **Pinyon Script**(仅封面 `Math`,52px 酒红);
- 眉头/细节/页码/folio **Bodoni Moda**(可变 opsz 6..96;大字开 `'opsz' 96`;斜体大刊头是内页唯一的"大");
- 正文衬线 **Cormorant Garamond**;中文宋体族(正体,不斜);
- 数字一律 `font-variant-numeric: lining-nums tabular-nums`。

## 4. 翻页物理(共用,不许各页自造)

抽成共用 hook(`src/hooks/usePageFlip.js`),Home 与三内页同一套参数:

- **重翻**(章节级:Home 五页之间、扉页→首题、末题→结算、跨路由衔接):
  `transform 0.9s cubic-bezier(0.72, 0, 0.22, 1)`,±105% 位移 + ±1.2~2.2° 侧倾,
  `transform-origin: 50% 100%`,投影随入场侧翻转;
- **轻翻**(卡片级:背词题与题之间、书架与书架之间):~0.5s 同曲线,±1° 侧倾;
- 进场内容 `data-animate` 逐件错开淡入(0.7s,起点 0.35s,步进 0.12s);
- 交互:← → 键、滚轮(|deltaY|>24,防抖 950ms)、触摸横滑 >56px、右下 ‹ › 按钮(44px 命中区);
- **页内滚动优先**:内容超一屏时滚轮先滚页内,滚到边缘才触发翻页;
- 左下 folio 与底部进度线是**不翻的常驻层**;
- `prefers-reduced-motion`:一切翻页降级为淡入淡出;
- **跨路由衔接(2026-08-20 修订:要利落)**:站内跳转**立即 navigate**,由目标页
  翻入盖上来(正向从右、返回从左,0.5s 同曲线)——**禁止先翻出当前页**,那会先露出
  底下的肖像墙再切换;← Accueil 按来路落页(/vocabulary→02、/resources→04、
  /login→05),不回封面;站内跳转抑制 PageLoading(首次进站保留)。

## 5. 页面契约

三个内页(/vocabulary /resources /assistant)与 `/` 同属一本书:**不渲染 Layout
页眉页脚**,各自带一条细导航(← Accueil / 刊名 / 状态小字,Bodoni 10px 大写,
底衬发丝线),这取代了 DESIGN.md §1 的"内页暂保留现有 Layout"。
/login 与 /reset-password 也脱离 Layout,自成杂志第 06 屏同款纸面(#f4efe6,
Connexion 视觉);/resources/curate 与 404 仍走 Layout。

### 5.1 Home(按 Home-B-Galerie 稿原样)

五页横翻 + Connexion 屏,100svh 无纵向滚动。要点照抄稿与 DESIGN.md §4–§7:
肖像墙 12×13.5svh 五行、有意溢出、统一黑白、multiply 0.74;花体 Math 顶中;
角落 ACCUEIL / SUZHOU {temp};Édition 行;02 从右、03 从左、04 从上、压卷 Parole 从下;
**05 Correspondance(2026-08-20 用户裁定,取代 DESIGN.md「Assistant 不进杂志导航」):
登录后才存在的一页**——镜像 02 的编辑页(刊名靠右、从左翻入,bg #fdfcf8),
ENTRER → /assistant;未登录整页不存在,书为 5 页,folio 随页数 0X — 0N;
天气四模式(雨/雷/晴昼/晴夜,cloud/snow 删除、阴雪回落 clear),Open-Meteo 苏州
缓存 3h,入场契约(文字与天气 1.1s 同淡入,API 超 1.2s 兜底);
03 定理页契约(2026-08-20 用户两次裁定收敛到极简):**只有 kicker/题/KaTeX 三件**,
prelude/note/Démonstration 一律不进杂志页(数据保留在库);05 Parole 用现有 `paroles` 池随机(作者·出处规矩不变);
Connexion 撕开转场(clip-path 双半 ±58%),**原地渲染**对接 useAuth,
动画完约 0.62s 后即可输入;Retour 反向合拢。`/` 路由不渲染 Layout 页眉页脚。

### 5.2 /vocabulary —— 一叠卡片(编排版)

- **扉页(开始屏)**:NIVEAU/THÈME 下划线选择行 + 今日配额 + 乱序/导入导出,
  `COMMENCER →` 重翻进首题。
- **题版**:每题一停。大词 Bodoni 斜体(桌面 ~118px 级)在左,选项罗马数字发丝线行
  (选中反白墨块、编号转金 `#c9a06a`)在右/下;音标 + `ÉCOUTER ▷` 下划线链。
  六题型共用骨架,仅题干区替换;判定反馈原页揭示(选项变暗、答案行淡入),
  `Continuer` 轻翻换下一题。
- **常驻层**:底部发丝进度线(酒红填充)+ 右端 `12 / 48`(全场唯一计数)。
- **结算屏**:重翻进入;Série/正确率/错词回顾/只练错词/再来一轮全住这里。
- **逻辑零改动**:SRS 队列、六题型、云端进度、导入导出、错词重练、
  study 预习流、键盘捷径全部保留;`src/lib/*` 与 vitest 不碰。

### 5.3 /resources —— 一册图录(编排版,2026-08-20 修订)

- **索引只有一份,住在 Home 第 4 页**(用户:CONSULTER 点完跟原来没区别——
  /resources 自带索引停 = 同一份索引出现两次,已删)。
- 本页直接**一架一页**,Ⅰ–Ⅷ 轻翻,folio `Ⅲ — Ⅷ`;CONSULTER 落第 Ⅰ 架,
  Home 索引行点击经 `#shelf-N` 直达对应架;翻入时条目逐条错开淡入。
- 条目 = 标题外链 + 酒红小标签,中文简介一行在下;禁目录号/幽灵字母/守护人带。
- 数据源 `resourceCatalog`(经 useResourceCatalog)不动,条数动态;
  DailyMeditation coda 保留在末架页脚(木色缩小版)。
- 架内容超一屏:页内滚动优先(见 §4)。

### 5.4 /assistant —— 一沓信笺(编排版)

- **空状态与对话态是两个停顿**:空状态 = Correspondance 刊头 + 起手问题细字链
  逐条淡入;首问发出,刊头向上翻走、信笺流接管。
- 每轮进场编排:Q. 行滑入 → 答句左侧发丝线自上而下画出(scaleY)→ 答文淡入 →
  公式行最后。等待指示 = 一根呼吸发丝线(复用 breathe),不用跳点。
- Q./R. 悬挂字母降号为小型眉头级(非 40px 初号);答句挂发丝左线;
  日期分隔线同封面 Édition 行;拍题照片 =「Figure n」编号图框,
  入口 = `JOINDRE UNE FIGURE` 文字链(无 emoji)。
- Worker、限流、云端历史、图片压缩、?term= 预填全部不动;
  未登录整页替换为居中 Connexion 提示。

### 5.5 /login 与 /reset-password

保留 auth 流程(登录/注册/验证码/找回;**手机号方式已按用户裁定移除**),
视觉为 Connexion 屏同款占位符发丝线表单,刊头随模式换法语单词
(Connexion / Inscription / Code / Réinitialisation)。
**撕开屏跳来的 /login?aux=1 只有三页签(注册/验证码/找回,默认注册)**——
撕开屏本身就是登录,辅页不重复它;直接访问 /login 仍是完整四页签。
原文:
斜体 Bodoni 刊头、居中发丝线输入框(focus 下划线转酒红)、`ENTRER` 下划线按钮。
`/login` 直链与 reset 流程不断链。

## 6. 资产管线

- **肖像**:`src/data/portraits.json`(60 条,年代序,页面与脚本共用)+ `scripts/fetch-portraits.mjs`
  → `public/portraits/{slug}.jpg`(宽 ≤480),产物入库(git),前端只引本地路径;
  运行时兜底 `onerror` 隐藏 img 露纸底格,不做热链回退。肖像仅 Home 封面使用。
- **本地 dev 环境**:Supabase anon key(公开随前端发布,RLS 是安全边界)写在
  本地 `.env`(gitignored);没有它登录相关 UI 会显示登录未启用。
- **字体**:`@fontsource-variable/bodoni-moda`(含 italic)、
  `@fontsource-variable/cormorant-garamond`(含 italic)、`@fontsource/pinyon-script`,
  vendor.css 显式 @font-face(latin + latin-ext),Vite 打包自托管。

## 7. 验收清单

- [ ] Home:100svh 无纵向滚动;五页四方向翻页正确、回翻对称;60 肖像全本地、
      年代序、统一黑白、左右溢出截断;花体 Math 不遮角落导航;天气四模式正确、
      阴/雪回落 clear、缓存与入场契约不变;撕开/合拢 60fps;Connexion 原地渲染。
- [ ] 每日定理与现站同源同轮换;KaTeX 正常;无证明折叠(用户裁定)。
- [ ] Parole 木色页 multiply 通透感;随机引语有出处。
- [ ] 三内页:一页一停成立;翻页物理与 Home 同参;内页无任何肖像;
      每停顿至多一条计数;筛选器不进答题屏;页内滚动优先手感正确。
- [ ] /vocabulary /resources /assistant 换皮后原功能与数据源零回归(vitest 全绿,lint 0 warning)。
- [ ] /login 直链与 reset-password 不断链。
- [ ] 站内跳转翻页衔接、无 PageLoading 白幕;首访加载保留。
- [ ] `prefers-reduced-motion` 全部降级淡入淡出。
- [ ] 移动端:封面墙 5 行、溢出裁切更多列;触摸横滑翻页;≥44px 命中区;粒子数减半。
- [ ] 验证在真实渲染页上量(getComputedStyle / 实际交互),禁"注入 DOM + 截图"。

## 8. 落地后待办

- [x] 更新 math_网站/AGENTS.md 对齐契约节(2026-08-20 已换代为"视觉裁定与验证契约");
- [x] Layout 页脚 Bibliothèque/Connexion 链接删除(被杂志第 4/5 页吸收);
- [x] DailyMeditation 组件保留(Resources 末架 coda 仍用),Home 内联渲染 Parole。
