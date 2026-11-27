import type { EpicSetupFile, StoryTemplateItem } from '../epicSetup'
import { choiceKey, findChoice, fromTemplate, templateChoices } from '../myStoryTemplates'

// STT-07: where a User Story is written (the New User Story form, Your own User Story on New Feature), "Start from a
// template" fills its title and description: the shared templates as they are (those for the Epic first), then the
// person's own, labelled "Mine". Nothing is shown when there is no template at all.
export function StoryTemplatePick({ shared, mine, epicId, featureTitle = '', disabled = false, onPick }: { shared: EpicSetupFile | null | undefined; mine: StoryTemplateItem[]; epicId?: number; featureTitle?: string; disabled?: boolean; onPick: (story: { title: string; description: string }) => void }) {
  const choices = templateChoices(shared, mine, epicId)
  if (!choices.fitting.length && !choices.other.length && !choices.mine.length) return null
  const options = (source: 'shared' | 'mine', list: StoryTemplateItem[]) => list.map((item) => <option key={item.id} value={choiceKey(source, item.id)}>{item.title}</option>)
  return <label className="story-template-pick">Start from a template <small className="muted">(optional, fills the title and description)</small>
    <select aria-label="Start from a template" value="" disabled={disabled} onChange={(event) => { const item = findChoice(choices, event.target.value); if (item) onPick(fromTemplate(item, featureTitle)) }}>
      <option value="">Choose a template…</option>
      {choices.fitting.length > 0 && <optgroup label={choices.other.length ? 'For this Epic' : 'Shared templates'}>{options('shared', choices.fitting)}</optgroup>}
      {choices.other.length > 0 && <optgroup label={choices.fitting.length ? 'Other templates' : 'Shared templates'}>{options('shared', choices.other)}</optgroup>}
      {choices.mine.length > 0 && <optgroup label="Mine">{options('mine', choices.mine)}</optgroup>}
    </select>
  </label>
}
