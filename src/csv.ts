// CSV cells for every export. A value that a spreadsheet would run as a formula (starting with =, @, a tab or a
// carriage return, or with + / − when it is not a plain number) is prefixed with an apostrophe so Excel shows it as
// text; then the cell is quoted when it holds a quote, comma or line break.
const formulaLike = /^[\t\r=@]|^[+-](?![\d.,\s]*$)/
export const csvSafe = (value: unknown) => { const text = String(value ?? ''); return formulaLike.test(text) ? `'${text}` : text }
export const csvCell = (value: unknown) => { const text = csvSafe(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text }
