// 同一份初版供静态页面、Worker 首次发布和缺数据时使用。
function book(id, title, url, description, access = '免费') {
  return { id, title, url, description, access }
}

export const resourceCategories = [
  {
    label: '分析与微分方程', intro: '实分析、复分析、泛函分析与微分方程。',
    items: [
      book('paul-ode', "Paul’s Notes · Differential Equations", 'https://tutorial.math.lamar.edu/Classes/DE/DE.aspx', '初学常微分方程时，可以先做一道例题，再展开解答核对步骤。'),
      book('su-analysis', 'Francis Su · Real Analysis', 'https://math.hmc.edu/su/real-analysis-youtube/', '在哈维穆德学院的课堂录像里，从数列极限学起，练习把直觉写成证明。'),
      book('strogatz-chaos', 'Steven Strogatz · Nonlinear Dynamics and Chaos', 'https://www.stevenstrogatz.com/teaching', '跟着康奈尔的课程视频画相图，观察方程的解怎样随时间变化。'),
      book('mit-complex', 'MIT 18.04 · Complex Variables with Applications', 'https://ocw.mit.edu/courses/18-04-complex-variables-with-applications-spring-2018/', '第一次计算复积分时，可以跟着讲义画出积分路径。'),
      book('tao-measure', '陶哲轩 · An Introduction to Measure Theory', 'https://terrytao.wordpress.com/books/an-introduction-to-measure-theory/', '熟悉实分析后，用书中的例子理解勒贝格积分怎样处理函数列的极限。'),
      book('mit-functional', 'MIT 18.102 · Introduction to Functional Analysis', 'https://ocw.mit.edu/courses/18-102-introduction-to-functional-analysis-spring-2021/', '学过测度与线性代数后，跟着视频把正交投影推广到函数空间。'),
    ],
  },
  {
    label: '代数', intro: '线性代数、抽象代数与数论。',
    items: [
      book('strang-linear', 'Gilbert Strang · MIT 18.06 Linear Algebra', 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/', '从解线性方程组开始，跟着课堂视频理解矩阵的列空间。'),
      book('axler-linear', 'Sheldon Axler · Linear Algebra Done Right（第 4 版）', 'https://linear.axler.net/index.html', '这本免费教材从向量空间和线性映射出发，带你证明特征值的基本性质。'),
      book('gross-algebra', 'Benedict Gross · Harvard Abstract Algebra', 'https://www.youtube.com/playlist?list=PLelIK3uylPMGzHBuR3hLMHrYfMqWWsmx5', '跟着哈佛课堂录像，从图形的对称性理解群，再学习群之间的映射。'),
      book('judson-algebra', 'Judson · Abstract Algebra', 'https://judsonbooks.org/abstract-algebra-theory-and-applications/', '开始学群和环时，先算书中的例子，再用章末习题练习证明。'),
      book('shoup-number', 'Shoup · A Computational Introduction to Number Theory and Algebra', 'https://shoup.net/ntb/', '学过同余后，对照算法推导怎样求模逆元和计算有限域中的乘积。'),
    ],
  },
  {
    label: '几何与拓扑', intro: '曲线、曲面与拓扑空间。',
    items: [
      book('tokieda-topology', 'Tadashi Tokieda · Topology & Geometry', 'https://www.youtube.com/watch?v=SXHHvoaSctc', '跟着时枝正的课堂录像，看看图形连续变形时哪些性质保持不变。'),
      book('geometry-central', 'Keenan Crane · Discrete Differential Geometry', 'https://www.cs.cmu.edu/~kmcrane/Projects/DDG/', '有微积分基础后，可以看视频理解曲率，再在三角网格上动手计算。'),
      book('hatcher-topology', 'Hatcher · Algebraic Topology', 'https://pi.math.cornell.edu/~hatcher/AT/ATpage.html', '熟悉拓扑空间后，用基本群和同调区分形状相近的空间。'),
    ],
  },
  {
    label: '概率与统计', intro: '从概率模型到统计推断。',
    items: [
      book('seeing-theory', 'Seeing Theory', 'https://seeing-theory.brown.edu/', '初学概率时，拖动参数观察分布怎样变化。'),
      {
        ...book('blitzstein-probability', 'Joe Blitzstein · Harvard Stat 110', 'https://pll.harvard.edu/course/introduction-probability', '从条件概率学起，再用 Blitzstein 和 Hwang 的教材练习计算期望。'),
        textbookUrl: 'https://probabilitybook.net/',
      },
      book('openintro-stats', 'OpenIntro Statistics', 'https://www.openintro.org/book/os/', '第一次分析调查数据时，跟着案例估计总体均值并计算置信区间。'),
    ],
  },
  {
    label: '量化', intro: '概率谜题、统计学习、预测与优化。',
    items: [
      book('jane-puzzles', 'Jane Street · 每月谜题', 'https://www.janestreet.com/puzzles/', '想练习把问题写成数学模型时，可以先做每月谜题，再读往期解答。'),
      book('isl', 'An Introduction to Statistical Learning', 'https://www.statlearning.com/', '初学机器学习时，用配套的 R 或 Python 实验比较回归和分类方法。'),
      book('fpp3', 'Forecasting: Principles and Practice', 'https://otexts.com/fpp3/', '第一次做时间序列预测时，跟着实例分辨趋势、季节变化和随机波动。'),
      book('green-book', 'A Practical Guide to Quantitative Finance Interviews', 'https://books.google.com/books?id=QYSMzQEACAAJ', '准备量化面试时，用周欣锋的绿皮书练习把概率题的推导讲清楚。', '付费'),
      book('cornell-stochastic', 'Cornell ORIE 6500 · Applied Stochastic Processes', 'https://sidbanerjee.orie.cornell.edu/courses/orie6500/', '熟悉条件概率后，用课程讲义分析马尔可夫链的长期行为。'),
      book('boyd-convex', 'Boyd 与 Vandenberghe · Convex Optimization', 'https://web.stanford.edu/~boyd/cvxbook/', '处理带约束的投资组合问题时，可以查书中的凸优化模型和对偶方法。'),
    ],
  },
  {
    label: 'AI 与数学', intro: '用 Lean 写证明，读 AI 做数学的实例。',
    items: [
      book('natural-number', 'Natural Number Game', 'https://adam.math.hhu.de/#/g/leanprover-community/nng4', '第一次用 Lean 时，从证明自然数加法的性质开始逐关练习。'),
      book('math-in-lean', 'Mathematics in Lean', 'https://leanprover-community.github.io/mathematics_in_lean/', '会写简单证明后，跟着教材把熟悉的数学定理写成 Lean 能检查的形式。'),
      book('lean-search', '在 Mathlib 中查找定理（2025）', 'https://leanprover-community.github.io/blog/posts/searching-for-theorems-in-mathlib/', '记得定理却想不起名字时，可以照着例子用自然语言搜索。'),
      book('leandojo', 'LeanDojo · 用语言模型证明定理（2023）', 'https://leandojo.org/leandojo.html', '熟悉 Lean 后，看模型怎样从已有定理中挑出下一步证明需要的引理。'),
      book('aletheia', 'Aletheia · AI 怎样检验数学猜想（2026）', 'https://deepmind.google/blog/accelerating-mathematical-and-scientific-discovery-with-gemini-deep-think/', '读研究案例时，对照模型提出的论证和研究者检查证明的过程。'),
      book('openai-math', 'OpenAI · 数学研究与证明原文（2026）', 'https://openai.com/index/sharing-ai-progress-in-mathematics/', '想核对一项 AI 数学结果时，可以读论文原文，也可以查看部分结果的 Lean 证明。'),
    ],
  },
]

export const staticResourceCatalog = resourceCategories.flatMap(({ label, items }) =>
  items.map(item => ({ ...item, category: label })))
