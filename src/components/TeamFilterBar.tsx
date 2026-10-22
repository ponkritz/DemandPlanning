import { regions, resourceRoles, type TeamFilter } from '../capacity'

// Overview (team): switch between regions and pick one or more roles. Nothing chosen = the whole team.
export function TeamFilterBar({ filter, onChange }: { filter: TeamFilter; onChange: (filter: TeamFilter) => void }) {
  const toggleRole = (role: TeamFilter['roles'][number]) => onChange({ ...filter, roles: filter.roles.includes(role) ? filter.roles.filter((entry) => entry !== role) : [...filter.roles, role] })
  return <div className="team-filter">
    <div className="view-switch" role="group" aria-label="Region"><span>Region</span><div className="segmented">
      <button type="button" aria-pressed={!filter.region} onClick={() => onChange({ ...filter, region: undefined })}>All</button>
      {regions.map((region) => <button key={region} type="button" aria-pressed={filter.region === region} onClick={() => onChange({ ...filter, region })}>{region}</button>)}
    </div></div>
    <div className="view-switch" role="group" aria-label="Roles"><span>Roles</span><div className="segmented">
      <button type="button" aria-pressed={!filter.roles.length} onClick={() => onChange({ ...filter, roles: [] })}>All</button>
      {resourceRoles.map((role) => <button key={role} type="button" aria-pressed={filter.roles.includes(role)} onClick={() => toggleRole(role)}>{role}</button>)}
    </div></div>
    {(filter.region || filter.roles.length > 0) && <small className="muted">Only people mapped to this region / role (Settings → Resources) and the region’s public holidays.</small>}
  </div>
}
