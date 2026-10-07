// The pane's rules as pure functions, so a test reaches them without the pane.

const STALE_HOURS = 24

export type RunLine = { text: string; isStale: boolean }

/**
 * The line under a claimed issue, first match wins: a claim older than a day with no PR closing it is stale, unless
 * the issue closes without a PR (`expectsPr: false`); a matching ship worktree names the run; with neither and no PR,
 * the claim's age. A claim with a PR and no worktree has no line, since its row already says `in PR #N`.
 */
export function runLine(run: { claimedAt?: string; now: string; hasPr: boolean; expectsPr?: boolean; worktree?: string }): RunLine | null {
  const hours = run.claimedAt === undefined ? undefined : (Date.parse(run.now) - Date.parse(run.claimedAt)) / 3_600_000
  const age = hours === undefined ? '' : hours < 24 ? ` ${Math.floor(hours)}h ago` : ` ${Math.floor(hours / 24)}d ago`
  const expectsPr = run.expectsPr ?? true
  if (expectsPr && !run.hasPr && hours !== undefined && hours > STALE_HOURS) {
    return { text: `✗ stale claim: claimed${age}, no PR`, isStale: true }
  }
  if (run.worktree !== undefined) return { text: `◐ ship worktree ${run.worktree}`, isStale: false }
  if (run.hasPr) return null
  return { text: `◐ claimed${age}${expectsPr ? ', no PR yet' : ''}`, isStale: false }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The issue a worktree belongs to under `layout`, a path relative to the main checkout's parent folder in which
 * `{repo}` is the main checkout's folder name, `{slug}` any one path segment and `{n}` the issue number.
 */
export function worktreeIssue(layout: string, main: string, path: string): number | undefined {
  const parent = main.slice(0, main.lastIndexOf('/') + 1)
  if (!path.startsWith(parent)) return undefined
  const repo = main.slice(parent.length)
  const pattern = layout
    .split(/(\{repo\}|\{slug\}|\{n\})/)
    .map(part => (part === '{repo}' ? escape(repo) : part === '{slug}' ? '[^/]+' : part === '{n}' ? '(\\d+)' : escape(part)))
    .join('')
  const n = new RegExp(`^${pattern}$`).exec(path.slice(parent.length))?.[1]
  return n === undefined ? undefined : Number(n)
}

/** The issues a PR body closes, by GitHub's closing keywords on a same-repo `#N`. */
export const closesOf = (body: string): number[] =>
  [...body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi)].map(m => Number(m[1]))

/** A template with each `{key}` replaced by its value. */
export const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (Object.hasOwn(values, key) ? String(values[key]) : whole))

/** The PR a merge-gate or merged answer names: the number in its first `/pull/<N>`, when the answer carries `text`. */
export function gatePr(answer: string, text: string): number | undefined {
  const n = answer.includes(text) ? /\/pull\/(\d+)/.exec(answer)?.[1] : undefined
  return n === undefined ? undefined : Number(n)
}

/** A slash command's name and args, or undefined for text that is no command. */
export function commandOf(text: string): { command: string; args: string } | undefined {
  const match = /^\/(\S+)(?:\s+(.*))?$/s.exec(text.trim())
  return match === null ? undefined : { command: match[1]!, args: match[2] ?? '' }
}
