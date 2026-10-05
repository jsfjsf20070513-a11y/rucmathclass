# 代码怎么分工

先从 [App.jsx](../src/App.jsx) 找页面，再沿下面的入口找实现。不要根据归档稿恢复已经下线的功能。

| 要改什么 | 从哪里看 |
| --- | --- |
| 登录与密码重置 | [AuthContext](../src/context/AuthContext.jsx)、[authSession](../src/lib/authSession.js)、[authBackend](../src/lib/authBackend.js)、[usePasswordReset](../src/hooks/usePasswordReset.js) |
| 背词与保存 | [vocabularyTrainer](../src/lib/vocabularyTrainer.js)、[useVocabularyTrainer](../src/hooks/useVocabularyTrainer.js)、[vocabularyBackend](../src/lib/vocabularyBackend.js) |
| 复习间隔与题型 | [srsScheduler](../src/lib/srsScheduler.js)、[exerciseGenerator](../src/lib/exerciseGenerator.js) |
| 答疑与历史 | [assistantConversation](../src/lib/assistantConversation.js)、[assistantClient](../src/lib/assistantClient.js)、[aiAssistantBackend](../src/lib/aiAssistantBackend.js) |
| 书架 | [useResourceCatalog](../src/hooks/useResourceCatalog.js)、[resourceBackend](../src/lib/resourceBackend.js) |
| 首页与翻页 | [Home](../src/pages/Home.jsx)、[usePageFlip](../src/hooks/usePageFlip.js)、[useHomeWeather](../src/hooks/useHomeWeather.js) |
| 页面下载与失败恢复 | [pageLoaders](../src/routes/pageLoaders.js)、[PageBoundary](../src/components/PageBoundary.jsx)、[boot-start.js](../public/boot-start.js) |
| 服务端答疑和语音 | [Worker 说明](../worker/README.md) |

## 必须保留的行为

页面、组件和 hook 通过 backend 调用服务。`lib`、`data` 不反过来依赖界面。这让保存和请求顺序可以脱离 React 单独验证。实际限制见 [.eslintrc.cjs](../.eslintrc.cjs)。

每个账号各用一个背词或对话控制器。切换账号、退出或卸载后，旧请求不能改新页面的状态。初始化查询和登录事件可能先后返回，不能认定先发的请求就会先返回。

背词先保存“等待确认”的本机记录，再写入云端。云端写入和本机进度都确认后，才计分并允许下一题。失败重试必须复用同一次答案，不能算作又答了一遍。最后一题也遵守这个顺序。

`review_states.word_id` 对应词条 ID。整理词库不能改变这个对应关系。`streak_count` 表示单词连续答对次数，随每次作答保存；它不表示连续学习天数。每词一条最新进度也不能还原每天的学习历史。

本机保存的练习记录用于恢复未完成的一轮，不承担跨设备同步。普通练习记录按上海日期过期，等待云端确认的记录必须保留到核对结束。另一台设备可能已经更新进度，所以写入时要比较原来的 `updated_at`。

AI 收到回答与历史保存成功是两件事。图片只留在当前页面，历史中的文字会注明曾附图。Worker 不保存对话，个人历史由前端写入 Supabase。

启动恢复脚本保持普通脚本形式。这样模块入口下载失败时，它仍能显示重载按钮。构建按脚本内容生成文件名，防止缓存把新页面配上旧脚本。

## 数据和同机服务

页面读写的表是 `review_states`、`ai_messages`、`resources`，登录由 Supabase Auth 处理。旧推荐、相册和 Web3 地址只是跳转。旧 SQL 和旧数据仍在，不代表产品入口应恢复。

2026-09-27 已获授权收紧四张表的浏览器角色权限。个人进度和对话均开启行级安全检查（RLS），即数据库按登录账号判断可以读写哪些行。`resources` 允许公开读取，原管理员操作仍检查角色；`profiles` 只允许读自己的资料。只检查状态、不读取记录内容的匿名请求中，书架返回 200，三张个人表返回 401。没有用两个真实账号验证完整写入流程。

同次核查发现，新表默认可能得到过多授权。现有表的修正不能保护以后新建的表；新增或重建表时必须明确授权。当前定义和只读核查入口见 [开发说明](development.md#数据库文件)。旧 SQL 不能按顺序整段重跑。

Raccord 是另一个仓库。本仓不能作为它的数据库、发布目录或线上配置依据。服务器还承载青协网站和代理出口；班级站发布只能操作自己的固定目录。线上版本与备份位置只在 [发布记录](development.md#最近一次发布核验) 保留一份。
