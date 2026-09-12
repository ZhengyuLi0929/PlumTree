import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Stats from './pages/Stats'
import StatsV2 from './pages/StatsV2'
import StatsV3 from './pages/StatsV3'
import Admin from './pages/Admin'
import { VisitTracker } from './components/VisitTracker'

export default function App() {
  return (
    <>
      <VisitTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/stats-v2" element={<StatsV2 />} />
        <Route path="/stats-v3" element={<StatsV3 />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </>
  )
}
