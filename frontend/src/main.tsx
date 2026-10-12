import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { createQueryClient } from './lib/query-client'
import './index.css'

// shadcn's theme tokens are gated on a `.dark` class. The app is the car's home screen
// (dark, like the player, whatever the OS says), and the same pages on a phone.
document.documentElement.classList.add('dark')

const queryClient = createQueryClient()
// Coming back from the player restores this page as it was (back/forward cache): what
// it shows (resume positions, "continue watching") changed meanwhile, so refetch.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) void queryClient.invalidateQueries()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
