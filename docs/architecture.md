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
| 首页和翻页 | [Home](../src/pages/Home.jsx)、[usePageFlip](../src/hooks/usePageFlip.js) | 通用翻页已独立；天气、账号变化和登录展开动画仍在首页 |

`.eslintrc.cjs` 阻止页面、组件直接导入 Supabase，也阻止 `lib`、`data` 反向依赖 React 或界面模块。它检查静态 import/export，不检查动态 import()、所有网络请求和状态顺序。`AuthContext` 连接认证客户端，`useResourceCatalog` 仍直接创建实时订阅，这些是当前的实际边界。

## 账号与写入结果

[authSession](../src/lib/authSession.js) 同时接收初始化查询和登录事件。新事件优先，旧初始化响应不能把账号改回去；退出结果也按账号和生命周期隔离。公开页面不会等待认证初始化才挂载。

[authTransport](../src/lib/authTransport.js) 把认证请求的响应正文也纳入超时。Login 和资源推荐表单按账号重新挂载，旧账号的表单结果不会出现在新账号页面。

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

[assistantClient](../src/lib/assistantClient.js) 发送最近的对话给 Worker；[aiAssistantBackend](../src/lib/aiAssistantBackend.js) 将一问一答一起写入 `ai_messages`，读取最近的文字历史。图片只留在当前页面，历史文字会注明曾有附图。收到回答和保存成功是两件事，保存不明时页面会明确提示。

## 数据表与资源推荐

当前页面实际使用的表是：`review_states`（个人进度）、`ai_messages`（个人对话）、`resources`（公开增补书目）、`comments`（资源推荐队列）。认证使用 Supabase Auth，不是自建登录表。

`ResourceCurate` 把推荐编码后写入 `comments`，其中 `album_id = 0` 是队列标记，不表示当前还有相册页面。读取列不包括邮箱。旧 `opsQueue` 审核函数还会查询 `profiles` 并调用 `contentBackend` 写相册或资源，但目前没有页面调用这些审核函数。

**因此资源推荐只完成了入队，站内审核流程没有闭合。** 不要根据函数名或提交成功文案说它能自动发布。

SQL 中有 RLS 和列授权定义，但文件存在不等于线上已执行。改数据权限之前必须查询目标数据库的实际策略，不能从文档或客户端表现倒推安全性。

## 与 Raccord 的边界

本仓运行代码没有导入 Raccord 目录，没有作品站页面。相册、协作台、Web3 等旧路径在 `App.jsx` 中只是重定向；公开资源读取也已脱离相册表。

`worker/wrangler.toml` 的路由只写了 `rucmathclass.com`，CORS 列表只有班级站域名和本地开发地址。不能把它描述成已经配置好的两站共享服务，也不能据此判断另一仓怎么调用它。

代码仍留下旧审核函数、相册 SQL 和无页面使用的旧样式。Supabase 地址由环境变量决定，部署目录也能被环境变量覆盖，所以**代码入口独立不等于生产数据库与发布权限已经隔离**。本次没有核验另一仓和生产配置。
