# Carnet de classe · 班级网站

这是一个中法双语的班级网站。首页用横向翻页呈现定理、引语和各页入口；资源页供所有人阅读，背词进度和 AI 对话历史按账号保存。

本文和下列说明依据当前代码、配置和测试重写。它们帮助找代码，不代替代码；也不能证明线上已经部署了哪个版本、数据库实际用了哪些权限。

## 本地运行

使用 `.nvmrc` 指定的 Node 版本，然后运行：

```bash
npm ci
npm run demo
```

这是使用假数据的本地网站，不读取真实服务配置。假账号和密码会显示在终端。重启演示并重新打开页面后，假数据会重置。用 `npm run demo -- --help` 查看登录、背词、答疑和异常场景。

页面改动先截图对比：

```bash
npm run compare -- --base mathclass/main --scene vocabulary-study
```

“改前”取指定提交，“改后”取当前工作区。两边共用假数据；手机和桌面拼图保存在 `output/playwright/comparisons/`。首次使用先运行 `npx playwright install chromium`。更多场景见命令的 `--help`，不在文档里另列一份。

需要连接已配置的真实服务时运行：

```bash
npm run dev
```

封面的 60 张肖像和统一清单已经随 Git 入库。开发和构建会先离线检查素材，正常启动不需要临时下载图片。

需要登录时，把 `.env.example` 复制成 `.env.local`，填写 Supabase URL 和公开的 anon key。不要填 service-role key。没有这两个配置时，公开页面仍能打开，账号功能不可用。

AI 默认请求班级站的 `/api/chat`。本地调试可用 `VITE_AI_ENDPOINT` 指向自己的模拟服务；开发模式并不自动隔离真实外部请求。

## 现在有哪些页面

| 地址 | 实际功能 |
| --- | --- |
| `/` | 肖像封面、背词入口、每日定理、书架入口、引语；登录后增加 AI 入口 |
| `/resources` | 静态书目与 Supabase 增补资源合并展示；云端失败时保留静态书目 |
| `/vocabulary` | 登录后背词，保存复习进度，恢复本机未完成的一轮 |
| `/assistant` | 登录后提问，可附图片，文字对话存入个人历史 |
| `/login`、`/reset-password` | 登录、注册、邮箱验证码和密码重置 |

路由以 [App.jsx](src/App.jsx) 为准。资源推荐、相册、协作台、Web3 等旧地址只做兼容跳转，不表示这些功能还在运行。

## 维护入口

- [代码怎么分工](docs/architecture.md)：改哪里会影响哪里，数据和外部接口在哪。
- [开发与验证](docs/development.md)：命令、生成文件、测试范围、部署脚本实际做什么。
- [现有界面](docs/design-constitution.md)：从 JSX 和 CSS 整理出的页面结构与样式位置。
- [还没解决的问题](docs/remaining-work.md)：本地已复现的问题和尚未验证的流程。
- [Worker 说明](worker/README.md)：代码入口、配置和发布注意事项。

提交前运行 `npm run lint && npm test && npm run build`；Worker 还要跑 `npm run worker:check`，交互和布局改动跑 `npm run browser:check`。通过这些检查不等于线上已经更新，也不等于所有页面交互都验证过。
