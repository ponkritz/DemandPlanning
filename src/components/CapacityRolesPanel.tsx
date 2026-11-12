import { accessRoleNames, defaultCapacityRoles, resourceRoles, type CapacityRoles, type CapacitySettings } from '../capacity'
import { Panel } from './ui'

// CAP-50: Settings → People & access → Capacity roles. Which team roles and app access roles count for capacity; a
// person with any role left out is not counted (their hours are listed apart). Built-in: Lead, Manager and People
// Manager are left out. Changed by roles that manage shared settings; saved with the capacity settings in Git, audited.
export function CapacityRolesPanel({ settings, canEdit, onSave }: { settings: CapacitySettings; canEdit: boolean; onSave: (roles: CapacityRoles, detail: string) => void }) {
  const current = settings.capacityRoles ?? defaultCapacityRoles
  const save = (next: CapacityRoles) => onSave(next, `Counted for capacity: team roles ${resourceRoles.filter((role) => !next.excludedResourceRoles.includes(role)).join(', ') || 'none'}; app roles ${accessRoleNames.filter((role) => !next.excludedAccessRoles.includes(role)).join(', ') || 'none'}`)
  const toggle = <T extends string>(list: T[], value: T, on: boolean) => on ? list.filter((entry) => entry !== value) : [...list, value]
  return <Panel eyebrow="PEOPLE" title="Capacity roles" info="Ticked roles count for capacity. A person whose team role, app access role or People manager tick is unticked here is not counted: no capacity and none of their hours in any utilization figure; Pulse Check and People & access list them apart. Everyone else who is employed in the month (Joined on / Left on) and not removed counts. Locked months keep their figures. Saved with the capacity settings in Git; every change is in the audit log.">
    <div className="capacity-roles">
      <fieldset disabled={!canEdit}><legend>Team role (People & access)</legend>
        {resourceRoles.map((role) => <label key={role} className="inline-check"><input type="checkbox" checked={!current.excludedResourceRoles.includes(role)} onChange={(event) => save({ ...current, excludedResourceRoles: toggle(current.excludedResourceRoles, role, event.target.checked) })} /> {role}</label>)}
      </fieldset>
      <fieldset disabled={!canEdit}><legend>App access role (also the People manager tick)</legend>
        {accessRoleNames.map((role) => <label key={role} className="inline-check"><input type="checkbox" checked={!current.excludedAccessRoles.includes(role)} onChange={(event) => save({ ...current, excludedAccessRoles: toggle(current.excludedAccessRoles, role, event.target.checked) })} /> {role}</label>)}
      </fieldset>
    </div>
    {canEdit ? <div className="button-row"><button type="button" className="ghost" onClick={() => save(defaultCapacityRoles)}>Use built-in roles (Lead, Manager and People Manager not counted)</button></div> : <p className="muted">Changed by roles that manage shared settings.</p>}
  </Panel>
}
