# 在这个仓库工作

先从 `package.json`、`src/App.jsx` 和相关调用确认现状。文档只当地图；代码和说明不一致时，指出差异，不按旧计划补功能。

## 入口

- [README](README.md)：网站、本地假数据和页面对比。
- [架构](docs/architecture.md)：代码入口、保存顺序和账号处理。
- [开发](docs/development.md)：生成文件、发布方法和带日期的线上记录。
- [界面](docs/design-constitution.md)：样式位置和页面验证。
- [未完成项](docs/remaining-work.md)、[Worker](worker/README.md)。

## 这次工作的要求（用户于 2026-10-05 确认）

保持现有设计。页面先给前后对比图，确认后再落实。中文写清楚，一句话只说一件事；改完另请一个代理挑文字毛病。

不恢复旧相册、Web3 或管理后台。不从本仓推断 Raccord 的现状。服务器还承载青协网站和代理出口，只操作班级站。

模块导入限制由 ESLint 检查。词条 ID 对应既有进度，不能重排。保存结果确认后才能进入下一题；账号切换后，旧请求不能覆盖新状态。原因和代码入口见架构说明。SQL 按 `schema/audit/legacy` 分工，不能整段顺序执行。

## 完成一轮

在工作分支修改，同一目录只有一位写入者。提交前运行 `npm run lint && npm test && npm run build`；Worker 修改加跑 `npm run worker:check`，交互或布局修改加跑 `npm run browser:check` 并查看真实页面。构建若只更新了 `public/health.json` 的时间戳，提交前还原它。

提交写清改了什么、怎样验证、还有什么未验。合并和上线必须取得明确授权；“继续”不算。删除分支前，先把备份标签推到远端。

`AGENTS.md` 指向本文件。旧材料放 `docs/archive/`；不要把会话经过和未定计划写进代理入口。
