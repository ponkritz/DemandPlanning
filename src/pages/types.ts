import type { Dispatch, SetStateAction } from 'react'
import type { useAppStore } from '../store'

export interface PageProps {
  store: ReturnType<typeof useAppStore>
  month: string
  setMonth: Dispatch<SetStateAction<string>>
}
