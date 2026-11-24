// The project documents shown on the Documentation page. They are bundled from docs/ at build time, so the page always
// shows the documents of the running build. The user guide comes first (DOC-12).
import userGuide from '../../docs/USER-GUIDE.md?raw'
import requirements from '../../docs/REQUIREMENTS-SPECIFICATION.md?raw'
import testPlan from '../../docs/TEST-PLAN.md?raw'
import verification from '../../docs/VERIFICATION-PLAN.md?raw'
import uat from '../../docs/UAT-PLAN.md?raw'
import azureSetup from '../../docs/azure-devops-connection.md?raw'
import projectPlan from '../../docs/PROJECT-PLAN.md?raw'
import codeReviewBacklog from '../../docs/CODE-REVIEW-BACKLOG.md?raw'
import uiStandards from '../../docs/UI-STANDARDS.md?raw'
import validationPackage from '../../docs/VALIDATION-PACKAGE.md?raw'
import traceability from '../../docs/TRACEABILITY-MATRIX.md?raw'
import knownIssues from '../../docs/KNOWN-ISSUES.md?raw'
import components from '../../docs/SOFTWARE-COMPONENTS.md?raw'
import swbom from '../../docs/SWBOM.md?raw'
import security from '../../docs/SECURITY-ASSESSMENT.md?raw'
import dfmea from '../../docs/DFMEA.md?raw'
import process from '../../docs/DEVELOPMENT-PROCESS.md?raw'
import cpReporting from '../../docs/CP_Release_Reporting_Implementation.md?raw'
import releaseNotes from '../../docs/RELEASE-NOTES.md?raw'
import configuration from '../../docs/CONFIGURATION-MANAGEMENT.md?raw'
import { plainText } from '../markdown'

export interface ProjectDoc { file: string; label: string; source: string }

export const designIndex = 'design/README.md'
export const designDocs: ProjectDoc[] = Object.entries(
  import.meta.glob<string>('../../docs/design/**/*.md', { eager: true, query: '?raw', import: 'default' }),
).map(([path, source]) => {
  const file = path.slice('../../docs/'.length)
  const title = /^#\s+(.+)$/m.exec(source)?.[1].trim()
  return { file, label: title ? plainText(title) : file, source }
}).sort((left, right) => left.file.localeCompare(right.file))

export const projectDocs: ProjectDoc[] = [
  { file: 'USER-GUIDE.md', label: 'User guide', source: userGuide },
  { file: 'VALIDATION-PACKAGE.md', label: 'Validation package', source: validationPackage },
  { file: 'RELEASE-NOTES.md', label: 'Release notes', source: releaseNotes },
  { file: 'REQUIREMENTS-SPECIFICATION.md', label: 'Requirements', source: requirements },
  { file: 'TRACEABILITY-MATRIX.md', label: 'Traceability matrix', source: traceability },
  { file: 'TEST-PLAN.md', label: 'Test plan', source: testPlan },
  { file: 'VERIFICATION-PLAN.md', label: 'Verification plan', source: verification },
  { file: 'UAT-PLAN.md', label: 'UAT plan', source: uat },
  { file: 'azure-devops-connection.md', label: 'Azure DevOps setup', source: azureSetup },
  { file: 'KNOWN-ISSUES.md', label: 'Known issues', source: knownIssues },
  { file: 'SOFTWARE-COMPONENTS.md', label: 'Software components', source: components },
  { file: 'SWBOM.md', label: 'SWBOM', source: swbom },
  { file: 'SECURITY-ASSESSMENT.md', label: 'Security assessment', source: security },
  { file: 'DFMEA.md', label: 'DFMEA', source: dfmea },
  { file: 'DEVELOPMENT-PROCESS.md', label: 'Development process', source: process },
  { file: 'CONFIGURATION-MANAGEMENT.md', label: 'Configuration management', source: configuration },
  { file: 'PROJECT-PLAN.md', label: 'Project plan', source: projectPlan },
  { file: 'CODE-REVIEW-BACKLOG.md', label: 'Code review backlog', source: codeReviewBacklog },
  { file: 'UI-STANDARDS.md', label: 'UI standards', source: uiStandards },
  { file: 'CP_Release_Reporting_Implementation.md', label: 'CP release reporting brief', source: cpReporting },
]

// DOC-13: the user guide's screenshots, clips and their posters, bundled as files of this build (served from the app's
// own origin, or inlined as data: when tiny) — a document can never make the page load an image or video from elsewhere.
// Paths are as the documents write them, relative to docs/ (e.g. "user-guide/images/home.png").
const mediaFiles = import.meta.glob(['../../docs/user-guide/images/*.png', '../../docs/user-guide/media/*.webm', '../../docs/user-guide/media/*.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const docMedia = new Map(Object.entries(mediaFiles).map(([path, url]) => [path.replace('../../docs/', ''), url]))
export function mediaUrl(href: string): string | undefined {
  return docMedia.get(href.replace(/^\.\//, '').replace(/^docs\//, ''))
}
