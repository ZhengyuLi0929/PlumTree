import { Routes, Route } from 'react-router'
import Landing from './pages/Landing'
import Home from './pages/Home'
import MeGate, { MeIndex } from './pages/me/MeGate'
import MeMatch from './pages/me/MeMatch'
import MeChat from './pages/me/MeChat'
import MeDate from './pages/me/MeDate'
import MePersona from './pages/me/MePersona'
import MePassword from './pages/me/MePassword'
import Stats from './pages/Stats'
import StatsV2 from './pages/StatsV2'
import StatsV3 from './pages/StatsV3'
import AdminGate, { AdminIndex } from './pages/admin/AdminGate'
import AdminMatch from './pages/admin/AdminMatch'
import AdminDsMatch from './pages/admin/AdminDsMatch'
import AdminAirdrop from './pages/admin/AdminAirdrop'
import AdminMerchant from './pages/admin/AdminMerchant'
import AdminFeedback from './pages/admin/AdminFeedback'
import AdminOps from './pages/admin/AdminOps'
import AdminVisit from './pages/admin/AdminVisit'
import Privacy from './pages/Privacy'
import { VisitTracker } from './components/VisitTracker'

export default function App() {
  return (
    <>
      <VisitTracker />
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* 爱情人格测试（51 题完整流程） */}
        <Route path="/quiz" element={<Home />} />
        {/* /me：登录门禁 + 五个子 tab 各占一条路由（非 beta 用户为旧版单页） */}
        <Route path="/me" element={<MeGate />}>
          <Route index element={<MeIndex />} />
          <Route path="match" element={<MeMatch />} />
          <Route path="chat" element={<MeChat />} />
          <Route path="date" element={<MeDate />} />
          <Route path="persona" element={<MePersona />} />
          <Route path="password" element={<MePassword />} />
        </Route>
        <Route path="/stats" element={<Stats />} />
        <Route path="/stats-v2" element={<StatsV2 />} />
        <Route path="/stats-v3" element={<StatsV3 />} />
        {/* /admin：登录门禁 + 每个 tab 一条子路由 */}
        <Route path="/admin" element={<AdminGate />}>
          <Route index element={<AdminIndex />} />
          <Route path="match" element={<AdminMatch />} />
          <Route path="dsmatch" element={<AdminDsMatch />} />
          <Route path="airdrop" element={<AdminAirdrop />} />
          <Route path="merchant" element={<AdminMerchant />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="ops" element={<AdminOps />} />
          <Route path="visits" element={<AdminVisit />} />
        </Route>
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </>
  )
}
