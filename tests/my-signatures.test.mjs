import test from 'node:test'
import assert from 'node:assert/strict'
import { azureSignatures, isSignatureField, namesSigner, signatureDateFor, signedInPeriod, windchillSignatures } from '../src/mySignatures.ts'

const signer = { names: ['Ana Costa', 'Costa, Ana'], email: 'ana@x.com' }
const base = { organization: 'org', project: 'P', state: 'Closed', assignedTo: '', areaPath: 'P', iterationPath: 'P', tags: '', url: 'u', syncedAt: '' }
const doc = (id, title, fields, extra = {}) => ({ ...base, key: `k${id}`, id, workItemType: 'Document', title, fields, ...extra })

test('MYD-13: signature fields are Author, Reviewer or Approver names — not their dates, functions or roles (TC-MYD-06)', () => {
  for (const name of ['Author', 'Reviewer 2', 'ApproverName7', 'Custom.ApproverName12', 'Approver']) assert.equal(isSignatureField(name), true, name)
  for (const name of ['Author Approval Date', 'ApproverFunction7', 'ApproverApprovalDate7', 'Reviewer Role', 'Title']) assert.equal(isSignatureField(name), false, name)
  assert.equal(namesSigner('Costa, Ana; Ben Okafor', signer), true, 'name words in any order, one of several')
  assert.equal(namesSigner('Ana Costa-Silva', { names: ['Ana Costa'] }), false, 'a different name is not mine')
  assert.equal(namesSigner('ANA@X.COM', signer), true, 'work email, case ignored')
  assert.equal(signatureDateFor({ ApproverName7: 'Ana Costa', ApproverApprovalDate7: '2026-10-03T10:00:00Z', ApproverApprovalDate17: '2026-01-01' }, 'ApproverName7'), '2026-10-03T10:00:00Z', 'the date of the same slot')
  assert.equal(signatureDateFor({ Author: 'Ana Costa', 'Author Approval Date': '2026-09-01' }, 'Author'), '2026-09-01')
})

test('MYD-13: documents and releases I signed per stream in a from–to period; a release counts once (TC-MYD-06)', () => {
  const items = [
    doc(1, 'ABC_RELEASE_IFU', { ApproverName3: 'Ana Costa', ApproverApprovalDate3: '2026-10-05' }),
    doc(2, 'ABC_RELEASE_SRS', { Author: 'Costa, Ana', 'Author Approval Date': '2026-11-02' }),
    doc(3, 'XYZ_RELEASE_SRS', { Reviewer: 'Ben Okafor' }, { approvalDate: '2026-10-09' }),
    doc(4, 'OLD_RELEASE_SRS', { Approver: 'Ana Costa' }, { approvalDate: '2025-01-09' }),
    doc(5, 'NODATE_RELEASE_X', { Approver: 'Ana Costa' }),
  ]
  const signed = azureSignatures(items, 'Content', signer, 'title', [{ label: '', pattern: '{*_RELEASE}*' }], 'UTC')
  assert.deepEqual(signed.map((entry) => [entry.id, entry.release, entry.month]), [[1, 'ABC_RELEASE', '2026-10'], [2, 'ABC_RELEASE', '2026-11'], [4, 'OLD_RELEASE', '2025-01'], [5, 'NODATE_RELEASE', undefined]])
  const period = signedInPeriod(signed, '2026-10', '2026-11', ['Content', 'S&S IT'])
  assert.deepEqual(period.streams.map((row) => [row.stream, row.releases, row.documents]), [['Content', 1, 2], ['S&S IT', 0, 0]])
  assert.equal(period.undated, 1, 'a document without a date is counted in no period')
  assert.deepEqual([signedInPeriod(signed, '2026-11', '2026-10', ['Content']).total.documents], [2], 'from and to in either order')
})

test('MYD-13: a Windchill export counts the documents I signed by its Author / Reviewer / Approver columns (TC-MYD-06)', () => {
  const columns = ['Name', 'Location', 'Approver', 'Last Modified']
  const rows = [
    { Name: 'Remote Diagnostics 1.6 Test Plan', Location: '/Products/Remote Diagnostics 1.6/DHF', Approver: 'Costa, Ana', 'Last Modified': '2026-10-21' },
    { Name: 'Remote Diagnostics 1.6 SRS', Location: '/Products/Remote Diagnostics 1.6/DHF', Approver: 'Ben Okafor', 'Last Modified': '2026-10-22' },
  ]
  const signed = windchillSignatures(rows, columns, 'S&S IT', signer)
  assert.equal(signed.length, 1)
  assert.equal(signed[0].month, '2026-10')
  assert.match(signed[0].release, /Remote Diagnostics 1\.6/)
  assert.deepEqual(windchillSignatures(rows, ['Name', 'Location'], 'S&S IT', signer), [], 'no signature column, nothing counted')
})
