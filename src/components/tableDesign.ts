import { createContext, useContext } from 'react'
import { tableDefaults, type TableDefaults } from '../tableDefaults'

// The shared table design default (UI-12), provided once by the app and read by every DataTable.
export const TableDefaultsContext = createContext<TableDefaults>(tableDefaults)
export const useTableDefaults = () => useContext(TableDefaultsContext)
