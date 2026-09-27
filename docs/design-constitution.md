# 现有界面怎么组织

这份说明从当前 JSX 和 CSS 重新整理，沿用原文件名以免入口失效。它记录已经实现的样式，不根据旧设计稿给网站添加需求，也不能代替真实页面验证。

## 页面结构

[Layout.jsx](../src/components/Layout.jsx) 对首页、背词、资源、AI、登录和重置页直接渲染页面，不附加通用页眉页脚。404 使用通用布局；旧资源推荐地址直接回书架。

首页是全屏横翻：未登录时有封面、背词、定理、书架和引语五页；登录后在引语前插入 AI 入口。登录表单从引语页展开。布局、账号变化和页数之间的关系在 [Home.jsx](../src/pages/Home.jsx)，通用翻页在 [usePageFlip.js](../src/hooks/usePageFlip.js)。改内部结构时不要顺便改这些视觉和交互行为。

封面肖像统一从 [portraits.json](../src/data/portraits.json) 读取，图片在 `public/portraits/`。开发和构建会先做离线素材检查；它检查文件标记，不代替真实图片解码和页面观感验证。

## 样式在哪里

| 范围 | 代码入口 |
| --- | --- |
| 全站颜色、基础字体、间距 | [index.css](../src/index.css) 的 `:root` |
| 首页与共享翻页控件 | [magazine.css](../src/styles/magazine.css) |
| 背词与共享页内导航 | [vocabulary.css](../src/styles/vocabulary.css) |
| 书架 | [resources.css](../src/styles/resources.css) |
| AI 对话 | [assistant.css](../src/styles/assistant.css) |
| 登录与密码重置 | [auth.css](../src/styles/auth.css) |
| 通用版式与早期页面基础 | [editorial-base.css](../src/styles/editorial-base.css) |
| 最后的窄屏留白修正 | [viewport-overrides.css](../src/styles/viewport-overrides.css) |

当前底色以暖纸色为主，正文用深褐色，提示和链接使用克制的酒红色。基础变量是 `--paper: #fdfcf8`、`--ink: #221d18`、`--accent: #7f302b`；杂志首页和登录页另用 `#f4efe6`。

基础正文是 EB Garamond 与中文衬线字体回退；杂志正文使用 Cormorant Garamond，标题和小型导航使用 Bodoni Moda，首页 Math 字样使用 Pinyon Script。字体声明和载入位置以 CSS、[index.html](../index.html) 为准。

登录页内容居中，最大宽度 420px，输入框只有底线。各杂志页使用自己的留白和窄屏规则。不要把旧 `.editorial-*` 或通用按钮规则直接套到新位置而不看实际效果。

## 改动时怎样核对

保持中文、法文和数学公式可读。检查桌面与窄屏的对齐、断行、按钮状态、错误提示和键盘焦点；首页还要检查登录前后插页、退出和动画结束状态。

`App.css` 只按固定顺序导入上述文件，仍是 App 的唯一样式入口。拆分保留了原规则和顺序，生产 CSS 逐字节一致。部分页内导航、按钮和表单规则被多个页面共用，因此不能直接改成按路由懒加载。

`editorial-base.css` 仍含早期版式，后面的页面规则会覆盖其中一些定义。清理时先查 JSX 中的使用和 CSS 选择器，再看真实页面。不能仅凭前缀旧、类名难看或历史样稿不同就删除。

`docs/` 里的 HTML 样稿没有进入应用路由，不能用它们证明现有页面已经实现某个功能。
