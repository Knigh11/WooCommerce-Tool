import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'
import { QueryProvider } from './providers/QueryProvider'
import { ThemeProvider } from './providers/ThemeProvider'
import { StoreProvider } from './state/storeContext'
import { JobProvider } from './state/jobManager'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <StoreProvider>
          <JobProvider>
            <App />
          </JobProvider>
        </StoreProvider>
      </ThemeProvider>
    </QueryProvider>
  </React.StrictMode>,
)

