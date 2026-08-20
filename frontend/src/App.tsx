import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { CommandCenter } from './pages/CommandCenter'
import { Investigations } from './pages/Investigations'
import { Intelligence } from './pages/Intelligence'
import { Simulation } from './pages/Simulation'
import { Decision } from './pages/Decision'
import { Calendar } from './pages/Calendar'
import { Reports } from './pages/Reports'
import { Connections } from './pages/Connections'
import { Settings } from './pages/Settings'
import { RequireAuth } from './components/RequireAuth'

// HashRouter matches the vanilla app's `#/command`-style routes verbatim (see
// nav.json), so no route strings needed to change when porting Sidebar/Topbar.
// The portal (login.html/home.html in the vanilla app) sits in front of the TPO
// app at /login and /home; the root path lands on /login, same entry point a
// fresh user would hit. Every route but /login is now gated on a real session
// (RequireAuth — see components/RequireAuth.tsx) now that login actually means
// something; previously any of these were reachable by URL with no session at all.
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/command" element={<RequireAuth><CommandCenter /></RequireAuth>} />
        <Route path="/investigations" element={<RequireAuth><Investigations /></RequireAuth>} />
        <Route path="/intelligence" element={<RequireAuth><Intelligence /></RequireAuth>} />
        <Route path="/simulation" element={<RequireAuth><Simulation /></RequireAuth>} />
        <Route path="/decision" element={<RequireAuth><Decision /></RequireAuth>} />
        <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
        <Route path="/connections" element={<RequireAuth><Connections /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
