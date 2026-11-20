import { defaultCapacityRoles, resourceRoles, type CapacityRoles, type CapacitySettings } from '../capacity'
import { Panel } from './ui'

// CAP-57: Admin → People & roles → Capacity roles. Which team roles count for capacity; a person whose team Role is
// left out is not counted (their hours are listed apart). App access roles and the People manager tick never decide
// it. Built-in: Lead and Manager are left out. Changed by roles that manage shared settings; saved in Git, audited.
export function CapacityRolesPanel({ settings, canEdit, onSave }: { settings: CapacitySettings; canEdit: boolean; onSave: (roles: CapacityRoles, detail: string) => void }) {
  const current = settings.capacityRoles ?? defaultCapacityRoles
  const save = (next: CapacityRoles) => onSave(next, `Counted for capacity: team roles ${resourceRoles.filter((role) => !next.excludedResourceRoles.includes(role)).join(', ') || 'none'}`)
  const toggle = <T extends string>(list: T[], value: T, on: boolean) => on ? list.filter((entry) => entry !== value) : [...list, value]
  return <Panel eyebrow="PEOPLE" title="Capacity roles" info="Ticked team roles count for capacity. A person whose team Role (People & access) is unticked here is not counted: no capacity and none of their hours in any utilization figure; Pulse Check and People & access list them apart. App access roles (Admin, People Manager, …) and the People manager tick never decide capacity. Everyone else who is employed in the month (Joined on / Left on) and not removed counts. Locked months keep their figures.">
    <div className="capacity-roles">
      <fieldset disabled={!canEdit}><legend>Team role (People & access)</legend>
        {resourceRoles.map((role) => <label key={role} className="inline-check"><input type="checkbox" checked={!current.excludedResourceRoles.includes(role)} onChange={(event) => save({ ...current, excludedResourceRoles: toggle(current.excludedResourceRoles, role, event.target.checked) })} /> {role}</label>)}
      </fieldset>
    </div>
    {canEdit ? <div className="button-row"><button type="button" className="ghost" onClick={() => save(defaultCapacityRoles)}>Use built-in roles (Lead and Manager not counted)</button></div> : <p className="muted">Changed by roles that manage shared settings.</p>}
  </Panel>
}
