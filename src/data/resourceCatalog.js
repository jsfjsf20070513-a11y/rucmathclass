// 同一份初版供静态页面、Worker 首次发布和缺数据时使用。
function book(id, title, url, subject, access = '免费') {
  return { id, title, url, subject, access }
}

export const resourceCategories = [
  {
    label: '分析与微分方程', intro: '实分析、复分析、泛函分析与微分方程。',
    items: [
      book('paul-ode', "Paul’s Notes · Differential Equations", 'https://tutorial.math.lamar.edu/Classes/DE/DE.aspx', '常微分方程'),
      book('su-analysis', 'Francis Su · Real Analysis', 'https://math.hmc.edu/su/real-analysis-youtube/', '实分析'),
      book('strogatz-chaos', 'Steven Strogatz · Nonlinear Dynamics and Chaos', 'https://www.stevenstrogatz.com/teaching', '动力系统'),
      book('mit-complex', 'MIT 18.04 · Complex Variables with Applications', 'https://ocw.mit.edu/courses/18-04-complex-variables-with-applications-spring-2018/', '复分析'),
      book('tao-measure', '陶哲轩 · An Introduction to Measure Theory', 'https://terrytao.wordpress.com/books/an-introduction-to-measure-theory/', '测度论'),
      book('mit-functional', 'MIT 18.102 · Introduction to Functional Analysis', 'https://ocw.mit.edu/courses/18-102-introduction-to-functional-analysis-spring-2021/', '泛函分析'),
    ],
  },
  {
    label: '代数', intro: '线性代数、抽象代数与数论。',
    items: [
      book('strang-linear', 'Gilbert Strang · MIT 18.06 Linear Algebra', 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/', '线性代数'),
      book('axler-linear', 'Sheldon Axler · Linear Algebra Done Right（第 4 版）', 'https://linear.axler.net/index.html', '线性代数'),
      book('gross-algebra', 'Benedict Gross · Harvard Abstract Algebra', 'https://www.youtube.com/playlist?list=PLelIK3uylPMGzHBuR3hLMHrYfMqWWsmx5', '抽象代数'),
      book('judson-algebra', 'Judson · Abstract Algebra', 'https://judsonbooks.org/abstract-algebra-theory-and-applications/', '抽象代数'),
      book('shoup-number', 'Shoup · A Computational Introduction to Number Theory and Algebra', 'https://shoup.net/ntb/', '计算数论'),
    ],
  },
  {
    label: '几何与拓扑', intro: '曲线、曲面与拓扑空间。',
    items: [
      book('tokieda-topology', 'Tadashi Tokieda · Topology & Geometry', 'https://www.youtube.com/watch?v=SXHHvoaSctc', '拓扑学'),
      book('geometry-central', 'Keenan Crane · Discrete Differential Geometry', 'https://www.cs.cmu.edu/~kmcrane/Projects/DDG/', '离散微分几何'),
      book('hatcher-topology', 'Hatcher · Algebraic Topology', 'https://pi.math.cornell.edu/~hatcher/AT/ATpage.html', '代数拓扑'),
    ],
  },
  {
    label: '概率与统计', intro: '从概率模型到统计推断。',
    items: [
      book('seeing-theory', 'Seeing Theory', 'https://seeing-theory.brown.edu/', '概率论'),
      {
        ...book('blitzstein-probability', 'Joe Blitzstein · Harvard Stat 110', 'https://pll.harvard.edu/course/introduction-probability', '概率论'),
        textbookUrl: 'https://probabilitybook.net/',
      },
      book('openintro-stats', 'OpenIntro Statistics', 'https://www.openintro.org/book/os/', '统计学'),
    ],
  },
  {
    label: '量化', intro: '概率谜题、统计学习、预测与优化。',
    items: [
      book('jane-puzzles', 'Jane Street · 每月谜题', 'https://www.janestreet.com/puzzles/', '趣味数学'),
      book('isl', 'An Introduction to Statistical Learning', 'https://www.statlearning.com/', '统计学习'),
      book('fpp3', 'Forecasting: Principles and Practice', 'https://otexts.com/fpp3/', '时间序列分析'),
      book('green-book', 'A Practical Guide to Quantitative Finance Interviews', 'https://books.google.com/books?id=QYSMzQEACAAJ', '量化面试', '付费'),
      book('cornell-stochastic', 'Cornell ORIE 6500 · Applied Stochastic Processes', 'https://sidbanerjee.orie.cornell.edu/courses/orie6500/', '随机过程'),
      book('boyd-convex', 'Boyd 与 Vandenberghe · Convex Optimization', 'https://web.stanford.edu/~boyd/cvxbook/', '凸优化'),
    ],
  },
  {
    label: 'AI 与数学', intro: '用 Lean 写证明，读 AI 做数学的实例。',
    items: [
      book('natural-number', 'Natural Number Game', 'https://adam.math.hhu.de/#/g/leanprover-community/nng4', '形式化数学'),
      book('math-in-lean', 'Mathematics in Lean', 'https://leanprover-community.github.io/mathematics_in_lean/', '形式化数学'),
      book('lean-search', '在 Mathlib 中查找定理（2025）', 'https://leanprover-community.github.io/blog/posts/searching-for-theorems-in-mathlib/', '形式化数学'),
      book('leandojo', 'LeanDojo · 用语言模型证明定理（2023）', 'https://leandojo.org/leandojo.html', '自动定理证明'),
      book('aletheia', 'Aletheia · AI 怎样检验数学猜想（2026）', 'https://deepmind.google/blog/accelerating-mathematical-and-scientific-discovery-with-gemini-deep-think/', '人工智能'),
      book('openai-math', 'OpenAI · 数学研究与证明原文（2026）', 'https://openai.com/index/sharing-ai-progress-in-mathematics/', '人工智能'),
    ],
  },
]

export const staticResourceCatalog = resourceCategories.flatMap(({ label, items }) =>
  items.map(item => ({ ...item, category: label })))
