import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import PageTransition from './components/PageTransition'
import { flipNavigation } from './lib/flipNav'
import { useAuth } from './context/useAuth'
import Layout from './components/Layout'
import Home from './pages/Home'
import './App.css'
import PageBoundary from './components/PageBoundary'
import { pageLoaders } from './routes/pageLoaders'
import { useLectureAccount } from './hooks/useLectureAccount'
import { usePagePrefetch } from './hooks/usePagePrefetch'

const Resources = lazy(pageLoaders['/resources'])
const Login = lazy(pageLoaders['/login'])
const ResetPassword = lazy(pageLoaders['/reset-password'])
const NotFound = lazy(pageLoaders['/404'])
const Lecture = lazy(pageLoaders['/lecture'])
const Assistant = lazy(pageLoaders['/assistant'])

function AppRoutes() {
  const account = useLectureAccount()
  const { user, loading } = useAuth()
  const visit = flipNavigation.read(useLocation(), useNavigationType())
  return (
    <PageTransition visit={visit} userId={user?.id} loading={loading}>
      <PageBoundary>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home visit={visit} />} />
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
            <Route path="vocabulary" element={<Navigate to="/lecture" replace />} />
            <Route path="lecture" element={<Lecture account={account} />} />
            <Route path="lecture/:date" element={<Lecture account={account} />} />
            <Route path="assistant/:id?" element={<Assistant />} />
            <Route path="resources" element={<Resources />} />
            {/* 资源详情与推荐已下线；旧 /resources/:id（含 curate）统一回书架。 */}
            <Route path="resources/:id" element={<Navigate to="/resources" replace />} />
            {/* 协作页(Atelier)已随 2026-08 减法整页下线;旧链接回扉页。 */}
            <Route path="atelier" element={<Navigate to="/" replace />} />
            <Route path="atelier/*" element={<Navigate to="/" replace />} />
            <Route path="manage" element={<Navigate to="/" replace />} />
            <Route path="manage/*" element={<Navigate to="/" replace />} />
            <Route path="login" element={<Login visit={visit} />} />
            <Route path="reset-password" element={<ResetPassword direct={!visit.previous} />} />
            <Route path="404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Route>
        </Routes>
      </PageBoundary>
    </PageTransition>
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
