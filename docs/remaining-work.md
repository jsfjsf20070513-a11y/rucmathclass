# 还没解决的问题

这里只保留已确认而尚未修复、发布或验证的事项。完成后删除对应条目。已验结果见 [发布与核验记录](development.md#最近一次发布核验)。

## 字体修正尚未发布

2026-11-01 已确认：公式字体 `KaTeX_Size3` 的内嵌 WOFF2 被 CSP 拦截，但本站 WOFF 备用文件可以加载。本地已改为输出独立字体文件，桌面与手机尺寸共 12 组未登录页面对比，每组前后截图逐像素一致。需要合并、部署后再核对公网字体请求。线上 CSP 未改动。

## Cloudflare 检测与统计脚本

2026-11-01 通过 Cloudflare API 确认，班级站已开启 Bot Fight Mode 的 JavaScript 检测和 Web Analytics 自动注入。当前已测的登录、背词和 AI 流程可用。本次浏览器检查中，两类注入脚本均被 CSP 阻止执行。

候选修正方案是在 CSP 响应头中使用每次响应独立的 nonce，并允许统计脚本来源。先在测试环境核对注入后的 HTML、CSP 和发布核验器，再安排线上配置变更。实现依据见 [Cloudflare 检测脚本与 CSP](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#if-you-have-a-content-security-policy-csp) 和 [统计脚本的 CSP 要求](https://developers.cloudflare.com/web-analytics/faq/#what-do-i-need-to-add-to-my-content-security-policy-csp)。本次未修改线上配置。

## 需要继续验证

- 真实账号：新注册、邮件确认、找回密码，以及两个不同账号之间的切换隔离。
- 真实手机：朗读实际出声。首页、翻页、当日公式、登录、背词预习和答疑页已在 iPhone Safari 检查。
- Worker 语音：带有效身份的线上音频缓存和连接中断。背词朗读使用浏览器，不经过该接口。

2026-11-01 已实测 macOS Safari 登录、背词保存后刷新继续、真实 AI 回答和刷新读取对话。同一账号在 iPhone Safari 读到了电脑保存的测试问答；新建学习队列也未再从刚保存的 `bonjour` 开始。这次只核对了一题背词保存和一轮对话读取，不代替两个账号之间的切换或语音接口验证，也不保证模型以后仍有额度。
