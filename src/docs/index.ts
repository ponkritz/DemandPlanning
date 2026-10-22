// The project documents shown on the Documentation page. They are bundled from docs/ at build time, so the page always
// shows the documents of the running build.
import requirements from '../../docs/REQUIREMENTS-SPECIFICATION.md?raw'
import testPlan from '../../docs/TEST-PLAN.md?raw'
import verification from '../../docs/VERIFICATION-PLAN.md?raw'
import uat from '../../docs/UAT-PLAN.md?raw'
import azureSetup from '../../docs/azure-devops-connection.md?raw'
import projectPlan from '../../docs/PROJECT-PLAN.md?raw'

export interface ProjectDoc { file: string; label: string; source: string }
export const projectDocs: ProjectDoc[] = [
  { file: 'REQUIREMENTS-SPECIFICATION.md', label: 'Requirements', source: requirements },
  { file: 'TEST-PLAN.md', label: 'Test plan', source: testPlan },
  { file: 'VERIFICATION-PLAN.md', label: 'Verification plan', source: verification },
  { file: 'UAT-PLAN.md', label: 'UAT plan', source: uat },
  { file: 'azure-devops-connection.md', label: 'Azure DevOps setup', source: azureSetup },
  { file: 'PROJECT-PLAN.md', label: 'Project plan', source: projectPlan },
]
