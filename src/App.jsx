import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import './App.css'

const Resources = lazy(() => import('./pages/Resources'))
const ResourceCurate = lazy(() => import('./pages/ResourceCurate'))
const Login = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Vocabulary = lazy(() => import('./pages/Vocabulary'))
const Assistant = lazy(() => import('./pages/Assistant'))

function DeferredPage({ children }) {
  // 杂志刊契约(2026-08-20):路由切换不再有加载页;懒加载空档留白纸,
  // 由目标页的翻入动画接管。冷启动纸面由 index.html 提供。
  return (
    <Suspense fallback={null}>
      {children}
    </Suspense>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        {/* 旧地址兼容：这些页面没有现役实现，访问时回首页。 */}
        <Route path="witness" element={<Navigate to="/" replace />} />
        <Route path="hackathon" element={<Navigate to="/" replace />} />
        <Route path="web3-profile" element={<Navigate to="/" replace />} />
        <Route path="web3-student-profile" element={<Navigate to="/" replace />} />
        <Route path="gallery" element={<Navigate to="/" replace />} />
        <Route path="gallery/contribute" element={<Navigate to="/" replace />} />
        <Route path="album/*" element={<Navigate to="/" replace />} />
        <Route path="class-info" element={<Navigate to="/" replace />} />
        <Route path="timeline/*" element={<Navigate to="/" replace />} />
        <Route path="announcements/*" element={<Navigate to="/" replace />} />
        <Route path="vocabulary" element={<DeferredPage><Vocabulary /></DeferredPage>} />
        <Route path="assistant" element={<DeferredPage><Assistant /></DeferredPage>} />
        <Route path="resources" element={<DeferredPage><Resources /></DeferredPage>} />
        <Route path="resources/curate" element={<DeferredPage><ResourceCurate /></DeferredPage>} />
        {/* 资源详情页已下线(资源直接外链);旧 /resources/:id 链接回资源目录。 */}
        <Route path="resources/:id" element={<Navigate to="/resources" replace />} />
        {/* 协作页(Atelier)已随 2026-08 减法整页下线;旧链接回扉页。 */}
        <Route path="atelier" element={<Navigate to="/" replace />} />
        <Route path="atelier/*" element={<Navigate to="/" replace />} />
        <Route path="manage" element={<Navigate to="/" replace />} />
        <Route path="manage/*" element={<Navigate to="/" replace />} />
        <Route path="login" element={<DeferredPage><Login /></DeferredPage>} />
        <Route path="reset-password" element={<DeferredPage><ResetPassword /></DeferredPage>} />
        <Route path="404" element={<DeferredPage><NotFound /></DeferredPage>} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  )
}

// 首屏空闲后预取懒路由 chunk(背词 chunk 含 3650 词词库,等点击才下载会顿)。
function useIdlePrefetch() {
  useEffect(() => {
    const prefetch = () => {
      import('./pages/Vocabulary')
      import('./pages/Resources')
      import('./pages/Assistant')
      import('./pages/Login')
    }
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = window.setTimeout(prefetch, 1500)
    return () => window.clearTimeout(t)
  }, [])
}

function App() {
  useIdlePrefetch()
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
