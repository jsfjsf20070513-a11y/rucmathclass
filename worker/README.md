# 班级站 AI Worker

这是单独发布的 Cloudflare 服务。它提供答疑、语音、每日法语阅读、今日定理和 Parole。前端发布命令不会发布它。

| 要找什么 | 入口 |
| --- | --- |
| 路径、方法与访问校验 | [index.js](src/index.js)、[requestAccess.js](src/requestAccess.js) |
| 聊天和模型选择 | [chat.js](src/chat.js) |
| 语音与音频缓存 | [tts.js](src/tts.js) |
| 阅读生成、提示词与公开查询 | [定时任务](src/lectureGeneration.js)、[出题要求](src/lecturePrompt.js)、[读取接口](src/lectureRoute.js) |
| 超时、取消与正文大小 | [requestScope.js](src/requestScope.js)、[requestBody.js](src/requestBody.js) |
| 跨域请求与返回格式 | [http.js](src/http.js) |
| 名称、路由与限流设置 | [wrangler.toml](wrangler.toml) |

## 不能丢的保护

聊天和语音都要求当前账号的访问令牌。每次请求先验证身份，再调用模型或读取缓存。跨域限制只决定网页能否读取响应，不能代替服务端身份校验。这里验证账号有效，不额外确认班级成员资格。

不要把认证请求改成 `redirect: 'error'`。Cloudflare 的运行引擎不支持它，会在发出请求前报错；Node 中的假接口发现不了这个差异。现用 `manual` 拒绝跳转，避免令牌被带到另一个地址。[运行时测试](src/runtime.test.js) 会直接检查这件事。

语音的内部缓存只存音频，每次读取仍要验证身份。发给浏览器的音频不允许缓存，避免下一位使用者拿到前一位的结果。

模型清单查询失败时会使用代码中的候选名称。这不能保证模型仍存在或有额度，不应向用户承诺“免费”或“始终可用”。

## 配置与验证

| 线上私密变量 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | 答疑和语音合成。 |
| `OPENAI_API_KEY` | 助手主模型和每日阅读缺稿时的模型调用。 |
| `SUPABASE_URL` | 班级站用于验证账号的 Supabase 项目地址。 |
| `SUPABASE_ANON_KEY` | 验证账号时使用的公开项目密钥。 |

模型密钥只配置在 Worker。认证项目应与班级站前端一致。anon key 不能用拥有管理权限的 service-role key 或用户令牌代替。前端的 `VITE_` 配置不会自动传给 Worker。

本地配置放在 `worker/.dev.vars`。从仓库根目录运行 `npm test -- worker/src`、`npm run lint`、`npm run worker:check`；最后一条只打包，不发布。`npx wrangler dev --config worker/wrangler.toml` 启动开发服务，仍可能请求真实模型。

生产变更需要明确授权。认证协议有变化时，一起准备前端和 Worker，并核对真实账号流程。检查未通过时保留现场，不通过关闭认证来恢复访问。

最近的生产版本和已验事项见 [发布记录](../docs/development.md#最近一次发布核验)。真实认证、模型可用性、Cloudflare 缓存和连接中断仍需线上验证。本仓不用于判断或发布 Raccord。

## 今日定理和 Parole

作者于 2026-11-22 确认按月写稿。`GET /api/daily/YYYY-MM-DD` 允许匿名读取，返回 `{ date, theorem, parole }`。定理包含标题、条件与结论、纯文本公式、讲解，以及预先生成的 `displayHtml`。Parole 包含原文、译文、作者和可选出处。按北京时间零点换日，无效日期和未来日期返回 404。

路由和答疑工具都可调用 `getDailyContent(env, date)`。省略日期可读今天，日期无效或尚未到来时返回 `null`。函数读取现有 `LECTURE` 中的 `daily:YYYY-MM-DD`。缺稿或 KV 暂时不可用时，返回该日期的静态稿。[读取函数](src/dailyStore.js) · [写稿与写入命令](../docs/development.md#定理和-parole-每月写稿)

## 每日法语阅读

`GET /api/lecture` 按日期升序返回日期、难度和标题。`GET /api/lecture/YYYY-MM-DD` 返回当日全文。两条路由都允许匿名读取。每天以北京时间零点为界。未来日期、无效日期和未发布的文章返回 404。

cron 每 15 分钟检查北京时间当天和次日的文章。某天在 KV 中缺稿时，Worker 才提交这一天的后台生成请求。11 月 21 日上线的 PR #60 先尝试 Astra。PR #63 将顺序改为先用 Sol（最多三次），再用 Astra（最多两次）。两个模型都使用 high 推理强度和 8 小时窗口。Standard 档的合格请求按标准 token 价格的 60% 计费。窗口是完成时间目标。轮询沿用同一个 response id。跨过午夜的任务会继续处理。[OpenAI 后台模式](https://developers.openai.com/api/docs/guides/background)

`LECTURE` 保存以下记录。

| 键 | 内容 |
| --- | --- |
| `day:日期` | 通过检查的文章。KV metadata 同时保存索引项，一次写入就能发布两者。 |
| `pending:日期` | 进行中的 response id 和本轮此前的失败原因。 |
| `pending:日期:submission` | 发请求前记录本次尝试的序号。提交后丢失回执时仍计入重试上限。 |
| `result:日期` | 发生过重试或最终放弃的日期、结果和问题清单。 |

公开路由只接受从首篇到今天的日期。查询参数共用同一份边缘缓存。全文可缓存一天，索引最多五分钟，到北京时间零点即过期。阅读请求不会提交生成任务，也不占用聊天和语音的 IP 配额。KV 是最终一致的，新文章在各地出现的时间可能稍有差异。

### 2026-11-21 启用记录

班级站已创建 `lecture_answers` 表。该表的行级安全策略（RLS）已核对。KV 命名空间 `LECTURE` 已创建，绑定 ID 见 [wrangler.toml](wrangler.toml)。11 月 18 日至 21 日的四篇种子稿及其索引信息已写入 KV。发布版本见[上线记录](../docs/development.md#最近一次发布核验)。

线上 cron 首次生成并写入 KV 的文章日期为 2026-11-22。

### 写入新一批文章

按[每月写稿](../docs/development.md#每月写稿)完成交叉审稿、改稿和人工核对。在仓库根目录将 `batch` 设为含 `plan.json` 和 `days/` 的批次目录。取得作者对该批次的明确授权后，运行 `node scripts/seed-lecture.mjs --remote --batch "$batch"`。脚本将每篇正文和对应的索引信息写入同一个 `day:日期` 键。本地 KV 使用 `--local`。

### 在本机验证 cron

离线验证运行 `npm test -- worker/src/lecture.test.js`。测试用假接口触发 scheduled 入口。

要在本机调用真实模型，先配置开发用密钥。在一个终端启动以下服务。

```bash
npx wrangler dev --local --test-scheduled --config worker/wrangler.toml --port 8787
```

在另一终端触发定时任务。首次调用提交缺稿日期的任务。几分钟后再次调用可查询结果。文章写入本地 KV。

```bash
curl -fsS 'http://127.0.0.1:8787/__scheduled'
```

## 助手如何取资料

聊天入口先向 Supabase 验证用户身份。Sol 通过 Responses API 按需查询站内资料。每日定理和 Parole 共用 `dailySiteItem` 这个读取入口。现有首页随机展示 Parole，工具按日期从同一份句库取一句。任务 B 接入月稿时替换此入口。

阅读工具从 `LECTURE` 读取已发布的索引和全文。书目工具使用网站静态目录。个人作答和历史对话通过 PostgREST 查询，每次只传来访者的 JWT 和项目 anon key。查询固定带上已验证的用户 ID，数据库按三张表各自的 RLS 策略检查归属。

支持流式的客户端发送 `Accept: application/x-ndjson`。每行是一条文字增量、清除临时文字、完整回答或错误。客户端收到完整回答后才保存。旧客户端仍收到 JSON。Sol 未能完成回答时，Worker 清掉半截回复，再尝试 Gemini。

班级助手默认使用 `gpt-6.2-sol`。所有账号共用每月 55 美元的 Sol 预算。按北京时间计算，每人每天最多联网 10 次。当天次数用完后，Sol 仍可查站内资料。月余额不足、KV 记账失败或 OpenAI 出错时，助手改用 Gemini 回答，关闭联网搜索。

每次请求 Sol 前，Worker 在现有 `LECTURE` KV 中写入 `usage:月份:请求编号:reserve`，预留输入、输出和可能发生的一次搜索费用。取得用量后写入同一请求的 `:settle`，按输入和输出的 token 数及实际搜索次数估算费用。如果无法取得用量，这次请求仍按预留金额和预留的搜索次数计入额度。KV 的跨地区同步有延迟，并发请求可能让用量略超限。费率见 [Sol 定价](https://developers.openai.com/api/docs/models/gpt-6.2-sol)与[联网计费](https://developers.openai.com/api/docs/pricing)。
