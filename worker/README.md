# 班级站 AI Worker

这是单独发布的 Cloudflare 服务。它提供答疑、语音和每日法语阅读。前端发布命令不会发布它。

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

`GEMINI_API_KEY`、`SUPABASE_URL`、`SUPABASE_ANON_KEY` 分别配置为 Worker 的私密变量。不要提交到仓库，也不要把模型密钥放进前端。认证项目应与班级站前端一致；anon key 是供网页使用的公开项目密钥。不能用拥有管理权限的 service-role key 或用户令牌代替它。前端的 `VITE_` 配置不会自动传给 Worker。

本地配置放在 `worker/.dev.vars`。从仓库根目录运行 `npm test -- worker/src`、`npm run lint`、`npm run worker:check`；最后一条只打包，不发布。`npx wrangler dev --config worker/wrangler.toml` 启动开发服务，仍可能请求真实模型。

生产变更需要明确授权。认证协议有变化时，一起准备前端和 Worker，并核对真实账号流程。检查未通过时保留现场，不通过关闭认证来恢复访问。

最近的生产版本和已验事项见 [发布记录](../docs/development.md#最近一次发布核验)。真实认证、模型可用性、Cloudflare 缓存和连接中断仍需线上验证。本仓不用于判断或发布 Raccord。

## 每日法语阅读

`GET /api/lecture` 按日期升序返回日期、难度和标题。`GET /api/lecture/YYYY-MM-DD` 返回当日全文。两条路由都允许匿名读取。每天以北京时间零点为界。未来日期、无效日期和未发布的文章返回 404。

每 15 分钟运行一次 cron。Worker 提前一天为次日提交一个后台 Responses 请求；当天若还没有文章（刚上线或前一天没写成），也补交一篇。Astra 最多尝试三次，随后 Sol 最多尝试两次。两者都使用 high 推理强度和 8 小时窗口。Standard 档的合格请求按标准 token 价格的 60% 计费。窗口是完成时间目标。轮询会沿用 response id，也会继续处理跨过午夜的任务。[OpenAI 后台模式](https://developers.openai.com/api/docs/guides/background)

`LECTURE` 保存以下记录。

| 键 | 内容 |
| --- | --- |
| `day:日期` | 通过检查的文章。KV metadata 同时保存索引项，一次写入就能发布两者。 |
| `pending:日期` | 进行中的 response id 和本轮此前的失败原因。 |
| `pending:日期:submission` | 发请求前记录本次尝试的序号。提交后丢失回执时仍计入重试上限。 |
| `result:日期` | 发生过重试或最终放弃的日期、结果和问题清单。 |

公开路由只接受从首篇到今天的日期。查询参数共用同一份边缘缓存。全文可缓存一天，索引最多五分钟，到北京时间零点即过期。阅读请求不会提交生成任务，也不占用聊天和语音的 IP 配额。KV 是最终一致的，新文章在各地出现的时间可能稍有差异。

### 首次启用

以下命令均从仓库根目录执行。生产操作由有权限的维护者在获准后执行。

1. 在已核对的班级站 Supabase 项目创建答案表。将 `CLASS_DATABASE_URL` 设为已核对的班级站数据库连接串。运行 `psql "${CLASS_DATABASE_URL:?请先设置班级站数据库连接串}" -v ON_ERROR_STOP=1 -f sql/schema/setup_lecture_answers.sql`。
2. 运行 `npx wrangler kv namespace create LECTURE --config worker/wrangler.toml`。把返回的 id 填入 `worker/wrangler.toml` 的 `LECTURE` 绑定，并保存这项配置。
3. 运行 `npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml`，在交互提示中输入密钥。原有聊天和语音继续使用各自的配置。
4. 运行 `node scripts/seed-lecture.mjs --remote` 写入 11 月 18 至 20 日三篇样稿、`scripts/lecture-seed/` 里已审过的生成稿（目前是 11 月 21 日）及其索引。验证本地 KV 时使用 `--local`。`npm run demo` 直接读取样稿。
5. 获准发布 Worker 后运行 `npx wrangler deploy --config worker/wrangler.toml`。部署后的首次 cron 会为北京时间明天创建任务。用 `npx wrangler tail --config worker/wrangler.toml` 观察触发情况。
6. 用 `curl -fsS https://rucmathclass.com/api/lecture` 核对公开索引，再用 `curl -fsS https://rucmathclass.com/api/lecture/2026-11-20` 核对种子正文。前端按[项目发布手册](../docs/development.md#发布前的本地检查)单独发布。

### 手动触发第一次生成

离线验证运行 `npm test -- worker/src/lecture.test.js`。测试以假 fetch 触发同一个 scheduled 入口。

维护者要在开发机手动触发时，可在配置好开发用模型密钥后运行以下命令。第一个终端保持运行，第二个终端执行 curl。第一次提交，隔几分钟再次调用即可查询同一个任务。这个地址由本仓固定版本的 Wrangler 在开发时提供。

```bash
npx wrangler dev --local --test-scheduled --config worker/wrangler.toml --port 8787
```

```bash
curl -fsS 'http://127.0.0.1:8787/__scheduled'
```

以上手动触发使用本地 KV。若首次启用时需要手动提交到生产 KV，可在第 4 步之后、部署 cron 之前，用临时配置显式选中远端绑定。此操作会写入远端 KV，并按真实模型用量计费。开发机需有该项目的 Cloudflare 权限和开发会话可用的 OpenAI 密钥。保持原终端目录，在另一终端照上面的方法调用一次 curl。停止开发服务后再执行第 5 步，线上 cron 会接着轮询。KV 的写入需要时间传播，手动首发和生产 cron 应错开。

```bash
awk '{print} /^binding = "LECTURE"$/ {print "remote = true"}' worker/wrangler.toml > worker/.lecture-first-run.toml
npx wrangler dev --test-scheduled --config worker/.lecture-first-run.toml --port 8787
rm worker/.lecture-first-run.toml
```
