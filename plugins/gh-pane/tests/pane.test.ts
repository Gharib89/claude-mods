import type { On } from 'claude-code'
import { type Engine, expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()

const PANE = {
  plugin: 'gh-pane',
  component: 'Pane',
  requestId: 'gh-pane',
  props: { title: 'gh-pane', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

type Raw = Record<string, unknown>
/** Label colours as GitHub answers them: hex without `#`; `blank` is a label whose colour reads empty. */
const COLORS: Record<string, string> = { bug: 'd73a4a', XL: '1d1d1d', wontfix: 'ffffff', docs: 'fbca04', blank: '' }
const issue = (number: number, labels: string[], extra: Raw = {}): Raw => ({
  number,
  title: `issue ${number}`,
  html_url: `https://github.com/acme/widgets/issues/${number}`,
  repository_url: 'https://api.github.com/repos/acme/widgets',
  labels: labels.map(name => ({ name, color: COLORS[name] ?? 'ededed' })),
  assignees: [],
  updated_at: ago(3),
  comments: 0,
  milestone: null,
  body: '',
  ...extra,
})
const assigned = (login: string, hours: number) => ({ assignees: [{ login }], claimedHoursAgo: hours })

/** A repo shaped like a working backlog: one spec tree, claims in every run state, a PR and two waiting lists. */
const BACKLOG: Raw[] = [
  issue(20, ['ready-for-human'], { sub_issues_summary: { total: 4, completed: 1 } }),
  issue(24, ['ready-for-agent'], assigned('ann', 5)),
  issue(25, ['ready-for-agent'], { issue_dependencies_summary: { blocked_by: 2 } }),
  issue(27, ['ready-for-agent'], { sub_issues_summary: { total: 1, completed: 0 } }),
  issue(29, ['ready-for-human']),
  issue(22, ['ready-for-agent'], assigned('ann', 2)),
  issue(35, ['ready-for-agent'], assigned('bob', 72)),
  issue(36, ['ready-for-agent'], assigned('ann', 72)),
  issue(32, ['needs-triage']),
  issue(33, ['needs-triage']),
  issue(19, ['needs-info'], assigned('bob', 72)),
  issue(40, ['needs-info'], { sub_issues_summary: { total: 1, completed: 0 } }),
  issue(41, ['needs-triage']),
  { ...issue(31, []), pull_request: {}, html_url: 'https://github.com/acme/widgets/pull/31', body: 'Closes #36' },
]

/** An issue as a sub-issue or blocker list answers it, in its own repo. */
const linked = (number: number, state: string, repo = 'acme/widgets') => ({
  number,
  state,
  html_url: `https://github.com/${repo}/issues/${number}`,
  repository_url: `https://api.github.com/repos/${repo}`,
})

/** A PR head's check runs, as the check-runs read answers them. */
const checks = (...runs: [status: string, conclusion: string | null][]) => ({
  total_count: runs.length,
  check_runs: runs.map(([status, conclusion]) => ({ status, conclusion })),
})
const checksOf = (pr: number) => `repos/{owner}/{repo}/commits/refs/pull/${pr}/head/check-runs?per_page=100`
/** The issues list's first page, as the mod reads it. */
const ISSUES = 'repos/{owner}/{repo}/issues?state=open&per_page=100'
/** The repo read only an empty backlog makes, for its name. */
const REPO_LOOKUP = ['gh', 'api', 'repos/{owner}/{repo}', '--jq', '.full_name']

const API: Record<string, unknown[]> = {
  'repos/acme/widgets/issues/20/sub_issues?per_page=100': [
    linked(23, 'closed'),
    linked(24, 'open'),
    linked(25, 'open'),
    linked(27, 'open'),
    // Another repo's #32: the local #32 stays in the triage list.
    linked(32, 'open', 'acme/other'),
  ],
  'repos/acme/widgets/issues/27/sub_issues?per_page=100': [linked(29, 'open')],
  'repos/acme/widgets/issues/40/sub_issues?per_page=100': [linked(41, 'open')],
  'repos/acme/widgets/issues/25/dependencies/blocked_by': [linked(24, 'open'), linked(9, 'closed'), linked(5, 'open', 'acme/infra')],
  // The map tests' trees.
  'repos/acme/widgets/issues/14/sub_issues?per_page=100': [linked(15, 'open')],
  'repos/acme/widgets/issues/7/sub_issues?per_page=100': [linked(10, 'open'), linked(11, 'open')],
  'repos/acme/widgets/issues/4/sub_issues?per_page=100': [linked(6, 'open'), linked(7, 'open'), linked(8, 'open'), linked(9, 'open')],
  'repos/acme/widgets/issues/9/dependencies/blocked_by': [linked(6, 'open')],
  'repos/acme/widgets/issues/3/dependencies/blocked_by': [linked(9, 'open')],
  // The order test's tree: its sub-issues in the parent's order, newest first.
  'repos/acme/widgets/issues/60/sub_issues?per_page=100': [linked(62, 'open'), linked(61, 'open')],
}

const PORCELAIN = [
  'worktree /w/widgets\nHEAD 1\nbranch refs/heads/main',
  'worktree /w/widgets.worktrees/resume-22\nHEAD 2\nbranch refs/heads/fix/resume-22',
  'worktree /w/wt/9\nHEAD 3\nbranch refs/heads/feat/9',
].join('\n\n')

type Host = {
  issues?: Raw[]
  ghFails?: string
  ghMissing?: boolean
  isOffGitHub?: boolean
  openFails?: string
  isSubmitBroken?: boolean
  pullFails?: string
  /** Each PR's check runs; a PR left out has none. */
  ci?: Record<number, ReturnType<typeof checks>>
  checksFail?: string
  /** How many items one page of a list read holds; every list and check-runs read spans pages of this size. */
  perPage?: number
}

const ORIGIN = 'https://api.github.com/'
// Any short digest will do: an ETag only has to change when its page does.
const etagOf = (body: string) => `W/"${[...body].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16)}"`

/**
 * What `gh api -i [-H 'If-None-Match: <etag>'] <path>` prints for one page of `items`: as gh 2.103 does, the status
 * line, CRLF headers with the ETag and, past the first page, a `Link: rel="next"` to the absolute URL of the next
 * page; then a blank line and the body. A matching ETag answers 304 with no Link and no body, exiting 1.
 */
function page(path: string, items: unknown[], perPage: number, etag: string | undefined, toPage = (chunk: unknown[]): unknown => chunk) {
  const [base = path, n = '1'] = path.split(/[?&]page=/)
  const at = Number(n)
  const body = JSON.stringify(toPage(items.slice((at - 1) * perPage, at * perPage)))
  const tag = etagOf(body)
  if (etag === tag) return { exitCode: 1, stdout: `HTTP/2.0 304 Not Modified\nEtag: ${tag.slice(2)}\r\n\r\n`, stderr: 'gh: HTTP 304\n' }
  const next = at * perPage < items.length ? `Link: <${ORIGIN}${base}${base.includes('?') ? '&' : '?'}page=${at + 1}>; rel="next"\r\n` : ''
  return { exitCode: 0, stdout: `HTTP/2.0 200 OK\nContent-Type: application/json; charset=utf-8\r\nEtag: ${tag}\r\n${next}\r\n${body}`, stderr: '' }
}

/**
 * Stubs git and gh behind `$.process.run`; answers every argv it saw in `calls`. The issues list's first page, read
 * number `backlog.failsAt`, fails. `fixture.issues` is what the next read lists, `pulls` which PRs read as merged; `sent`
 * and `ran` are the prompts and the commands the mod submitted or ran, `typed` the prompts a person typed.
 */
function host(on: On, { issues = BACKLOG, ghFails, ghMissing, isOffGitHub, openFails, isSubmitBroken, pullFails, ci = {}, checksFail, perPage = 100 }: Host = {}) {
  const calls: string[][] = []
  const fixture = { issues }
  const pulls: Record<number, boolean> = {}
  const sent: { text: string; asUser: boolean }[] = []
  const typed: string[] = []
  const ran: { command: string; args: string }[] = []
  const filled: string[] = []
  const clock = mock.clock(on, { now: NOW })
  const panes = { isOpen: false, isBroken: false }
  const toasts: string[] = []
  // `held.until`: what each read of the issues list's first page waits on before it answers.
  const backlog = { reads: 0, failsAt: 0, held: { until: Promise.resolve() } }
  /** The calls answered 304 Not Modified. */
  const unchanged: string[][] = []
  on('process.run', async (_$, e, next) => {
    calls.push([...e.argv])
    const [cmd, sub, ...rest] = e.argv
    const answer = (out: { exitCode: number; stdout: string; stderr: string }) => {
      if (out.stdout.startsWith('HTTP/2.0 304')) unchanged.push([...e.argv])
      return { value: { ...out, isStdoutTruncated: false, isStderrTruncated: false } }
    }
    const ok = (stdout: string) => answer({ exitCode: 0, stdout, stderr: '' })
    const fail = (stderr: string) => answer({ exitCode: 1, stdout: '', stderr })
    if (cmd === 'git' && sub === 'worktree') return ok(`${PORCELAIN}\n`)
    // Nothing beneath answers, so $.process.run rejects as it does for a command that cannot start.
    if (ghMissing) return next(e)
    if (ghFails !== undefined) return fail(`${ghFails}\nmore detail\n`)
    // gh 2.46's own words: --slurp came in gh 2.48.
    if (rest.includes('--slurp')) return fail('unknown flag: --slurp\n\nUsage:  gh api <endpoint> [flags]\n')
    const target = rest.find(arg => arg.startsWith('repos/') || arg.startsWith(ORIGIN))!
    // gh's own words when no remote of the checkout is on a GitHub host.
    if (isOffGitHub && target.includes('{owner}/{repo}')) {
      return fail('unable to expand placeholder in path: none of the git remotes configured for this repository point to a known GitHub host.\n')
    }
    const path = target.replace(ORIGIN, '').replace('{owner}/{repo}', 'acme/widgets')
    if (path === 'repos/acme/widgets') return ok('acme/widgets\n')
    const pull = /^repos\/acme\/widgets\/pulls\/(\d+)$/.exec(path)
    if (pull) return pullFails === undefined ? ok(`${pulls[Number(pull[1])] ?? false}\n`) : fail(pullFails)
    const header = rest[rest.indexOf('-H') + 1] ?? ''
    const etag = header.startsWith('If-None-Match: ') ? header.slice('If-None-Match: '.length) : undefined
    const events = /issues\/(\d+)\/events/.exec(path)
    if (events) {
      const hours = fixture.issues.find(i => i.number === Number(events[1]))?.claimedHoursAgo as number
      return answer(page(path, [{ event: 'labeled', created_at: ago(200) }, { event: 'assigned', created_at: ago(hours) }], perPage, etag))
    }
    const base = path.split(/[?&]page=/)[0]!
    if (base === 'repos/acme/widgets/issues?state=open&per_page=100') {
      if (base === path && ++backlog.reads === backlog.failsAt) return fail('gh: HTTP 401: Bad credentials\n')
      if (base === path) await backlog.held.until
      return answer(page(path, fixture.issues, perPage, etag))
    }
    const runs = /commits\/refs\/pull\/(\d+)\/head\/check-runs/.exec(path)
    if (runs) {
      if (checksFail !== undefined) return fail(`${checksFail}\n`)
      const all = (ci[Number(runs[1])] ?? checks()).check_runs
      return answer(page(path, all, perPage, etag, chunk => ({ total_count: all.length, check_runs: chunk })))
    }
    return answer(page(path, API[base] ?? [], perPage, etag))
  })
  const opened: string[] = []
  const closed: string[] = []
  on('ui.open', async (_$, e) => {
    if (openFails !== undefined) return { deny: openFails }
    opened.push(`${e.id} titled ${e.title}`)
    panes.isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    panes.isOpen = false
    return { value: undefined }
  })
  const folder = { cwd: '/w/widgets' }
  on('session.cwd', () => ({ value: folder.cwd }))
  // Nothing else draws above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' as const }))
  // Broken, nothing beneath answers, so $.ui.panes rejects.
  on('ui.panes', async (_$, e, next) =>
    panes.isBroken
      ? next(e)
      : { value: panes.isOpen ? [{ id: 'gh-pane', title: 'gh-pane', isShown: true, isFocused: false, isPlaced: true }] : [] },
  )
  on('prompt.read', async () => ({ value: { text: '', cursor: 0 } }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', async (_$, e) => {
    filled.push(e.text)
    return { isFilled: true, box: { text: e.text, cursor: e.text.length } }
  })
  // The bottom of `prompt.submit` and `command.run`: a person's typed prompt, the mod's own, and the commands it runs.
  // Broken, nothing beneath answers, so `$.prompt.submit` rejects as it does when the engine cannot send.
  if (!isSubmitBroken) on('prompt.submit', async (_$, e) => {
    if (e.origin.kind === 'plugin') sent.push({ text: e.text, asUser: e.origin.asUser === true })
    else typed.push(e.text)
    return { text: e.text }
  })
  on('command.run', async (_$, e) => {
    ran.push({ command: e.command, args: e.args })
    return { text: '' }
  })
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  return { calls, unchanged, filled, clock, panes, backlog, toasts, opened, closed, folder, fixture, pulls, sent, typed, ran }
}

type Mounted = Pick<Awaited<ReturnType<Engine['ui']['mount']>>, 'find'>
type Drawn = { type: string; props: Record<string, unknown>; children?: unknown[] }
const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : (node as Drawn).type === 'Link' ? String((node as Drawn).props.label) : ((node as Drawn).children ?? []).map(textOf).join('')
/** What the Box keyed `key` draws: one [text, colour] per Text holding no Text, in order; a chip's colour reads `<ink> on <background>`. */
async function spans(ui: Mounted, key: string): Promise<[string, string][]> {
  const walk = (node: unknown): [string, string][] => {
    if (typeof node === 'string') return []
    const { type, props, children = [] } = node as Drawn
    if (type !== 'Text' || children.some(child => (child as Drawn).type === 'Text')) return children.flatMap(walk)
    const color = String(props.color ?? '')
    return [[textOf(node), props.backgroundColor === undefined ? color : `${color} on ${String(props.backgroundColor)}`]]
  }
  const found = await ui.find({ key })
  return found === undefined ? [] : walk(found)
}

const open = ($: Engine) =>
  $.command.run({ command: 'gh-pane', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

test('the pane orders the backlog and each button fills its command', async ($, on) => {
  const { calls, filled } = host(on)
  await open($)

  for (const surface of ['terminal', 'desktop'] as const) {
    filled.length = 0
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ text: 'PR cap 1/3 · ready now: 1 · runs: 2 active · 2 stale' })).toBeDefined()
    expect(await ui.find({ text: '1/4' })).toBeDefined()
    // A tree's root reads `•`, as a lone row does: `▾` means expanded.
    expect((await spans(ui, 'row-20'))[0]).toEqual(['•', ''])
    expect(await ui.find({ text: /✓ 1 done/ })).toBeDefined()
    expect(await ui.find({ text: /^blocked by #24, acme\/infra#5$/ })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: 'acme/infra#5' }))?.props.href).toBe('https://github.com/acme/infra/issues/5')
    expect(await ui.find({ text: 'in PR #31' })).toBeDefined()
    expect(await ui.find({ text: 'claimed (ann)' })).toBeDefined()
    expect(await ui.find({ text: 'yours' })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: '#24' }))?.props.href).toBe('https://github.com/acme/widgets/issues/24')
    expect((await ui.find({ type: 'Link', text: '#31' }))?.props.href).toBe('https://github.com/acme/widgets/pull/31')

    expect(await ui.find({ text: /◐ claimed 5h ago, no PR yet/ })).toBeDefined()
    expect(await ui.find({ text: /◐ ship worktree resume-22/ })).toBeDefined()
    expect(await ui.find({ text: /✗ stale claim: claimed 3d ago, no PR/ })).toBeDefined()
    // Not stale: under a day (#24, #22), or a PR closes it (#36).
    for (const n of [24, 22, 36]) expect(await ui.find({ key: `release-${n}` })).toBeUndefined()
    expect(await ui.find({ key: 'ship-24' })).toBeUndefined()

    expect(await ui.find({ text: /needs triage \(2\)/ })).toBeDefined()
    expect(await ui.find({ text: /needs info \(1\)/ })).toBeDefined()
    expect(await ui.find({ key: 'triage-19' })).toBeUndefined()
    // A waiting row carries its run line: #19's claim is stale.
    expect(await ui.find({ key: 'release-19' })).toBeDefined()
    // Every level of a tree draws: #29 under #27 under #20, and #41 under the needs-info #40, triage button and all.
    expect(await ui.find({ type: 'Link', text: '#29' })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: '#40' })).toBeDefined()
    expect(await ui.find({ key: 'triage-41' })).toBeDefined()

    await ui.press({ key: 'ship-27' })
    await ui.press({ key: 'triage-32' })
    await ui.press({ key: 'triage-all' })
    await ui.press({ key: 'triage-41' })
    await ui.press({ key: 'release-35' })
    expect(filled).toEqual([
      '/ship 27',
      '/triage 32',
      '/triage #32, #33 one by one',
      '/triage 41',
      'Release the ship claim on #35: unassign bob and comment that the claim went stale with no PR.',
    ])
    await ui.unmount()
  }

  // REST only: every gh call is `gh api` on a REST path, none GraphQL.
  const gh = calls.filter(argv => argv[0] === 'gh')
  expect(gh.length).toBeGreaterThan(0)
  for (const argv of gh) {
    expect(argv[1]).toBe('api')
    expect(argv.join(' ')).not.toMatch(/graphql/i)
  }
})

test('the pane draws oldest first: roots and each waiting group by number, sub-issues in their parent\'s order', async ($, on) => {
  // Newest first, as GitHub lists open issues.
  host(on, {
    issues: [
      issue(62, ['ready-for-agent']),
      issue(61, ['ready-for-agent']),
      issue(60, [], { sub_issues_summary: { total: 2, completed: 0 } }),
      issue(55, ['needs-triage']),
      issue(54, ['needs-triage']),
      issue(53, ['needs-info']),
      issue(52, ['needs-info']),
      issue(51, ['ready-for-agent']),
      issue(50, ['ready-for-agent']),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = (await ui.findAll({ type: 'Box' })).flatMap(box => /^row-(\d+)$/.exec(box.key ?? '')?.[1] ?? []).map(Number)
  expect(rows).toEqual([50, 51, 60, 62, 61, 54, 55, 52, 53])
})

test('the pane follows a non-default userConfig', {
  options: {
    readyForAgentLabel: 'go',
    readyForHumanLabel: 'mine',
    needsTriageLabel: 'inbox',
    needsInfoLabel: 'hold',
    prCap: 5,
    worktreeLayout: 'wt/{n}',
    shipCommand: 'ship it {n}',
    triageCommand: '/look {issues}',
    releaseRequest: 'free #{n} from {user}',
    mapLabel: 'plan',
    mapCommand: 'walk {map}/{n}',
  },
}, async ($, on) => {
  const { filled } = host(on, {
    issues: [
      issue(7, ['go', 'bug']),
      issue(8, ['inbox']),
      issue(9, ['go'], assigned('ann', 1)),
      issue(10, ['ready-for-agent']),
      issue(11, ['hold']),
      issue(12, ['mine']),
      issue(13, ['go'], assigned('cat', 50)),
      issue(14, ['plan'], { sub_issues_summary: { total: 1, completed: 0 } }),
      issue(15, []),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'PR cap 0/5 · ready now: 2 · runs: 1 active · 1 stale' })).toBeDefined()
  expect(await ui.find({ text: /◐ ship worktree 9/ })).toBeDefined()
  expect(await ui.find({ text: /needs triage \(1\)/ })).toBeDefined()
  expect(await ui.find({ text: /needs info \(1\)/ })).toBeDefined()
  expect(await ui.find({ text: 'yours' })).toBeDefined()
  expect(await ui.find({ key: 'ship-10' })).toBeUndefined()
  // The state labels hidden are the configured ones: `go` hides, the default `ready-for-agent` shows.
  expect((await spans(ui, 'row-7')).filter(([text]) => text === '●')).toEqual([['●', '#d73a4a']])
  expect((await spans(ui, 'row-10')).filter(([text]) => text === '●')).toEqual([['●', '#ededed']])
  await ui.press({ key: 'ship-7' })
  await ui.press({ key: 'triage-8' })
  await ui.press({ key: 'release-13' })
  await ui.press({ key: 'next-15' })
  expect(filled).toEqual(['ship it 7', '/look 8', 'free #13 from cat', 'walk 14/15'])
})

test("a collapsed row shows one dot per label in the label's colour, the state labels left off", async ($, on) => {
  host(on, {
    issues: [
      issue(7, ['ready-for-agent', 'bug', 'XL', 'blank']),
      issue(8, ['needs-triage', 'needs-info', 'ready-for-human', 'wayfinder:map']),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const dots = async (n: number) => (await spans(ui, `row-${n}`)).filter(([text]) => text === '●')
  // A label with no colour (`blank`) still draws, in GitHub's own default grey; the state labels draw none.
  expect(await dots(7)).toEqual([
    ['●', '#d73a4a'],
    ['●', '#1d1d1d'],
    ['●', '#ededed'],
  ])
  expect(await dots(8)).toEqual([])
})

test('an in PR tag carries its check runs: ✓ green, ✗ red, ● running, nothing with no runs', async ($, on) => {
  const pr = (n: number, closes: string) => ({ ...issue(n, []), pull_request: {}, html_url: `https://github.com/acme/widgets/pull/${n}`, body: closes })
  const { calls } = host(on, {
    issues: [
      issue(3, []),
      issue(4, []),
      issue(5, []),
      issue(6, []),
      issue(7, []),
      pr(50, 'Closes #3, closes #7'),
      pr(51, 'Fixes #4'),
      pr(52, 'Resolves #5'),
      pr(53, 'Closes #6'),
      // Closes only an issue that is no longer open: no read.
      pr(54, 'Closes #99'),
    ],
    ci: {
      50: checks(['completed', 'success'], ['completed', 'skipped'], ['completed', 'neutral']),
      51: checks(['completed', 'success'], ['completed', 'failure']),
      52: checks(['completed', 'failure'], ['in_progress', null]),
    },
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // What follows the row's tag.
  const mark = async (n: number) => {
    const row = await spans(ui, `row-${n}`)
    return row[row.findIndex(([text]) => text.startsWith('in PR')) + 1]
  }
  expect(await mark(3)).toEqual(['✓', 'green'])
  expect(await mark(7)).toEqual(['✓', 'green'])
  expect(await mark(4)).toEqual(['✗', 'red'])
  expect(await mark(5)).toEqual(['●', 'yellow'])
  expect(await mark(6)).toBeUndefined()
  // One REST read per PR that closes an open issue, by the PR's head ref; none for #54.
  const reads = calls.filter(argv => argv.join(' ').includes('/check-runs')).map(argv => argv.find(arg => arg.startsWith('repos/')))
  expect(reads.sort()).toEqual([checksOf(50), checksOf(51), checksOf(52), checksOf(53)])
})

test('every list and check-runs read arrives whole when it spans several pages', async ($, on) => {
  // One item a page: each fact below sits on a page after the first.
  host(on, { perPage: 1, ci: { 31: checks(['completed', 'success'], ['completed', 'failure']) } })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // The backlog's last issue, #20's third sub-issue, #25's third blocker, #35's assignment event and #31's second run.
  expect(await ui.find({ key: 'row-41' })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: '#29' })).toBeDefined()
  expect(await ui.find({ text: /^blocked by #24, acme\/infra#5$/ })).toBeDefined()
  expect(await ui.find({ key: 'release-35' })).toBeDefined()
  const row = await spans(ui, 'row-36')
  expect(row[row.findIndex(([text]) => text.startsWith('in PR')) + 1]).toEqual(['✗', 'red'])
})

test('an unchanged second refresh makes the same calls, each conditional on its ETag and answered 304, and draws the same rows', async ($, on) => {
  const { calls, unchanged, clock } = host(on, { ci: { 31: checks(['completed', 'success']) } })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const rows = () => Promise.all(BACKLOG.map(raw => spans(ui, `row-${raw.number}`)))
  const drawn = await rows()
  // The issues list, the worktrees, 3 unfinished sub-issue lists (#20, #27, #40), 1 blocker list (#25), 5 claims'
  // events (#19, #22, #24, #35, #36) and the check runs of #31, the one PR closing an open issue.
  expect(calls.length).toBe(12)
  // The repo's name comes from the issues' repository_url: no repo lookup.
  expect(calls).not.toContainEqual(REPO_LOOKUP)
  const gh = calls.filter(argv => argv[0] === 'gh')
  // One page a call, never gh's own --paginate, which a 304 on the first page stops.
  for (const argv of gh) expect(argv.slice(0, 3)).toEqual(['gh', 'api', '-i'])
  expect(unchanged).toEqual([])

  calls.length = 0
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(calls.length).toBe(12)
  expect(unchanged.length).toBe(11)
  for (const argv of unchanged) expect(argv).toContainEqual(expect.stringMatching(/^If-None-Match: W\/"[0-9a-f]+"$/))
  expect(await rows()).toEqual(drawn)
})

test('a refresh that would draw what the pane shows writes no state; a new fact or a drawn age that moved writes it', async ($, on) => {
  // #50's claim turns a day old, and stale, a minute from now.
  const { clock, fixture } = host(on, { issues: [...BACKLOG, issue(50, ['ready-for-agent'], assigned('ann', 24 - 0.5 / 60))] })
  const writes: unknown[] = []
  on('state.set', { plugin: 'gh-pane', key: 'snapshot' }, async ($, e, next) => {
    writes.push(e.value)
    return next(e)
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(writes).toHaveLength(1)

  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(writes).toHaveLength(1)

  fixture.issues = fixture.issues.map(raw => (raw.number === 29 ? { ...raw, title: 'renamed' } : raw))
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(writes).toHaveLength(2)

  expect(await ui.find({ key: 'release-50' })).toBeUndefined()
  await clock.advance(60_000)
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(writes).toHaveLength(3)
  expect(await ui.find({ key: 'release-50' })).toBeDefined()
})

test('a failed check-runs read fails the refresh, as any failed read does', async ($, on) => {
  host(on, { checksFail: 'gh: HTTP 502: Bad Gateway' })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^gh-pane: gh api: gh: HTTP 502: Bad Gateway$/ })).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeDefined()
})

const LONG = 'a title long enough that no collapsed row at this width can show it whole'

test('a row toggle expands that row alone: its title, run line, chips and facts, in that order', async ($, on) => {
  host(on, {
    issues: [
      issue(7, ['ready-for-agent', 'bug', 'docs', 'wontfix', 'XL'], { title: LONG, ...assigned('ann', 5), comments: 2, milestone: { title: 'v1' } }),
      issue(8, ['bug'], { sub_issues_summary: { total: 4, completed: 1 } }),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const toggle = async (n: number) => (await ui.find({ key: `toggle-${n}` }))?.props.label
  const boxes = async (n: number) => (await ui.findAll({ type: 'Box' })).map(box => box.key).filter(key => key?.endsWith(`-${n}`))
  expect(await toggle(7)).toBe('▸')
  expect(await boxes(7)).toEqual(['row-7', 'run-7'])
  // A collapsed parent shows its count without the bar.
  expect(await ui.find({ text: '1/4' })).toBeDefined()
  expect(await ui.find({ text: /█|░/ })).toBeUndefined()

  await ui.press({ key: 'toggle-7' })
  expect(await toggle(7)).toBe('▾')
  expect(await boxes(7)).toEqual(['row-7', 'title-7', 'run-7', 'chips-7', 'facts-7'])
  expect(await ui.find({ key: 'title-8' })).toBeUndefined()
  // The first line keeps the number, tag and buttons; the whole title and the chips move below it.
  expect((await spans(ui, 'row-7')).map(([text]) => text)).toEqual(['•', '#7', 'claimed (ann)'])
  expect((await spans(ui, 'title-7')).at(-1)).toEqual([LONG, ''])
  expect((await spans(ui, 'run-7')).at(-1)).toEqual(['◐ claimed 5h ago, no PR yet', 'cyan'])
  // Each chip on its label's colour, its ink black or white by the colour's brightness.
  expect((await spans(ui, 'chips-7')).filter(([, color]) => color.includes(' on '))).toEqual([
    [' bug ', '#ffffff on #d73a4a'],
    [' docs ', '#000000 on #fbca04'],
    [' wontfix ', '#000000 on #ffffff'],
    [' XL ', '#ffffff on #1d1d1d'],
  ])
  // The tag already names ann, so the facts line does not.
  expect((await spans(ui, 'facts-7')).at(-1)?.[0]).toBe('updated 3h ago · 2 comments · v1')

  await ui.press({ key: 'toggle-8' })
  expect(await ui.find({ text: '██░░░░░░ 1/4' })).toBeDefined()
  await ui.press({ key: 'toggle-7' })
  expect(await toggle(7)).toBe('▸')
  expect(await boxes(7)).toEqual(['row-7', 'run-7'])
})

test('the facts line names the assignees on an in PR row, and a milestone only when set', async ($, on) => {
  host(on, {
    issues: [
      issue(3, [], { ...assigned('bob', 1), comments: 1 }),
      { ...issue(50, []), pull_request: {}, html_url: 'https://github.com/acme/widgets/pull/50', body: 'Closes #3' },
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'toggle-3' })
  expect((await spans(ui, 'facts-3')).at(-1)?.[0]).toBe('bob · updated 3h ago · 1 comment')
})

test('expand all is a mode: rows toggled against it stay, pressing it again clears them, and new issues follow it', async ($, on) => {
  const { clock, fixture } = host(on, { issues: [issue(7, []), issue(8, [])] })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const expanded = async () => (await ui.findAll({ type: 'Box' })).flatMap(box => /^title-(\d+)$/.exec(box.key ?? '')?.[1] ?? []).map(Number)
  const mode = async () => (await ui.find({ key: 'expand' }))?.props
  expect(await mode()).toEqual(expect.objectContaining({ label: 'expand all', hotkey: 'e' }))

  await ui.press({ key: 'expand' })
  expect((await mode())?.label).toBe('collapse all')
  expect(await expanded()).toEqual([7, 8])
  await ui.press({ key: 'toggle-7' })
  expect(await expanded()).toEqual([8])

  await ui.press({ key: 'expand' })
  expect((await mode())?.label).toBe('expand all')
  expect(await expanded()).toEqual([])
  await ui.press({ key: 'expand' })
  expect(await expanded()).toEqual([7, 8])

  fixture.issues = [...fixture.issues, issue(9, [])]
  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(await expanded()).toEqual([7, 8, 9])
})

test('expanded rows survive a /clear that empties the session state', async ($, on) => {
  host(on)
  const session = { isCleared: false }
  on('state.get', (_$, e, next) => (session.isCleared ? { value: { value: undefined, version: 0 } } : next(e)))
  await open($)
  const before = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await before.press({ key: 'toggle-24' })
  await before.unmount()
  session.isCleared = true
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await after.find({ key: 'toggle-24' }))?.props.label).toBe('▾')
  expect(await after.find({ key: 'title-24' })).toBeDefined()
})

test('a snapshot from before CI marks, still in the session state, draws as no snapshot', async ($, on) => {
  host(on)
  // What 0.6.0 wrote: no `ci`, and issues with no label colours.
  on('state.get', async (_$, e, next) => {
    const got = await next(e)
    const view = got.value?.value as { ci?: unknown; issues?: object[] } | null | undefined
    if (got.value === undefined || !view?.issues) return got
    const old = { ...view, issues: view.issues.map(issue => ({ ...issue, labelColors: undefined })) }
    delete old.ci
    return { value: { ...got.value, value: old } }
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'row-24' })).toBeDefined()
})

test('at 55 columns a collapsed title takes what its measured tail leaves', async ($, on) => {
  host(on, {
    issues: [
      issue(7, ['ready-for-human'], { title: LONG }),
      issue(8, ['ready-for-agent'], { title: LONG }),
      issue(9, ['ready-for-human', 'bug', 'XL'], { title: LONG }),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 55 }, surface: 'terminal' })
  const title = async (n: number) => (await spans(ui, `row-${n}`))[1]![0].slice(`#${n} `.length)
  const yours = await title(7)
  expect(yours.endsWith('…')).toBe(true)
  expect(yours.length).toBeGreaterThanOrEqual(35)
  // `ready now` is 4 columns wider than `yours`, and the ship button takes 5; two dots take 3.
  expect((await title(8)).length).toBe(yours.length - 9)
  expect((await title(9)).length).toBe(yours.length - 3)
})

test('a map lists its tickets by state, never as untriaged, and its next button fills the map command', async ($, on) => {
  const { filled } = host(on, {
    issues: [
      issue(4, ['wayfinder:map'], { sub_issues_summary: { total: 5, completed: 1 }, ...assigned('ann', 72) }),
      issue(6, ['wayfinder:research'], assigned('ann', 72)),
      issue(7, ['wayfinder:grilling'], { sub_issues_summary: { total: 2, completed: 0 } }),
      // A ticket's own sub-issues are map tickets too.
      issue(10, [], assigned('bob', 72)),
      issue(11, []),
      issue(8, ['wayfinder:grilling', 'needs-info']),
      issue(9, ['wayfinder:grilling'], { issue_dependencies_summary: { blocked_by: 1 } }),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // Ready now counts the next rows: #7 and #11.
  expect(await ui.find({ text: 'PR cap 0/3 · ready now: 2 · runs: 3 active · 0 stale' })).toBeDefined()
  expect(await ui.find({ text: /untriaged/ })).toBeUndefined()
  expect(await ui.find({ text: /^blocked by #6$/ })).toBeDefined()
  // A map ticket resolves by a closing comment, not a PR: an old claim is not stale.
  expect(await ui.find({ text: /◐ claimed 3d ago$/ })).toBeDefined()
  for (const n of [4, 6, 10]) expect(await ui.find({ key: `release-${n}` })).toBeUndefined()
  expect(await ui.find({ key: 'next-9' })).toBeUndefined()
  // Waiting on its reporter, a map ticket is not next.
  expect(await ui.find({ text: 'needs-info' })).toBeDefined()
  expect(await ui.find({ key: 'next-8' })).toBeUndefined()
  await ui.press({ key: 'next-7' })
  await ui.press({ key: 'next-11' })
  expect(filled).toEqual(['/wayfinder 4 7', '/wayfinder 4 11'])
})

test('an empty repo says so, with no fixture data, naming the repo from the one lookup it makes', async ($, on) => {
  const { calls } = host(on, { issues: [] })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'Nothing open in acme/widgets.' })).toBeDefined()
  expect(calls.filter(argv => argv.join(' ') === REPO_LOOKUP.join(' '))).toHaveLength(1)
  expect(await ui.find({ text: /#\d/ })).toBeUndefined()
})

for (const [name, setup, line] of [
  ['a failing gh', { ghFails: 'gh: HTTP 401: Bad credentials' }, 'gh-pane: gh api: gh: HTTP 401: Bad credentials'],
  ['a missing gh', { ghMissing: true }, /^gh-pane: gh did not run \(not installed, or timed out\): ./],
  ['a repo off GitHub', { isOffGitHub: true }, /^gh-pane: gh api: unable to expand placeholder in path: none of the git remotes/],
] as const) {
  test(`${name} shows one error line`, async ($, on) => {
    host(on, setup)
    await open($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: line })).toBeDefined()
    expect(await ui.find({ text: /PR cap/ })).toBeUndefined()
  })
}

test('a failed read offers retry, and the header offers refresh; each re-reads now', async ($, on) => {
  const { calls, clock, backlog } = host(on)
  backlog.failsAt = 1
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'gh-pane: gh api: gh: HTTP 401: Bad credentials' })).toBeDefined()
  const reads = () => calls.filter(argv => argv.includes(ISSUES)).length
  expect(reads()).toBe(1)

  await ui.press({ key: 'retry' })
  await clock.settle()
  expect(reads()).toBe(2)
  expect(await ui.find({ text: /PR cap/ })).toBeDefined()

  await ui.press({ key: 'refresh' })
  await clock.settle()
  expect(reads()).toBe(3)
})

test('/gh-pane is immediate, and the pane re-reads after a Bash gh or git push, and every 120 s', async ($, on) => {
  const { calls, clock, panes } = host(on)
  on('tool.call', async () => ({ result: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const commands: unknown[] = []
  on('command.register', (_, e) => {
    commands.push(e)
    return { value: { command: e.name } }
  })
  await $.session.start({ cwd: '/w/widgets', surface: 'terminal', isInteractive: true })
  // Registered immediate, so typed mid-turn it opens or hides the pane at once.
  expect(commands).toEqual([expect.objectContaining({ name: 'gh-pane', immediate: true })])
  await open($)
  const reads = () => calls.filter(argv => argv.includes(ISSUES)).length
  expect(reads()).toBe(1)

  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  await clock.settle()
  expect(reads()).toBe(1)
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin HEAD' })
  await clock.settle()
  expect(reads()).toBe(2)
  await $.tool.call({ tool: 'Bash', command: 'cd x && gh api repos/acme/widgets/pulls' })
  await clock.settle()
  expect(reads()).toBe(3)
  // git's global options, with or without an argument, before `push`.
  for (const command of ['git -C ../widgets push origin fix/9', 'git -c protocol.version=2 push', 'git --no-pager push']) {
    const before = reads()
    await $.tool.call({ tool: 'Bash', command })
    await clock.settle()
    expect([command, reads()]).toEqual([command, before + 1])
  }
  // Neither word as a command: no read.
  for (const command of ['echo "gh "', 'cat legit push.md', 'git log --grep push']) {
    await $.tool.call({ tool: 'Bash', command })
    await clock.settle()
  }
  expect(reads()).toBe(6)

  await clock.advance(120_000)
  expect(reads()).toBe(7)

  // Closed, the pane reads nothing: neither on the timer nor after a gh call.
  panes.isOpen = false
  await clock.advance(120_000)
  await $.tool.call({ tool: 'Bash', command: 'gh api repos/acme/widgets/pulls' })
  await clock.settle()
  expect(reads()).toBe(7)
})

test('three triggers during one read cause exactly one rerun, once that read lands', async ($, on) => {
  const { calls, clock, backlog } = host(on)
  on('tool.call', async () => ({ result: '' }))
  await open($)
  const reads = () => calls.filter(argv => argv.includes(ISSUES)).length
  expect(reads()).toBe(1)

  let release = () => {}
  backlog.held.until = new Promise(resolve => (release = resolve))
  await $.tool.call({ tool: 'Bash', command: 'gh issue list' })
  await clock.settle()
  expect(reads()).toBe(2)
  for (const command of ['gh pr view 1', 'git push', 'gh issue view 2']) await $.tool.call({ tool: 'Bash', command })
  await clock.settle()
  expect(reads()).toBe(2)
  release()
  await clock.settle()
  expect(reads()).toBe(3)
})

test('a second session.start in one process keeps one 120 s timer', async ($, on) => {
  const { calls, clock } = host(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/w/widgets', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/w/widgets', surface: 'terminal', isInteractive: true })
  await open($)
  const reads = () => calls.filter(argv => argv.includes(ISSUES)).length
  await clock.advance(120_000)
  expect(reads()).toBe(2)
})

test('a timer tick or a re-read that fails says so in a toast', async ($, on) => {
  const { clock, panes, toasts } = host(on)
  on('tool.call', async () => ({ result: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/w/widgets', surface: 'terminal', isInteractive: true })
  panes.isBroken = true
  await clock.advance(120_000)
  await $.tool.call({ tool: 'Bash', command: 'gh api repos/acme/widgets/pulls' })
  await clock.settle()
  expect(toasts).toEqual([expect.stringMatching(/^gh-pane did not refresh: ./), expect.stringMatching(/^gh-pane did not refresh: ./)])
})

test('a read asked for during another lands after it: the later answer wins', async ($, on) => {
  const { backlog, clock } = host(on)
  on('tool.call', async () => ({ result: '' }))
  await open($)
  // The second trigger comes while the first read still has the backlog's sub-issues, blockers and claims to read; the
  // rerun it waits for fails at its first call and lands last.
  backlog.failsAt = 3
  await $.tool.call({ tool: 'Bash', command: 'gh api repos/acme/widgets/pulls' })
  await $.tool.call({ tool: 'Bash', command: 'gh api repos/acme/widgets/pulls' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'gh-pane: gh api: gh: HTTP 401: Bad credentials' })).toBeDefined()
})

// The default icon: the GitHub mark of a Nerd Font.
const LOGO = '\uf408'

const BAND = {
  plugin: 'gh-pane',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 90, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('the band above the prompt shows the pane and hides it', async ($, on) => {
  const { panes, opened, closed } = host(on)
  panes.isOpen = false
  for (const surface of ['terminal', 'desktop'] as const) {
    opened.length = 0
    closed.length = 0
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ key: 'toggle' }))?.props.label).toBe(`Open gh-pane ${LOGO}`)
    await band.press({ key: 'toggle' })
    expect(opened).toEqual(['gh-pane titled gh-pane'])
    expect((await band.find({ key: 'toggle' }))?.props.label).toBe(`Hide gh-pane ${LOGO}`)
    await band.press({ key: 'toggle' })
    expect(closed).toEqual(['gh-pane'])
    expect((await band.find({ key: 'toggle' }))?.props.label).toBe(`Open gh-pane ${LOGO}`)
    await band.unmount()
  }
})

test('/gh-pane opens the pane, and run again while it is open, hides it', async ($, on) => {
  const { opened, closed } = host(on)
  expect(await open($)).toEqual(expect.objectContaining({ text: 'gh-pane opened.' }))
  expect(opened).toEqual(['gh-pane titled gh-pane'])
  expect(await open($)).toEqual(expect.objectContaining({ text: 'gh-pane hidden.' }))
  expect(closed).toEqual(['gh-pane'])
  expect(opened).toHaveLength(1)
})

test('with the pane list unreadable, /gh-pane still opens the pane', async ($, on) => {
  const { panes, opened } = host(on)
  panes.isBroken = true
  expect(await open($)).toEqual(expect.objectContaining({ text: 'gh-pane opened.' }))
  expect(opened).toEqual(['gh-pane titled gh-pane'])
})

test('with the pane list unreadable, the band still draws its button', async ($, on) => {
  const { panes } = host(on)
  panes.isBroken = true
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ key: 'toggle' }))?.props.label).toBe(`Open gh-pane ${LOGO}`)
})

test('a press that fails says so in a toast', async ($, on) => {
  const { panes, toasts } = host(on, { openFails: 'no surface' })
  panes.isOpen = false
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'toggle' })
  expect(toasts).toEqual([expect.stringMatching(/^gh-pane: .*no surface/)])
})

test('the band yields to a survey', async ($, on) => {
  host(on)
  for (const [hasSurvey, isDrawn] of [[false, true], [true, false]] as const) {
    const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey }, surface: 'terminal' })
    expect([hasSurvey, (await band.find({ key: 'toggle' })) !== undefined]).toEqual([hasSurvey, isDrawn])
    await band.unmount()
  }
})

for (const [buttonIcon, label] of [['G', 'Open gh-pane G'], ['', 'Open gh-pane']] as const) {
  test(`the band button follows its userConfig icon ${JSON.stringify(buttonIcon)}`, { options: { buttonIcon } }, async ($, on) => {
    host(on).panes.isOpen = false
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await band.find({ key: 'toggle' }))?.props.label).toBe(label)
  })
}

test('after a /clear empties the session state, the open pane still draws the last read of its folder', async ($, on) => {
  const { folder } = host(on)
  // What a /clear does to the mod on 2.1.289: the session state starts over, the pane stays up, no hook fires.
  const session = { isCleared: false }
  on('state.get', (_$, e, next) => (session.isCleared ? { value: { value: undefined, version: 0 } } : next(e)))
  await open($)
  session.isCleared = true
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /Reading the repo/ })).toBeUndefined()
  expect(await ui.find({ text: 'PR cap 1/3 · ready now: 1 · runs: 2 active · 2 stale' })).toBeDefined()
  await ui.unmount()
  // A session in another folder never draws this one's read.
  folder.cwd = '/w/other'
  const other = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await other.find({ text: /Reading the repo/ })).toBeDefined()
  expect(await other.find({ text: /PR cap/ })).toBeUndefined()
})

const GATE = 'Ready to merge. Reply "merge" to squash-merge, close the issue, and clean up.\nPR: https://github.com/acme/widgets/pull/42'
const MERGED = 'Merged #42.'

const answer = ($: Engine, text: string, agentId?: string) =>
  $.turn.complete({ answer: text, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', ...(agentId === undefined ? {} : { agentId }) })
const type = ($: Engine, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })

test('a main-loop gate answer shows the merge button, and pressing it sends the reply as the user', async ($, on) => {
  const { sent } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ key: 'merge' })).toBeUndefined()

  // A subagent's answer is no gate of this session.
  await answer($, GATE, 'agent-1')
  expect(await band.find({ key: 'merge' })).toBeUndefined()

  await answer($, GATE)
  const button = await band.find({ key: 'merge' })
  expect(button?.props.label).toBe('merge PR #42')
  expect(button?.props.hotkey).toBe('m')
  // The pane's toggle stays beside it.
  expect(await band.find({ key: 'toggle' })).toBeDefined()

  await band.press({ key: 'merge' })
  expect(sent).toEqual([{ text: 'merge', asUser: true }])
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  expect(await band.find({ text: 'merging PR #42…' })).toBeDefined()
})

test('a gate answer with no PR link, or without the gate text, is no gate', async ($, on) => {
  host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await answer($, 'Ready to merge. Reply "merge" to squash-merge.')
  await answer($, 'Merge it with a link: https://github.com/acme/widgets/pull/42')
  expect(await band.find({ key: 'merge' })).toBeUndefined()
})

test('a typed reply equal to the word reaches merging; any other reply hides the button until the gate returns', async ($, on) => {
  host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await answer($, GATE)
  await type($, 'merge')
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  expect(await band.find({ text: 'merging PR #42…' })).toBeDefined()

  await answer($, GATE)
  await type($, 'wait, one more look')
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  expect(await band.find({ text: /merging/ })).toBeUndefined()

  await answer($, GATE)
  expect(await band.find({ key: 'merge' })).toBeDefined()
})

test('a merged PR shows the next button for the first ready row, and pressing it clears, then runs the command', async ($, on) => {
  const { calls, pulls, ran, fixture, panes, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await answer($, GATE)
  await type($, 'merge')
  // Pane closed: the next command still comes from a fresh read, which sees #7 and #8 become ready since the gate,
  // listed newest first as GitHub answers; the oldest is next.
  panes.isOpen = false
  fixture.issues = [issue(9, ['needs-triage']), issue(8, ['ready-for-agent']), issue(7, ['ready-for-agent'])]
  pulls[42] = true
  await answer($, MERGED)
  await clock.settle()

  const next = await band.find({ key: 'next' })
  expect(next?.props.label).toBe('clear + /ship 7')
  expect(next?.props.hotkey).toBe('n')
  expect(calls).toContainEqual(['gh', 'api', 'repos/{owner}/{repo}/pulls/42', '--jq', '.merged'])
  expect(await band.find({ text: /merging/ })).toBeUndefined()

  await band.press({ key: 'next' })
  expect(ran).toEqual([{ command: 'clear', args: '' }, { command: 'ship', args: '7' }])
  expect(await band.find({ key: 'next' })).toBeUndefined()
})

test('the next button follows pane order: a lone issue waiting on triage waits below the trees', async ($, on) => {
  const { pulls, ran, clock } = host(on, {
    issues: [issue(9, ['needs-triage', 'ready-for-agent']), issue(8, ['ready-for-agent'])],
  })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  pulls[42] = true
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED)
  await clock.settle()
  expect((await band.find({ key: 'next' }))?.props.label).toBe('clear + /ship 8')
  await band.press({ key: 'next' })
  expect(ran.at(-1)).toEqual({ command: 'ship', args: '8' })
})

test('the next button of a map ticket runs the map command', async ($, on) => {
  const { pulls, ran, clock } = host(on, {
    issues: [
      issue(4, ['wayfinder:map'], { sub_issues_summary: { total: 4, completed: 0 } }),
      issue(6, ['wayfinder:research']),
      issue(7, ['wayfinder:grilling']),
      issue(8, ['wayfinder:grilling']),
      issue(9, ['wayfinder:grilling'], { issue_dependencies_summary: { blocked_by: 1 } }),
    ],
  })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  pulls[42] = true
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED)
  await clock.settle()
  expect((await band.find({ key: 'next' }))?.props.label).toBe('clear + /wayfinder 4 6')
  await band.press({ key: 'next' })
  expect(ran.at(-1)).toEqual({ command: 'wayfinder', args: '4 6' })
})

test('the next button stands for the turn after the merge only', async ($, on) => {
  const { pulls, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  pulls[42] = true
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED)
  await clock.settle()
  expect(await band.find({ key: 'next' })).toBeDefined()
  // A subagent's turn is no later turn of this session.
  await answer($, 'done', 'agent-1')
  expect(await band.find({ key: 'next' })).toBeDefined()
  await answer($, 'Anything else?')
  expect(await band.find({ key: 'next' })).toBeUndefined()
})

test('a subagent turn while merging settles nothing', async ($, on) => {
  const { pulls, clock, calls } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  pulls[42] = true
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED, 'agent-1')
  await clock.settle()
  expect(await band.find({ text: 'merging PR #42…' })).toBeDefined()
  expect(calls.filter(argv => argv.at(-2) === '--jq')).toEqual([])
})

test('a next-command read that fails says so in a toast and shows no next button', async ($, on) => {
  const { pulls, backlog, toasts, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  pulls[42] = true
  backlog.failsAt = 1
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED)
  await clock.settle()
  expect(toasts).toEqual(['gh-pane: gh api: gh: HTTP 401: Bad credentials'])
  expect(await band.find({ key: 'next' })).toBeUndefined()
  expect(await band.find({ text: /merging/ })).toBeUndefined()
})

test('a PR that did not merge, or no ready row, shows no next button', async ($, on) => {
  const { pulls, fixture, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // A stale-base or a no: the PR read answers not merged.
  await answer($, GATE)
  await type($, 'merge')
  await answer($, 'stale-base: behind 2 on main')
  await clock.settle()
  expect(await band.find({ key: 'next' })).toBeUndefined()
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  expect(await band.find({ text: /merging/ })).toBeUndefined()

  // Merged, but nothing is ready.
  fixture.issues = [issue(9, ['needs-info'])]
  pulls[42] = true
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED)
  await clock.settle()
  expect(await band.find({ key: 'next' })).toBeUndefined()
  expect(await band.find({ text: /merging/ })).toBeUndefined()
})

const MERGED_ON_GATE = 'Timing: 41 min\nMerged on a clean gate: https://github.com/acme/widgets/pull/42'

test('a main-loop answer with the merged text shows the next button, and no merge button', async ($, on) => {
  const { calls, pulls, ran, fixture, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  fixture.issues = [issue(8, ['ready-for-agent'])]
  pulls[42] = true
  await answer($, MERGED_ON_GATE)
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  await clock.settle()

  expect((await band.find({ key: 'next' }))?.props.label).toBe('clear + /ship 8')
  expect(calls).toContainEqual(['gh', 'api', 'repos/{owner}/{repo}/pulls/42', '--jq', '.merged'])
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  await band.press({ key: 'next' })
  expect(ran).toEqual([{ command: 'clear', args: '' }, { command: 'ship', args: '8' }])
})

test('a merged-text answer whose PR reads not merged, or from a subagent, shows nothing', async ($, on) => {
  const { pulls, calls, fixture, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  fixture.issues = [issue(8, ['ready-for-agent'])]

  await answer($, MERGED_ON_GATE)
  await clock.settle()
  expect(await band.find({ key: 'next' })).toBeUndefined()
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  expect(await band.find({ text: /merging/ })).toBeUndefined()

  pulls[42] = true
  calls.length = 0
  await answer($, MERGED_ON_GATE, 'agent-1')
  await clock.settle()
  expect(await band.find({ key: 'next' })).toBeUndefined()
  expect(calls.filter(argv => argv.at(-2) === '--jq')).toEqual([])
})

test('the merged text follows its userConfig', { options: { mergedText: 'Shipped:' } }, async ($, on) => {
  const { pulls, fixture, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  fixture.issues = [issue(8, ['ready-for-agent'])]
  pulls[42] = true
  await answer($, MERGED_ON_GATE)
  await clock.settle()
  expect(await band.find({ key: 'next' })).toBeUndefined()
  await answer($, 'Shipped: https://github.com/acme/widgets/pull/42')
  await clock.settle()
  expect((await band.find({ key: 'next' }))?.props.label).toBe('clear + /ship 8')
})

test('the session ending clears the gate', async ($, on) => {
  host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await answer($, GATE)
  expect(await band.find({ key: 'merge' })).toBeDefined()
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(await band.find({ key: 'merge' })).toBeUndefined()
})

test('a merge reply that fails to send says so in a toast and leaves the button pressable', async ($, on) => {
  const { toasts, sent } = host(on, { isSubmitBroken: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await answer($, GATE)
  await band.press({ key: 'merge' })
  expect(sent).toEqual([])
  expect(toasts).toEqual([expect.stringMatching(/^gh-pane: .*prompt\.submit/)])
  expect(await band.find({ key: 'merge' })).toBeDefined()
})

test('a PR read that fails says so in a toast and hides the gate', async ($, on) => {
  const { toasts, clock } = host(on, { pullFails: 'gh: HTTP 502' })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await answer($, GATE)
  await type($, 'merge')
  await answer($, MERGED)
  await clock.settle()
  expect(toasts).toEqual([expect.stringMatching(/^gh-pane could not read PR #42: .*HTTP 502/)])
  expect(await band.find({ text: /merging/ })).toBeUndefined()
  expect(await band.find({ key: 'next' })).toBeUndefined()
})

for (const [name, options, request] of [
  ['default', {}, 'Close #3: all 2 of its sub-issues are closed.'],
  ['own words', { closeRequest: 'wrap up #{n} ({total})' }, 'wrap up #3 (2)'],
] as const) {
  test(`an open issue whose sub-issues are all closed reads all done, and close fills the request (${name})`, { options }, async ($, on) => {
    const { filled } = host(on, {
      issues: [
        issue(3, [], { sub_issues_summary: { total: 2, completed: 2 } }),
        issue(5, [], { sub_issues_summary: { total: 2, completed: 1 } }),
      ],
    })
    await open($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: 'all done' })).toBeDefined()
    expect(await ui.find({ key: 'close-5' })).toBeUndefined()
    await ui.press({ key: 'close-3' })
    expect(filled).toEqual([request])
  })
}

test('a finished sub-issue list is never read: its children could match no open issue', async ($, on) => {
  const { calls } = host(on, {
    issues: [
      issue(3, [], { sub_issues_summary: { total: 2, completed: 2 } }),
      issue(5, [], { sub_issues_summary: { total: 2, completed: 1 } }),
    ],
  })
  await open($)
  const read = calls.flatMap(argv => argv.filter(arg => arg.includes('/sub_issues')))
  expect(read).toEqual(['repos/{owner}/{repo}/issues/5/sub_issues?per_page=100'])
})

test('all done ranks after in PR and before blocked, claimed and ready', async ($, on) => {
  host(on, {
    issues: [
      issue(3, ['ready-for-agent'], { sub_issues_summary: { total: 1, completed: 1 }, issue_dependencies_summary: { blocked_by: 1 }, ...assigned('ann', 1) }),
      issue(4, ['ready-for-agent'], { sub_issues_summary: { total: 1, completed: 1 } }),
      { ...issue(31, []), pull_request: {}, html_url: 'https://github.com/acme/widgets/pull/31', body: 'Closes #4' },
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // #3 is blocked, claimed and ready, and still all done; #4 has a PR, so it reads in PR with no close button.
  expect(await ui.find({ key: 'close-3' })).toBeDefined()
  expect(await ui.find({ key: 'ship-3' })).toBeUndefined()
  expect(await ui.find({ text: 'in PR #31' })).toBeDefined()
  expect(await ui.find({ key: 'close-4' })).toBeUndefined()
})

test('a map ticket row reads ready now beside its next button, never next next', async ($, on) => {
  host(on, {
    issues: [
      issue(4, ['wayfinder:map'], { sub_issues_summary: { total: 1, completed: 0 } }),
      issue(7, ['wayfinder:grilling']),
    ],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'next-7' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'next' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'ready now' })).toBeDefined()
})

test('the gate and merge words follow userConfig', { options: { gateText: 'Say go', mergeReply: 'go' } }, async ($, on) => {
  const { sent } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await answer($, GATE)
  expect(await band.find({ key: 'merge' })).toBeUndefined()
  await answer($, 'Say go to merge https://github.com/acme/widgets/pull/9')
  await band.press({ key: 'merge' })
  expect(sent).toEqual([{ text: 'go', asUser: true }])
})
