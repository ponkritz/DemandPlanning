// The project documents shown on the Documentation page. They are bundled from docs/ at build time, so the page always
// shows the documents of the running build.
import requirements from '../../docs/REQUIREMENTS-SPECIFICATION.md?raw'
import testPlan from '../../docs/TEST-PLAN.md?raw'
import verification from '../../docs/VERIFICATION-PLAN.md?raw'
import uat from '../../docs/UAT-PLAN.md?raw'
import azureSetup from '../../docs/azure-devops-connection.md?raw'
import projectPlan from '../../docs/PROJECT-PLAN.md?raw'
import validationPackage from '../../docs/VALIDATION-PACKAGE.md?raw'
import traceability from '../../docs/TRACEABILITY-MATRIX.md?raw'
import knownIssues from '../../docs/KNOWN-ISSUES.md?raw'
import components from '../../docs/SOFTWARE-COMPONENTS.md?raw'
import security from '../../docs/SECURITY-ASSESSMENT.md?raw'
import dfmea from '../../docs/DFMEA.md?raw'
import process from '../../docs/DEVELOPMENT-PROCESS.md?raw'
import cpReporting from '../../docs/CP_Release_Reporting_Implementation.md?raw'

export interface ProjectDoc { file: string; label: string; source: string }
export const projectDocs: ProjectDoc[] = [
  { file: 'VALIDATION-PACKAGE.md', label: 'Validation package', source: validationPackage },
  { file: 'REQUIREMENTS-SPECIFICATION.md', label: 'Requirements', source: requirements },
  { file: 'TRACEABILITY-MATRIX.md', label: 'Traceability matrix', source: traceability },
  { file: 'TEST-PLAN.md', label: 'Test plan', source: testPlan },
  { file: 'VERIFICATION-PLAN.md', label: 'Verification plan', source: verification },
  { file: 'UAT-PLAN.md', label: 'UAT plan', source: uat },
  { file: 'azure-devops-connection.md', label: 'Azure DevOps setup', source: azureSetup },
  { file: 'KNOWN-ISSUES.md', label: 'Known issues', source: knownIssues },
  { file: 'SOFTWARE-COMPONENTS.md', label: 'Software components', source: components },
  { file: 'SECURITY-ASSESSMENT.md', label: 'Security assessment', source: security },
  { file: 'DFMEA.md', label: 'DFMEA', source: dfmea },
  { file: 'DEVELOPMENT-PROCESS.md', label: 'Development process', source: process },
  { file: 'PROJECT-PLAN.md', label: 'Project plan', source: projectPlan },
  { file: 'CP_Release_Reporting_Implementation.md', label: 'CP release reporting brief', source: cpReporting },
]
