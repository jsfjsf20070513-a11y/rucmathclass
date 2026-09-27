# 班级站 AI Worker

这是独立于静态前端的 Cloudflare Worker。入口是 [src/index.js](src/index.js)，登录和限流检查在 [src/requestAccess.js](src/requestAccess.js)，聊天在 [src/chat.js](src/chat.js)，语音在 [src/tts.js](src/tts.js)，CORS 和 JSON 响应在 [src/http.js](src/http.js)。它把请求交给 Gemini，不保存聊天记录；个人历史由前端写入 Supabase。

## 接口

| 请求 | 输入 | 返回 |
| --- | --- | --- |
| `POST /api/chat` | `{ messages: [{ role, content, image? }] }`，图片为 `{ mimeType, data }` | 成功是 `{ text, model }`；失败有 `error` |
| `GET /api/speak?text=...` | 要朗读的文字，最多取 160 个字符 | `audio/wav`，失败返回 JSON |
| 两个接口的 `OPTIONS` | 跨域预检 | 204 和 CORS 响应头 |

其他路径返回 404，错误方法返回 405，均不消耗限流计数或请求模型。

聊天和语音都要求 `Authorization: Bearer <当前账号的访问令牌>`，预检除外。Worker 先按 IP 限流，再向配置的 Supabase `/auth/v1/user` 验证身份；不会把问题或图片交给认证接口，也不会把用户令牌交给模型。未登录或令牌失效返回 401，超过限额返回 429，配置缺失、限流出错或认证服务失败返回 503。限流与认证合计最多等五秒，包含认证响应正文；失败后不调用模型、不读取语音缓存。这里验证的是同一个 Supabase 项目中的账号，不是班级成员资格，也没有拆分两站账号。

聊天请求正文最多 8 MiB，按实际流量累计，不能只靠 Content-Length 绕过；读取最多等待 10 秒。聊天只保留最后 20 条消息。当前用户消息超过 4000 字会被拒绝；旧上下文会截短。图片只接受 JPEG、PNG、WebP，单轮累计 base64 长度不能超过 7,000,000；旧客户端的顶层 `image` 也兼容。

聊天按代码中的排序选择模型：先并发请求前三个，全部失败后再试后三个。模型清单缓存一小时，查询失败时用静态候选列表。模型查询限时 3 秒，两组回答分别限时 18 秒和 15 秒，时间包含响应正文读取；请求 signal 取消时停止上游且不再启动下一组。`requestScope` 统一管理超时与清理。这不保证候选模型在服务商处仍然存在或有配额。

语音使用配置的模型与声音，缓存键包含文字、模型和声音。Worker 内部缓存只存音频，每次命中前仍会检查身份；返回时按当前来源附加 CORS，并用 `private, no-store` 禁止浏览器或中间代理缓存这份认证响应。缓存读写失败不会使已生成的音频报错。身份校验后的语音处理最多 20 秒，空结果和 5xx 最多尝试两次，4xx 不重试；只有有效的单声道 16 位 PCM 才包装成 WAV。缓存可能未命中或被清除，不保证只生成一次。前端 [useVocabularyAudio](../src/hooks/useVocabularyAudio.js) 使用浏览器朗读，不调用这个接口。

## 配置

[wrangler.toml](wrangler.toml) 声明 Worker 名称 `mathclass-ai`，绑定班级站的 chat、speak 路由；`workers_dev` 为关闭。它没有 Raccord 路由。

- `GEMINI_API_KEY` 是 Worker secret，不能放进前端或提交到仓库。
- `SUPABASE_URL`、`SUPABASE_ANON_KEY` 也作为 Worker secret 配置，分别使用与前端相同的 Supabase 项目地址和公开客户端 key。地址必须是 HTTPS 根地址，不能带路径、账号、查询参数。不要使用 `service_role` 或用户访问令牌替代公开 key。这两项不会从前端 `VITE_` 环境变量自动传入。
- `TTS_VOICE` 默认 `Kore`，`TTS_MODEL` 可覆盖语音模型。
- `RATE_LIMITER` 配置为每 IP 每 60 秒 30 次；绑定缺失或调用失败返回 503。

CORS 允许班级站两个域名和 `http://localhost:5173`，预检允许 Content-Type 和 Authorization。CORS 与服务端身份校验是两件事。前端从当前对话账号取得令牌，切换账号或取消请求后不会继续发送旧问题。

2026-09-27 的 Cloudflare API 核验确认：实际路由只有班级站 `/api/chat`、`/api/speak*`，没有 Raccord 路由。生产仍在运行 2026-08-20 发布的版本 `4ff0f625-91e4-41cd-af26-1afc40e6026e`，没有上述登录校验，也没有两个 Supabase 配置。Raccord 仓库的同名 Worker 配置仍有覆盖风险，不能从那边发布本服务。

## 调试与验证

从仓库根目录运行：

```bash
npm test -- worker/src
npm run lint
npm run worker:check  # 仅打包，不发布
npx wrangler dev --config worker/wrangler.toml
```

最后一条启动 Worker 开发服务；需要上游模型时仍会产生外部请求。前端可用 `VITE_AI_ENDPOINT` 指向本地服务。不要为了绕过 CORS 放开所有生产来源，应使用代码允许的本地地址或明确配置模拟服务。

本地 Worker 配置可放在 `worker/.dev.vars`；这类文件已忽略，不提交 key。单测覆盖聊天契约、取消、流式输入限制、令牌失效、认证超时、限流故障、语音格式和跨来源缓存；包括缓存命中仍需认证。认证、缓存和模型都是模拟接口；lint 包含 Worker。真实认证、Cloudflare 缓存、连接断开信号和模型可用性仍需发布时核验，仓库检查通过不等于生产正常。

部署需要用户明确授权，并单独确认目标配置。前端 `deploy.sh` 不会发布这个 Worker。此次发布要一起准备前端和 Worker：先核对并配置两个 Supabase secret，再发布携带令牌的前端与要求认证的 Worker，并验证当前账号流程。旧前端不带令牌，新 Worker 会拒绝它；旧 Worker 的跨域预检也不允许认证头，因此不要将二者长期分开发布，已打开的旧页面需要刷新。核验未通过时保留现场排查，不通过关闭认证来恢复访问。
