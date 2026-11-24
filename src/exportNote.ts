import { createContext } from 'react'

// OND-67: every table export inside a page shown with sample rows (the Data table, a drill-down, a summary table) is
// marked: its file name starts with the prefix ("Sample-") and its first line says what it is ("Sample data — …").
export interface ExportNote { prefix: string; line: string }
export const ExportNoteContext = createContext<ExportNote | null>(null)
export const sampleExportNote: ExportNote = { prefix: 'Sample-', line: 'Sample data — made-up rows, not the page’s data' }
