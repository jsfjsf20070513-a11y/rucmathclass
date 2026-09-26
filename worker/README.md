# 班级站 AI Worker

这是独立于静态前端的 Cloudflare Worker。入口是 [src/index.js](src/index.js)，聊天在 [src/chat.js](src/chat.js)，CORS 和 JSON 响应在 [src/http.js](src/http.js)。它把请求交给 Gemini，不保存聊天记录；个人历史由前端写入 Supabase。

## 接口

| 请求 | 输入 | 返回 |
| --- | --- | --- |
| `POST /api/chat` | `{ messages: [{ role, content, image? }] }`，图片为 `{ mimeType, data }` | 成功是 `{ text, model }`；失败有 `error` |
| `GET /api/speak?text=...` | 要朗读的文字，最多取 160 个字符 | `audio/wav`，失败返回 JSON |
| `OPTIONS` | 跨域预检 | 204 和 CORS 响应头 |

聊天只保留最后 20 条消息。当前用户消息超过 4000 字会被拒绝；旧上下文会截短。图片只接受 JPEG、PNG、WebP，单轮累计 base64 长度不能超过 7,000,000；旧客户端的顶层 `image` 也兼容。

聊天按代码中的排序选择模型：先并发请求前三个，全部失败后再试后三个。模型清单缓存一小时，查询失败时用静态候选列表。这不保证候选模型在服务商处仍然存在或有配额。

语音使用配置的模型与声音，缓存键包含文字、模型和声音。缓存可能未命中或被清除，不保证只生成一次。前端 [useVocabularyAudio](../src/hooks/useVocabularyAudio.js) 的 `USE_WORKER_VOICE` 当前为 `false`，默认使用浏览器朗读。

## 配置

[wrangler.toml](wrangler.toml) 声明 Worker 名称 `mathclass-ai`，绑定班级站的 chat、speak 路由；`workers_dev` 为关闭。它没有 Raccord 路由。

- `GEMINI_API_KEY` 是 Worker secret，不能放进前端或提交到仓库。
- `TTS_VOICE` 默认 `Kore`，`TTS_MODEL` 可覆盖语音模型。
- `RATE_LIMITER` 配置为每 IP 每 60 秒 30 次；绑定缺失或调用失败时，代码会继续处理。

CORS 允许班级站两个域名和 `http://localhost:5173`。这不是登录校验：Worker 没有验证 Supabase token，当前聊天前端也没有向它发送认证头。接口本身不能被描述为“登录后才有权限调用”。

## 调试与验证

从仓库根目录运行：

```bash
npm test -- worker/src/chat.test.js
npx wrangler dev --config worker/wrangler.toml
```

第二条启动 Worker 开发服务；需要上游模型时仍会产生外部请求。前端可用 `VITE_AI_ENDPOINT` 指向本地服务。不要为了绕过 CORS 放开所有生产来源，应使用代码允许的本地地址或明确配置模拟服务。

当前单测覆盖聊天请求的一部分；没有覆盖语音、入口路由、限流和实际 Cloudflare 缓存，`npm run lint` 也尚未检查 Worker。仓库测试通过不等于线上模型或路由正常。

部署需要用户明确授权，并单独确认目标配置。前端 `deploy.sh` 不会发布这个 Worker。
