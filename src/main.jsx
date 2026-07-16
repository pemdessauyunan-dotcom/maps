import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/geosat.css'
import AppLayout from './components/AppLayout.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppLayout />
  </StrictMode>,
)