# 代码怎么分工

前端是 React 静态单页应用。`src/main.jsx` 挂载认证上下文，`src/App.jsx` 定义路由；Vite 构建出 `dist/`。浏览器直接使用 Supabase 的公开客户端。`worker/` 是单独的 Cloudflare Worker，代理 AI 请求，不保存对话。

## 页面与业务逻辑

| 要改的部分 | 先看的文件 | 已分开的职责 |
| --- | --- | --- |
| 登录状态 | [AuthContext](../src/context/AuthContext.jsx)、[authSession](../src/lib/authSession.js)、[authBackend](../src/lib/authBackend.js) | React 订阅、会话事件、认证请求分别处理 |
| 密码重置 | [usePasswordReset](../src/hooks/usePasswordReset.js) | 表单绑定最初确认的账号；更新请求使用该账号的已验证令牌 |
| 背词 | [vocabularyTrainer](../src/lib/vocabularyTrainer.js)、[useVocabularyTrainer](../src/hooks/useVocabularyTrainer.js) | 控制器管理练习顺序和保存确认；hook 连接账号、键盘、焦点和音频；`Vocabulary.jsx` 展示页面 |
| AI 对话 | [assistantConversation](../src/lib/assistantConversation.js) | 管理读取、发送、保存、清空的顺序；网络请求和历史存取由外部传入 |
| 资源书架 | [useResourceCatalog](../src/hooks/useResourceCatalog.js)、[resourceBackend](../src/lib/resourceBackend.js) | 公开读取只依赖 `resources`；再与静态目录合并 |
| 首页和翻页 | [useHomeWeather](../src/hooks/useHomeWeather.js)、[useConnexionTransition](../src/hooks/useConnexionTransition.js)、[usePageFlip](../src/hooks/usePageFlip.js) | 天气读取、封面绘制、登录展开和翻页各自管理生命周期；Home 保留页面与账号页序 |

`.eslintrc.cjs` 阻止页面、组件和 hook 直接导入 Supabase，也阻止 `lib`、`data` 反向依赖 React 或界面模块。它检查静态 import/export，不检查动态 import()、所有网络请求和状态顺序。`AuthContext` 连接认证客户端；资源实时订阅由 `resourceBackend` 建立和清理。

## 账号与写入结果

[authSession](../src/lib/authSession.js) 同时接收初始化查询和登录事件。新事件优先，旧初始化响应不能把账号改回去；退出结果也按账号和生命周期隔离。公开页面不会等待认证初始化才挂载。

[authTransport](../src/lib/authTransport.js) 把认证请求的响应正文也纳入超时。Login 表单按账号重新挂载，旧账号的表单结果不会出现在新账号页面。

密码重置先核对 session，再向服务端核对令牌所属用户，最后用同一令牌更新。账号变化或明确失效的重置回调会关闭表单。写入结果不明时不允许连续提交，用户需退出后核对密码。

## 背词进度

- [vocabularyTrainer](../src/lib/vocabularyTrainer.js) 每个实例只管理一个账号。加载、预习、作答、保存确认、恢复和错词重练集中在这里；存储、请求和时间由外部传入，可以脱离 React 测试。
- [srsScheduler](../src/lib/srsScheduler.js) 决定复习间隔和队列；[exerciseGenerator](../src/lib/exerciseGenerator.js) 生成题目。
- [vocabularyBackend](../src/lib/vocabularyBackend.js) 按用户分页读取 `review_states`。更新已有行时比较先前的 `updated_at`，避免覆盖其他设备的新进度。
- [reviewSubmission](../src/lib/reviewSubmission.js) 固定本次待保存结果；结果不明确时先核对，不能把重试当作又答对一次。
- [vocabularySession](../src/lib/vocabularySession.js) 用带账号 ID 的 localStorage key 保存本机一轮题目。一般快照按上海日期过期，未确认写入会保留到核对结束。这不是跨设备同步的数据源。
- 词条 `id` 对应数据库的 `word_id`。改排版或修释义不能顺便重排 ID。

作答时先固定本次结果并保存待确认快照，再发云端请求；云端确认和本地游标保存都成功后，才计分并允许下一题。失败重试复用同一份结果，最后一题也按这个顺序恢复。卸载或开始新一轮加载后，旧请求不能再改状态和本机快照。配对热身只计本轮成绩，不改变单词复习间隔。

## AI 对话

页面经 `useAssistantConversation` 使用独立的对话控制器。它阻止读取、发送和清空互相抢状态；切换账号或卸载后，旧响应失效。

[assistantClient](../src/lib/assistantClient.js) 发送最近的对话给 Worker。它通过 `authBackend` 获取当前对话所属账号的访问令牌，放在 Authorization 请求头中；会话已退出或换成其他账号时停止发送，等待令牌期间也可取消。

[aiAssistantBackend](../src/lib/aiAssistantBackend.js) 将一问一答一起写入 `ai_messages`，读取最近的文字历史。图片只留在当前页面，历史文字会注明曾有附图。收到回答和保存成功是两件事，保存不明时页面会明确提示。

## 数据表

当前页面实际使用的表是：`review_states`（个人进度）、`ai_messages`（个人对话）、`resources`（公开增补书目）。认证使用 Supabase Auth，不是自建登录表。

旧 `/resources/curate` 地址回到书架。资源推荐表单、提交接口和队列编码已移除，运行代码不再读写 `comments`；旧数据及历史权限 SQL 未执行修改。不要因历史数据仍在而恢复已经下线的产品入口。

2026-09-27 在生产 Supabase（PostgreSQL 17.6）只读查询了系统目录：`review_states` 和 `ai_messages` 已开启 RLS，个人记录的行策略要求 `auth.uid() = user_id`；对话只有读取、新增、删除策略。`anon` 和 `authenticated` 都不是表所有者，没有超级用户或绕过 RLS 的权限，也没有加入其他角色。这个结论来自实际策略，不代表已经用两个真实账号测试过读写。

`resources` 允许公开读取，管理操作仍检查 `profiles.role`；`profiles` 只允许读取自己的行。`public.handle_new_user()` 固定写入普通用户角色，没有使用注册信息中的自报角色。本次未发现 public 中引用这几张表的视图，也没有读个人记录。

表授权仍过宽：匿名角色保留了对话表的全套表权限，登录角色在这四张表上也有多余权限。行策略能限制常规读写，但不能代替表授权，例如 [PostgreSQL 的 TRUNCATE 不受行策略限制](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)。不能据此推断匿名用户已经通过网页读到了对话，也不能因为 RLS 开着就忽略多余授权。

现场还确认，`postgres` 和 `supabase_admin` 在 public 中新建表时，会默认给匿名和登录角色全套表权限。两个现役个人表的定义已显式撤销多余授权，测试也模拟了这种默认配置。权限修正只针对现有四张表，不改共享库的全局默认授权；以后新增或重建表仍须明确授权。

[restrict_app_table_grants.sql](../sql/schema/restrict_app_table_grants.sql) 准备了授权收紧：个人表仅限登录账号按现有功能读写，书目保留公开读取和原管理员操作，资料表保留本人读取。它不迁库、不改记录或 RLS，**尚未在生产执行**。应用前须用 [app_permissions.sql](../sql/audit/app_permissions.sql) 重新核对，并取得生产变更授权；不能整段重跑历史 SQL。

## 与 Raccord 的边界

本仓运行代码没有导入 Raccord 目录，没有作品站页面。相册、协作台、Web3 等旧路径在 `App.jsx` 中只是重定向；公开资源读取也已脱离相册表。

本仓 `worker/wrangler.toml` 的路由只写了 `rucmathclass.com`，CORS 列表只有班级站域名和本地开发地址。2026-09-27 通过 Cloudflare API 只读确认：当前 zone 只有班级站 `/api/chat`、`/api/speak*` 两条 Worker 路由，均绑定 `mathclass-ai`；两个站点没有 Worker 自定义域名绑定。

相邻 Raccord 仓库仍把 Worker 写成 `mathclass-ai`，并列出了两个域名的路由。这不是当前线上路由，却仍有覆盖风险：若从那份配置向同一个账号发布，就会操作班级站的同名 Worker。Raccord 再次发布前，必须先明确自己的 Worker 目标。

相册 SQL 仍作为历史运维文件保留。运行代码里的旧审核、相册写入和对应 Web3、黑客松样式已移除。两仓本地配置和班级站线上脚本指向同一个 Supabase 项目，Raccord 代码也读写同名的个人进度、对话和资源表。生产表及行策略没有站点区分：同一个账号从两份客户端登录，会使用同一份个人记录。**账号之间的行隔离不是两个站点之间的数据隔离**，收紧表授权也不会改变这层共用关系。

班级站发布脚本固定 `/var/www/MathClassWebsite/dist`，Raccord 仓库 Nginx 文件写的是 `/var/www/raccord/dist`；服务器实际目录和账号权限尚未核验。同日公开 HTTP 检查中，Raccord 根地址返回 301，跳向班级站根地址；班级站 health 仍标记 2026-09-04 构建。**代码入口独立不等于生产服务已经隔离**，这些只读结果也不是迁库或改路由的授权。

## 首页动画

天气是可选内容：有效缓存保留三小时，请求连同响应正文最多等待四秒；没有天气时封面仍会显示。封面绘制只在当前页且标签可见时运行，按窗口宽度减小粒子数量，并将画布像素倍率限制为 2。

登录转场一开始就锁住翻页，临时克隆不接收焦点；账号变化会清掉旧克隆。`animationTasks` 管理定时器与动画帧，离开页面时统一取消。`pageFlipRenderer` 负责 DOM 绘制，`usePageFlip` 负责输入；同页数据更新保留正在等待的入场动画，换页才使旧任务失效。

## 页面下载与恢复

路由动态导入统一在 `src/routes/pageLoaders.js`。空闲预取逐个执行，离开组件就停止后续任务；离线、隐藏标签页、节省流量和慢速连接不预取。鼠标移入或键盘聚焦主要入口也使用同一判断。

`PageBoundary` 在等待超过 600 毫秒时显示提示，下载或页面渲染失败时提供重新加载与返回首页。整个入口脚本下载失败或启动超过 15 秒时，`boot-start.js` 让静态启动页显示重载按钮；React 接管后清理启动监听。

封面肖像由 `PortraitWall` 按可见区域请求，离开封面不继续观察，已下载的图片保留。没有 IntersectionObserver 的浏览器会加载完整清单。图片内容和原有网格不变。

## Worker 的请求边界

`worker/src/index.js` 做准确路径分派、方法检查，再经过 `requestAccess.js` 校验权限。两个接口都要求 Bearer 令牌，经配置的 Supabase `/auth/v1/user` 核实；限流和身份核验合计最多等待五秒。未登录返回 401，明确超额返回 429，配置缺失、限流故障或身份服务不可用返回 503，不再继续调用模型。预检不要求登录。

聊天和语音分别在 `chat.js`、`tts.js`，不处理登录逻辑。`requestBody.js` 在读取时限制聊天正文，`requestScope.js` 把响应正文也计入超时，并把请求取消传到上游。语音内部缓存只保存音频；每次读取仍先校验身份，返回浏览器的响应禁止缓存。背词页面使用浏览器朗读，不调用 Worker 语音。

这些模块不导入 React 或前端代码；身份核验通过 Supabase HTTP API 完成，不安装 Supabase SDK，也不读取业务表。共享 Supabase 项目的账号仍属于同一个身份体系，这项校验没有拆分两站账号或数据库权限。

以上是仓库实现。2026-09-27 读取生产版本时，线上 Worker 仍是 2026-08-20 发布的 `4ff0f625-91e4-41cd-af26-1afc40e6026e`，尚无身份认证，限流故障仍放行；也没有新增校验所需的两个 Supabase 配置。发布前要按 [Worker 配置说明](../worker/README.md) 准备并与前端一起核对，不能将合并视为上线。

## 样式与浏览器检查

`App.css` 只保留有序导入，首页、背词、资源、AI、登录与最后的窄屏覆盖分别在 `src/styles/`。`PageNav` 统一背词、资源、答疑页的导航；`PageControls` 统一首页和书架的页码与翻页按钮。它们不负责路由或页序，由页面传入回调和禁用状态。

共用颜色、动效、导航、文字按钮和提示文字放在 `shared-controls.css`；各页面的特殊间距和状态仍在对应文件。改背词规则不再需要维护资源页的导航样式。`editorial-base.css` 只保留通用布局、每日一句、状态提示、404 和全局窄屏规则，账号表单归 `auth.css`；旧管理台、钱包和旧版页面的无引用样式已删除。CSS 全局层叠仍在，改共享规则仍要检查受影响页面。

`scripts/browser-check.mjs` 用真实 Chromium 和临时生产构建验证公开页面、登录后的背词与答疑页面，以及下载故障恢复。账号、历史和清空操作由 `browser-account-fixture.mjs` 在本机模拟；外部请求全部拦截，不验证生产认证、数据库或外部模型。
