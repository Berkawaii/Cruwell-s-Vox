import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { VoiceProvider } from './contexts/VoiceContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <VoiceProvider>
        <App />
      </VoiceProvider>
    </AuthProvider>
  </StrictMode>,
)
