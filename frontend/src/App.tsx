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

// HashRouter matches the vanilla app's `#/command`-style routes verbatim (see
// nav.json), so no route strings needed to change when porting Sidebar/Topbar.
// The portal (login.html/home.html in the vanilla app) sits in front of the TPO
// app at /login and /home; the root path lands on /login, same entry point a
// fresh user would hit.
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/command" element={<CommandCenter />} />
        <Route path="/investigations" element={<Investigations />} />
        <Route path="/intelligence" element={<Intelligence />} />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="/decision" element={<Decision />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
