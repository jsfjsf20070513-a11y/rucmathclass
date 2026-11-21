# 代码怎么分工

先从 [App.jsx](../src/App.jsx) 找页面，再沿下面的入口找实现。不要根据归档稿恢复已经下线的功能。

| 要改什么 | 从哪里看 |
| --- | --- |
| 登录与密码重置 | [AuthContext](../src/context/AuthContext.jsx)、[authSession](../src/lib/authSession.js)、[authBackend](../src/lib/authBackend.js)、[usePasswordReset](../src/hooks/usePasswordReset.js) |
| 每日文章与档案 | [Lecture](../src/pages/Lecture.jsx)、[useLectureLibrary](../src/hooks/useLectureLibrary.js)、[Worker](../worker/README.md) |
| 阅读作答与同步 | [lectureAnswers](../src/lib/lectureAnswers.js)、[本机记录](../src/lib/lectureAnswerStorage.js)、[云端保存](../src/lib/lectureAnswersBackend.js) |
| 答疑与历史 | [assistantArchive](../src/lib/assistantArchive.js)、[assistantConversation](../src/lib/assistantConversation.js)、[assistantClient](../src/lib/assistantClient.js)、[aiAssistantBackend](../src/lib/aiAssistantBackend.js) |
| 书架 | [useResourceCatalog](../src/hooks/useResourceCatalog.js)、[resourceBackend](../src/lib/resourceBackend.js) |
| 首页与翻页 | [Home](../src/pages/Home.jsx)、[usePageFlip](../src/hooks/usePageFlip.js)、[useHomeWeather](../src/hooks/useHomeWeather.js) |
| 页面下载与失败恢复 | [pageLoaders](../src/routes/pageLoaders.js)、[PageBoundary](../src/components/PageBoundary.jsx)、[boot-start.js](../public/boot-start.js) |
| 服务端答疑和语音 | [Worker 说明](../worker/README.md) |

## 必须保留的行为

页面、组件和 hook 通过 backend 调用服务。`lib`、`data` 不反过来依赖界面。这让保存和请求顺序可以脱离 React 单独验证。实际限制见 [.eslintrc.cjs](../.eslintrc.cjs)。

阅读档案从 Worker 取得索引。档案空闲时预取最新三篇正文，手指按下某一篇时就开始取这一篇；打开后再补取左右两篇。从档案点进来时，正文到了才让文章页从下往上抽出，最多等 1.5 秒。文章经检查后写入 KV，索引信息与正文一起保存。

每个账号各用一个作答控制器和一份对话目录。每段对话单独管理请求和保存状态。切换账号后，旧请求只能结束自己的工作。登录事件优先于延迟返回的初始化查询。

游客答案保存在浏览器里。登录时，本机游客答案一次归入该账号。每题按作答时间合并。旧版记录没有时间，只补空缺。云端按天存一行，写入时检查先前读到的版本。另一个设备已修改时，重新读取后再合并。

选项在云端确认后才显示为选中。如果请求失败，浏览器成功写入本机也可确认。登录或恢复联网时，会补传所有待同步答案。重开一篇文章时，只同步这一天的作答。

旧背词实现和原始词库见[背词归档](archive/vocabulary/)。既有词条 ID 仍与 `review_states.word_id` 对应。

AI 收到回答与历史保存成功是两件事。图片只留在当前页面，历史中的文字会注明曾附图。Worker 不保存对话，个人历史由前端写入 Supabase。首轮提问和回答与新对话在同一事务内保存。新表缺失时，前端沿用旧表中的单段历史。

启动恢复脚本保持普通脚本形式。这样模块入口下载失败时，它仍能显示重载按钮。构建按脚本内容生成文件名，防止缓存把新页面配上旧脚本。

## 数据和同机服务

当前代码使用 `lecture_answers`、`ai_conversations`、`ai_messages`、`resources`，登录由 Supabase Auth 处理。旧推荐、相册和 Web3 地址只是跳转。旧 SQL 和旧数据仍在，不代表产品入口应恢复。

2026-09-27 已获授权收紧四张表的浏览器角色权限。个人进度和对话均开启行级安全检查（RLS），即数据库按登录账号判断可以读写哪些行。`resources` 允许公开读取，原管理员操作仍检查角色；`profiles` 只允许读自己的资料。只检查状态、不读取记录内容的匿名请求中，书架返回 200，三张个人表返回 401。没有用两个真实账号验证完整写入流程。

同次核查发现，新表默认可能得到过多授权。现有表的修正不能保护以后新建的表；新增或重建表时必须明确授权。当前定义和只读核查入口见 [开发说明](development.md#数据库文件)。旧 SQL 不能按顺序整段重跑。

Raccord 是另一个仓库。本仓不能作为它的数据库、发布目录或线上配置依据。服务器还承载青协网站和代理出口；班级站发布只能操作自己的固定目录。线上版本与备份位置只在 [发布记录](development.md#最近一次发布核验) 保留一份。
