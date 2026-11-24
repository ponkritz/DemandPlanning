import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../App.css'
import '../fresh.css'
import './viewer.css'
import { applyTheme, readThemePreference } from '../theme'
import { dataElementId, readPublished } from '../publishData'
import { ViewerApp } from './ViewerApp'

// OND-98 The entry of the published file's viewer (built on its own into one script and one stylesheet, vite.config.ts):
// the theme (the file's own choice, else the system's), then the app over the file's JSON data block.
applyTheme(readThemePreference())
const root = document.getElementById('root')
if (root) createRoot(root).render(<StrictMode><ViewerApp data={readPublished(document.getElementById(dataElementId)?.textContent)} /></StrictMode>)
