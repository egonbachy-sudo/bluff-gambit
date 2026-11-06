import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)

// Installable app: the service worker only runs on the built site, never in dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
