# 现有界面怎么组织

这里只说明从哪里改，以及哪些改动必须看真实页面。旧 HTML 样稿不是需求，也不能证明现有页面已经实现某个功能。

| 范围 | 代码入口 |
| --- | --- |
| 全站颜色、字体、间距 | [index.css](../src/index.css)、[App.css](../src/App.css) |
| 共用导航、翻页和文字按钮 | [shared-controls.css](../src/styles/shared-controls.css)、[PageNav](../src/components/PageNav.jsx)、[PageControls](../src/components/PageControls.jsx) |
| 首页 | [Home.jsx](../src/pages/Home.jsx)、[magazine.css](../src/styles/magazine.css) |
| 背词 | [Vocabulary.jsx](../src/pages/Vocabulary.jsx)、[vocabulary.css](../src/styles/vocabulary.css) |
| 书架 | [Resources.jsx](../src/pages/Resources.jsx)、[resources.css](../src/styles/resources.css) |
| 答疑 | [Assistant.jsx](../src/pages/Assistant.jsx)、[assistant.css](../src/styles/assistant.css) |
| 登录与重置密码 | [auth.css](../src/styles/auth.css) |
| 通用布局和窄屏修正 | [editorial-base.css](../src/styles/editorial-base.css)、[viewport-overrides.css](../src/styles/viewport-overrides.css) |

2026-10-05 用户要求：页面修改先给真实本地站的前后对比图，确认后再落实。命令见 [README](../README.md)。先保持现有设计，不顺便加说明小字或改视觉。

`App.css` 的导入顺序决定样式覆盖。共享规则先于页面规则，窄屏修正在最后。不要只为拆文件就改成按路由加载，否则同一页面可能因访问顺序不同而变样。

删除样式前要查 JSX、动态类名和脚本生成的内容。旧前缀本身不能证明代码没用。修改共享规则后，要实际查看所有受影响页面。

首页登录后会增加一页。改页序、翻页或登录展开时，要同时验证登录前后、退出、动画结束和窗口缩放。其他页面检查手机与桌面的对齐、断行、横向溢出、按钮状态和键盘焦点。
