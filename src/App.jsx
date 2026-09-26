import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import './App.css'
import PageBoundary from './components/PageBoundary'
import { pageLoaders } from './routes/pageLoaders'
import { usePagePrefetch } from './hooks/usePagePrefetch'

const Resources = lazy(pageLoaders['/resources'])
const ResourceCurate = lazy(pageLoaders['/resources/curate'])
const Login = lazy(pageLoaders['/login'])
const ResetPassword = lazy(pageLoaders['/reset-password'])
const NotFound = lazy(pageLoaders['/404'])
const Vocabulary = lazy(pageLoaders['/vocabulary'])
const Assistant = lazy(pageLoaders['/assistant'])

function AppRoutes() {
  return (
    <PageBoundary>
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
          <Route path="vocabulary" element={<Vocabulary />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="resources" element={<Resources />} />
          <Route path="resources/curate" element={<ResourceCurate />} />
          {/* 资源详情页已下线(资源直接外链);旧 /resources/:id 链接回资源目录。 */}
          <Route path="resources/:id" element={<Navigate to="/resources" replace />} />
          {/* 协作页(Atelier)已随 2026-08 减法整页下线;旧链接回扉页。 */}
          <Route path="atelier" element={<Navigate to="/" replace />} />
          <Route path="atelier/*" element={<Navigate to="/" replace />} />
          <Route path="manage" element={<Navigate to="/" replace />} />
          <Route path="manage/*" element={<Navigate to="/" replace />} />
          <Route path="login" element={<Login />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </PageBoundary>
  )
}

function App() {
  usePagePrefetch()
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
