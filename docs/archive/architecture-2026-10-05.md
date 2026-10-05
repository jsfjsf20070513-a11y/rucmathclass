# 已归档：2026-10-05 整理前的架构说明

此文只供追溯。当前入口是 [架构说明](../architecture.md)；这里的旧状态和计划不能用来指导新改动。原有相对链接按旧文件位置书写。

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

2026-09-27 经用户授权，在生产 Supabase（PostgreSQL 17.6）执行了 [restrict_app_table_grants.sql](../sql/schema/restrict_app_table_grants.sql)，并重新查询系统目录核对结果。`review_states` 和 `ai_messages` 已开启 RLS，个人记录的行策略要求 `auth.uid() = user_id`；对话只有读取、新增、删除策略。`anon` 和 `authenticated` 都不是表所有者，没有超级用户或绕过 RLS 的权限，也没有加入其他角色。

`resources` 允许公开读取，管理操作仍检查 `profiles.role`；`profiles` 只允许读取自己的行。`public.handle_new_user()` 固定写入普通用户角色，没有使用注册信息中的自报角色。本次未发现 public 中引用这几张表的视图，也没有读个人记录。

实际表权限已收紧为下表；表权限允许的操作仍须通过原有行策略。

| 表 | 匿名角色 | 登录角色 |
| --- | --- | --- |
| `review_states` | 无 | 读取、新增、修改、删除自己的进度 |
| `ai_messages` | 无 | 读取、新增、删除自己的对话 |
| `resources` | 公开读取 | 公开读取；原管理员可新增、修改、删除 |
| `profiles` | 无 | 读取自己的资料 |

四张表的实际有效权限逐项符合预期，没有额外列授权；行策略、所有者、角色设置和全局默认授权与执行前一致。匿名 REST 接口使用不返回记录的 HEAD 请求核对：书架返回 200，三张个人表返回 401。没有读取或修改用户记录，也没有用两个真实账号测试完整写入流程。表权限和行策略都要检查，例如 [PostgreSQL 的 TRUNCATE 不受行策略限制](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)。

现场还确认，`postgres` 和 `supabase_admin` 在 public 中新建表时，会默认给匿名和登录角色全套表权限。两个现役个人表的定义已显式撤销多余授权，测试也模拟了这种默认配置。权限修正只针对现有四张表，不改共享库的全局默认授权；以后新增或重建表仍须明确授权。

这次权限修正不迁库、不改记录或 RLS。以后再次执行前，仍须用 [app_permissions.sql](../sql/audit/app_permissions.sql) 重新核对，并取得当次生产变更授权；不能整段重跑历史 SQL。

## 与 Raccord 的边界

本仓运行代码没有导入 Raccord 目录，没有作品站页面。相册、协作台、Web3 等旧路径在 `App.jsx` 中只是重定向；公开资源读取也已脱离相册表。

本仓 `worker/wrangler.toml` 的路由只写了 `rucmathclass.com`，CORS 列表只有班级站域名和本地开发地址。2026-09-27 通过 Cloudflare API 只读确认：当前 zone 只有班级站 `/api/chat`、`/api/speak*` 两条 Worker 路由，均绑定 `mathclass-ai`；两个站点没有 Worker 自定义域名绑定。

Raccord 的 [隔离改动](https://github.com/jsfjsf20070513-a11y/raccord/pull/1) 将 Worker 改为 `raccord-ai`，只列自己的子域路由，限流 namespace 与班级站不同。其开发代理只连接本机 Worker，不再调用班级站生产服务。两边 Worker 的密钥分别配置，不能从 Raccord 仓库发布本服务。

相册 SQL 仍作为历史运维文件保留。运行代码里的旧审核、相册写入和对应 Web3、黑客松样式已移除。班级站保留现有 Supabase 项目 `xfwkjhajrqxsakzovcwx`；Raccord 的独立项目 `zkjwiljxgiockkzrkjui` 已于 2026-09-27 经用户确认后初始化。本机 Raccord 配置已换成新项目，客户端只读取自己的环境变量，并拒绝已知班级站地址。账号和个人记录没有复制，旧库记录保持原样，不按猜测划分或删除。

新库六张表都开启 RLS，96 项匿名与登录角色的表权限符合预期；匿名 HEAD 请求在两个公开表返回 200，在四张个人或私有表返回 401。Auth 和业务表的记录数仍为零，没有自动指定管理员。新配置的构建已核对书架与登录入口；真实注册、邮件确认和找回密码尚未验收，回调域名随 Raccord 首发配置，不能把空库接口检查称为完整登录验收。

两仓发布脚本分别固定 `/var/www/MathClassWebsite/dist` 与 `/var/www/raccord/dist`，核验各自仓库、主分支和构建标记，默认只在本地检查。Raccord 已移除班级站 Nginx 副本。2026-09-27 SSH 只读确认班级站目录存在，Raccord 目录和站点尚未启用；Nginx 默认站点会将未匹配域名跳到班级站。公开 Raccord 地址也返回 301，但 Cloudflare DNS 和重定向规则尚未读取，不能断言只有源站这一层。当前 SSH 账号是 root，目录与脚本分离不等于服务器账号权限隔离。

班级站已于 2026-09-27 经用户授权发布前端、Worker 和天气所需的 CSP，公网 health、静态文件及接口拒绝行为已核对，具体版本见 [发布记录](development.md#最近一次发布核验)。Raccord 未发布，旧库记录没有删除或复制。以后的合并仍不能代替部署核验。

## 首页动画

天气是可选内容：有效缓存保留三小时，请求连同响应正文最多等待四秒；没有天气时封面仍会显示。封面绘制只在当前页且标签可见时运行，按窗口宽度减小粒子数量，并将画布像素倍率限制为 2。动画时间间隔限制在 0–50 毫秒；首帧时间早于初始化时不会产生负半径，长时间离开标签页也不会让粒子瞬间跳远。

登录转场一开始就锁住翻页，临时克隆不接收焦点；账号变化会清掉旧克隆。`animationTasks` 管理定时器与动画帧，离开页面时统一取消。`pageFlipRenderer` 负责 DOM 绘制，`usePageFlip` 负责输入；同页数据更新保留正在等待的入场动画，换页才使旧任务失效。

## 页面下载与恢复

路由动态导入统一在 `src/routes/pageLoaders.js`。空闲预取逐个执行，离开组件就停止后续任务；离线、隐藏标签页、节省流量和慢速连接不预取。鼠标移入或键盘聚焦主要入口也使用同一判断。

`PageBoundary` 在等待超过 600 毫秒时显示提示，下载或页面渲染失败时提供重新加载与返回首页。整个入口脚本下载失败或启动超过 15 秒时，`boot-start.js` 让静态启动页显示重载按钮；React 接管后清理启动监听。生产构建按启动脚本内容生成带哈希的文件名，避免 CDN 继续配给新页面一个旧脚本。

封面肖像由 `PortraitWall` 按可见区域请求，离开封面不继续观察，已下载的图片保留。没有 IntersectionObserver 的浏览器会加载完整清单。图片内容和原有网格不变。

## Worker 的请求边界

`worker/src/index.js` 做准确路径分派、方法检查，再经过 `requestAccess.js` 校验权限。两个接口都要求 Bearer 令牌，经配置的 Supabase `/auth/v1/user` 核实；限流和身份核验合计最多等待五秒。未登录返回 401，明确超额返回 429，配置缺失、限流故障或身份服务不可用返回 503，不再继续调用模型。预检不要求登录。

聊天和语音分别在 `chat.js`、`tts.js`，不处理登录逻辑。`requestBody.js` 在读取时限制聊天正文，`requestScope.js` 把响应正文也计入超时，并把请求取消传到上游。语音内部缓存只保存音频；每次读取仍先校验身份，返回浏览器的响应禁止缓存。背词页面使用浏览器朗读，不调用 Worker 语音。

这些模块不导入 React 或前端代码；身份核验通过 Supabase HTTP API 完成，不安装 Supabase SDK，也不读取业务表。它只接受配置项目中的账号；Raccord 的独立账号体系由新数据库提供，不靠 CORS 或这个 Worker 划分个人记录。

上述身份校验已于 2026-09-27 发布，两个 Supabase 配置均指向班级站项目。公网未登录和失效令牌请求已确认返回 401；真实账号的模型回答及保存仍未验收。认证请求使用 Workers 支持的 `redirect: 'manual'` 并拒绝 3xx，运行时测试会检查令牌没有转发到重定向目标。具体配置与边界见 [Worker 说明](../worker/README.md)。

## 样式与浏览器检查

`App.css` 只保留有序导入，首页、背词、资源、AI、登录与最后的窄屏覆盖分别在 `src/styles/`。`PageNav` 统一背词、资源、答疑页的导航；`PageControls` 统一首页和书架的页码与翻页按钮。它们不负责路由或页序，由页面传入回调和禁用状态。

共用颜色、动效、导航、文字按钮和提示文字放在 `shared-controls.css`；各页面的特殊间距和状态仍在对应文件。改背词规则不再需要维护资源页的导航样式。`editorial-base.css` 只保留通用布局、每日一句、状态提示、404 和全局窄屏规则，账号表单归 `auth.css`；旧管理台、钱包和旧版页面的无引用样式已删除。CSS 全局层叠仍在，改共享规则仍要检查受影响页面。

`scripts/browser-check.mjs` 用真实 Chromium 和临时生产构建验证公开页面、登录后的背词与答疑页面，以及下载故障恢复。账号、历史和清空操作由 `browser-account-fixture.mjs` 在本机模拟；外部请求全部拦截，不验证生产认证、数据库或外部模型。
