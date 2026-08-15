import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/bodoni-moda/400.css'
import '@fontsource/bodoni-moda/600.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/noto-sans-sc/300.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import './styles.css'
import App from './App'

document.body.classList.toggle('is-mac', navigator.userAgent.includes('Macintosh'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
