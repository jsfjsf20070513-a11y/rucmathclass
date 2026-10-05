# 班级站 AI Worker

这是单独发布的 Cloudflare 服务。它把答疑和语音请求交给模型，不保存对话。前端发布命令不会发布它。

| 要找什么 | 入口 |
| --- | --- |
| 路径、方法与访问校验 | [index.js](src/index.js)、[requestAccess.js](src/requestAccess.js) |
| 聊天和模型选择 | [chat.js](src/chat.js) |
| 语音与音频缓存 | [tts.js](src/tts.js) |
| 超时、取消与正文大小 | [requestScope.js](src/requestScope.js)、[requestBody.js](src/requestBody.js) |
| 跨域请求与返回格式 | [http.js](src/http.js) |
| 名称、路由与限流设置 | [wrangler.toml](wrangler.toml) |

## 不能丢的保护

聊天和语音都要求当前账号的访问令牌。每次请求先验证身份，再调用模型或读取缓存。跨域限制只决定网页能否读取响应，不能代替服务端身份校验。这里验证账号有效，不额外确认班级成员资格。

不要把认证请求改成 `redirect: 'error'`。Cloudflare 的运行引擎不支持它，会在发出请求前报错；Node 中的假接口发现不了这个差异。现用 `manual` 拒绝跳转，避免令牌被带到另一个地址。[运行时测试](src/runtime.test.js) 会直接检查这件事。

语音的内部缓存只存音频，每次读取仍要验证身份。发给浏览器的音频不允许缓存，避免下一位使用者拿到前一位的结果。背词页面使用浏览器朗读，不经过此接口。

模型清单查询失败时会使用代码中的候选名称。这不能保证模型仍存在或有额度，不应向用户承诺“免费”或“始终可用”。

## 配置与验证

`GEMINI_API_KEY`、`SUPABASE_URL`、`SUPABASE_ANON_KEY` 分别配置为 Worker 的私密变量。不要提交到仓库，也不要把模型密钥放进前端。认证项目应与班级站前端一致；anon key 是供网页使用的公开项目密钥。不能用拥有管理权限的 service-role key 或用户令牌代替它。前端的 `VITE_` 配置不会自动传给 Worker。

本地配置放在 `worker/.dev.vars`。从仓库根目录运行 `npm test -- worker/src`、`npm run lint`、`npm run worker:check`；最后一条只打包，不发布。`npx wrangler dev --config worker/wrangler.toml` 启动开发服务，仍可能请求真实模型。

生产变更需要明确授权。认证协议有变化时，一起准备前端和 Worker，并核对真实账号流程。检查未通过时保留现场，不通过关闭认证来恢复访问。

最近的生产版本和已验事项见 [发布记录](../docs/development.md#最近一次发布核验)。真实认证、模型可用性、Cloudflare 缓存和连接中断仍需线上验证。本仓不用于判断或发布 Raccord。
