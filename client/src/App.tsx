import { GoogleOAuthProvider } from '@react-oauth/google'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { AdminGatePage } from './pages/AdminGatePage'
import { AdminNewTournamentPage } from './pages/AdminNewTournamentPage'
import { AdminTournamentPage } from './pages/AdminTournamentPage'
import { RegistrationPage } from './pages/RegistrationPage'
import { TursoConnectPage } from './pages/TursoConnectPage'
import { ViewerTournamentPage } from './pages/ViewerTournamentPage'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

function RoutesTree() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminGatePage />} />
        <Route path="/admin/turso" element={<TursoConnectPage />} />
        <Route path="/admin/new" element={<AdminNewTournamentPage />} />
        <Route path="/admin/t/:slug" element={<AdminTournamentPage />} />
        <Route path="/inscription" element={<RegistrationPage />} />
        <Route path="/t/:slug" element={<ViewerTournamentPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  if (googleClientId) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        <RoutesTree />
      </GoogleOAuthProvider>
    )
  }
  return <RoutesTree />
}

export default App
