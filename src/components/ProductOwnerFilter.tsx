import { MultiSelect } from './MultiSelect'
import type { OwnerFilter } from '../useOwnerFilter'

// PIR-69: the Product Owner filter (useOwnerFilter) as a MultiSelect of the filter bar (UI-STANDARDS §7), shown only when
// at least one Epic has a Product Owner.
export function ProductOwnerFilter({ filter }: { filter: OwnerFilter }) {
  return filter.options.length ? <MultiSelect label="Product Owner" options={filter.options} value={filter.value} onChange={filter.change} /> : null
}
