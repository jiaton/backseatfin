import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { createQueryClient } from './lib/query-client'
import './index.css'

// shadcn's theme tokens are gated on a `.dark` class, not a media query —
// sync it to the OS preference since this app has no theme toggle.
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
const syncDarkClass = () => document.documentElement.classList.toggle('dark', darkMediaQuery.matches)
syncDarkClass()
darkMediaQuery.addEventListener('change', syncDarkClass)

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
