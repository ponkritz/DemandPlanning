// CAP-55: a typed utilization formula, as in Excel — "=([Project work] + [Training]) / ([Funded Hours] - [Absence]) * 100".
// Figures in [square brackets], numbers, + - * / and ( ), comparisons > < >= <= = <> (true 1, false 0) and MAX, MIN,
// ROUND, IF. Read by a small parser (never eval); a division by 0 or a missing figure gives blank (null), not an error.

export const formulaFigures = [
  ['Project work', 'Hours on project Tasks (Completed Work; planned: the profile’s planned source)'],
  ['Absence', 'The profile’s leave kinds and shared holidays, as deducted from capacity'],
  ['Training', 'Training hours'],
  ['Other NPRA', 'Other NPRA-tagged hours'],
  ['Common activities', 'Shared activities such as PI Planning'],
  ['Funded Hours', 'Working days employed × hours per day (or the profile’s fixed hours)'],
  ['Standard Hours', 'The Standard Hours breakup (Settings)'],
  ['Working days', 'Mon–Fri days employed in the month'],
  ['Hours per day', 'Funded hours per day (Settings)'],
] as const
export type FormulaFigure = typeof formulaFigures[number][0]
export const formulaFunctions = ['MAX', 'MIN', 'ROUND', 'IF'] as const
export const maxFormulaLength = 1000
type Token = { type: 'num'; value: number; text: string } | { type: 'term'; value: string } | { type: 'fn'; value: string } | { type: 'op'; value: string }

export function tokenize(text: string): Token[] {
  const src = text.trim().replace(/^=/, '')
  if (src.length > maxFormulaLength) throw new Error(`The formula is longer than ${maxFormulaLength} characters.`)
  const tokens: Token[] = []
  let at = 0
  while (at < src.length) {
    const c = src[at]
    if (/\s/.test(c)) { at++; continue }
    if (c === '[') {
      const end = src.indexOf(']', at)
      if (end < 0) throw new Error('A [ has no closing ].')
      tokens.push({ type: 'term', value: src.slice(at + 1, end).trim() }); at = end + 1; continue
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(at))
    if (num) { tokens.push({ type: 'num', value: Number(num[0]), text: num[0] }); at += num[0].length; continue }
    const word = /^[A-Za-z]+/.exec(src.slice(at))
    if (word) { tokens.push({ type: 'fn', value: word[0].toUpperCase() }); at += word[0].length; continue }
    const two = src.slice(at, at + 2)
    if (two === '>=' || two === '<=' || two === '<>') { tokens.push({ type: 'op', value: two }); at += 2; continue }
    if ('+-*/()<>=,'.includes(c)) { tokens.push({ type: 'op', value: c }); at++; continue }
    throw new Error(`“${c}” is not allowed in a formula.`)
  }
  return tokens
}

const known = new Map(formulaFigures.map(([name]) => [name.toLowerCase(), name as FormulaFigure]))
// Evaluates the formula with each figure's hours; throws a plain message for a formula that is not valid.
export function evaluateFormula(text: string, values: Partial<Record<FormulaFigure, number | null>>): { value: number | null; used: FormulaFigure[] } {
  const tokens = tokenize(text)
  const used: FormulaFigure[] = []
  let pos = 0
  const peek = () => tokens[pos]
  const take = (value: string) => { const token = tokens[pos]; if (!token || token.value !== value) throw new Error(value === ')' ? 'A ( is not closed.' : `Expected “${value}”.`); pos++ }
  const finite = (value: number | null) => value == null || !Number.isFinite(value) ? null : value
  const primary = (): number | null => {
    const token = tokens[pos++]
    if (!token) throw new Error('The formula ends too early.')
    if (token.type === 'num') return token.value
    if (token.type === 'term') {
      const figure = known.get(token.value.toLowerCase())
      if (!figure) throw new Error(`[${token.value}] is not a figure (use ${formulaFigures.map(([name]) => `[${name}]`).join(', ')}).`)
      if (!used.includes(figure)) used.push(figure)
      return values[figure] ?? null
    }
    if (token.type === 'fn') {
      const name = token.value
      if (!(formulaFunctions as readonly string[]).includes(name)) throw new Error(`${name} is not a known function (MAX, MIN, ROUND, IF).`)
      take('(')
      const args = [compare()]
      while (peek()?.value === ',') { pos++; args.push(compare()) }
      take(')')
      if (name === 'IF') { if (args.length !== 3) throw new Error('IF needs 3 parts: IF(test, then, else).'); return args[0] ? args[1] : args[2] }
      if (name === 'ROUND') { if (args.length !== 2) throw new Error('ROUND needs 2 parts: ROUND(number, digits).'); const factor = 10 ** (args[1] ?? 0); return args[0] == null ? null : Math.round(args[0] * factor) / factor }
      if (args.length < 2) throw new Error(`${name} needs at least 2 parts.`)
      if (args.some((arg) => arg == null)) return null
      return name === 'MAX' ? Math.max(...args as number[]) : Math.min(...args as number[])
    }
    if (token.value === '(') { const value = compare(); take(')'); return value }
    if (token.value === ')') throw new Error('A ) has no opening (.')
    throw new Error(`“${token.value}” is not expected here.`)
  }
  const unary = (): number | null => { if (peek()?.value === '-') { pos++; const value = unary(); return value == null ? null : -value } if (peek()?.value === '+') pos++; return primary() }
  const product = (): number | null => {
    let value = unary()
    while (peek()?.value === '*' || peek()?.value === '/') {
      const op = tokens[pos++].value, right = unary()
      value = value == null || right == null ? null : op === '*' ? value * right : right === 0 ? null : value / right
    }
    return value
  }
  const sum = (): number | null => {
    let value = product()
    while (peek()?.value === '+' || peek()?.value === '-') {
      const op = tokens[pos++].value, right = product()
      value = value == null || right == null ? null : op === '+' ? value + right : value - right
    }
    return value
  }
  const compare = (): number | null => {
    const left = sum(), token = peek()
    if (token && ['>', '<', '>=', '<=', '=', '<>'].includes(String(token.value))) {
      pos++; const right = sum()
      if (left == null || right == null) return null
      return ({ '>': left > right, '<': left < right, '>=': left >= right, '<=': left <= right, '=': left === right, '<>': left !== right } as Record<string, boolean>)[String(token.value)] ? 1 : 0
    }
    return left
  }
  if (!tokens.length) throw new Error('Type a formula, e.g. =[Project work] / ([Funded Hours] - [Absence]) * 100')
  const value = compare()
  if (pos < tokens.length) throw new Error(tokens[pos].value === ')' ? 'A ) has no opening (.' : `“${tokens[pos].value}” is not expected here.`)
  if (!used.length) throw new Error('Use at least one figure, e.g. [Project work].')
  return { value: finite(value), used }
}

// The check the editor shows as you type: valid with the figures it uses, or the problem.
export function checkFormula(text: string): { ok: true; used: FormulaFigure[] } | { ok: false; error: string } {
  try { return { ok: true, used: evaluateFormula(text, {}).used } } catch (failure) { return { ok: false, error: failure instanceof Error ? failure.message : String(failure) } }
}

// The tick-box formula (CAP-54) of a profile, written as a typed formula: the starting point of "Type the formula".
export function formulaFromParts(top: string[], deducted: string[], standardHours: boolean) {
  const figure = (name: string) => `[${name}]`
  const bottom = ['[Funded Hours]', ...(standardHours ? ['[Standard Hours]'] : []), ...deducted.map(figure)].join(' - ')
  return `=(${top.map(figure).join(' + ') || '0'}) / (${bottom}) * 100`
}
