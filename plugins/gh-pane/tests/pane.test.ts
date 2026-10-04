import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()

const PANE = {
  plugin: 'gh-pane',
  component: 'Pane',
  requestId: 'gh-pane',
  props: { title: 'GitHub', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

type Raw = Record<string, unknown>
const issue = (number: number, labels: string[], extra: Raw = {}): Raw => ({
  number,
  title: `issue ${number}`,
  html_url: `https://github.com/acme/widgets/issues/${number}`,
  labels: labels.map(name => ({ name })),
  assignees: [],
  body: '',
  ...extra,
})
const assigned = (login: string, hours: number) => ({ assignees: [{ login }], claimedHoursAgo: hours })

/** A repo shaped like a working backlog: one spec tree, claims in every run state, a PR and two waiting lists. */
const BACKLOG: Raw[] = [
  issue(20, ['ready-for-human'], { sub_issues_summary: { total: 4, completed: 1 } }),
  issue(24, ['ready-for-agent'], assigned('ann', 5)),
  issue(25, ['ready-for-agent'], { issue_dependencies_summary: { blocked_by: 2 } }),
  issue(27, ['ready-for-agent']),
  issue(22, ['ready-for-agent'], assigned('ann', 2)),
  issue(35, ['ready-for-agent'], assigned('bob', 72)),
  issue(36, ['ready-for-agent'], assigned('ann', 72)),
  issue(32, ['needs-triage']),
  issue(33, ['needs-triage']),
  issue(19, ['needs-info']),
  { ...issue(31, []), pull_request: {}, html_url: 'https://github.com/acme/widgets/pull/31', body: 'Closes #36' },
]

const API: Record<string, unknown[]> = {
  'repos/acme/widgets/issues/20/sub_issues?per_page=100': [
    { number: 23, state: 'closed' },
    { number: 24, state: 'open' },
    { number: 25, state: 'open' },
    { number: 27, state: 'open' },
  ],
  'repos/acme/widgets/issues/25/dependencies/blocked_by': [
    { number: 24, state: 'open' },
    { number: 9, state: 'closed' },
  ],
}

const PORCELAIN = [
  'worktree /w/widgets\nHEAD 1\nbranch refs/heads/main',
  'worktree /w/widgets.worktrees/resume-22\nHEAD 2\nbranch refs/heads/fix/resume-22',
  'worktree /w/wt/9\nHEAD 3\nbranch refs/heads/feat/9',
].join('\n\n')

type Host = { remote?: string; issues?: Raw[]; ghFails?: string; ghMissing?: boolean }

/** Stubs git and gh behind `$.process.run`; answers every argv it saw in `calls`. */
function host(on: On, { remote = 'git@github.com:acme/widgets.git', issues = BACKLOG, ghFails, ghMissing }: Host = {}) {
  const calls: string[][] = []
  const filled: string[] = []
  const clock = mock.clock(on, { now: NOW })
  on('process.run', async (_$, e, next) => {
    calls.push([...e.argv])
    const [cmd, sub, ...rest] = e.argv
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git' && sub === 'remote') return ok(`${remote}\n`)
    if (cmd === 'git' && sub === 'worktree') return ok(`${PORCELAIN}\n`)
    // Nothing beneath answers, so $.process.run rejects as it does for a command that cannot start.
    if (ghMissing) return next(e)
    if (ghFails !== undefined) return { value: { exitCode: 1, stdout: '', stderr: `${ghFails}\nmore detail\n`, isStdoutTruncated: false, isStderrTruncated: false } }
    const path = rest.at(-1)!
    const events = /issues\/(\d+)\/events/.exec(path)
    if (events) {
      const hours = issues.find(i => i.number === Number(events[1]))?.claimedHoursAgo as number
      return ok(JSON.stringify([[{ event: 'labeled', created_at: ago(200) }, { event: 'assigned', created_at: ago(hours) }]]))
    }
    if (path === 'repos/acme/widgets/issues?state=open&per_page=100') return ok(JSON.stringify([issues]))
    return ok(JSON.stringify([API[path] ?? []]))
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.panes', async () => ({ value: [{ id: 'gh-pane', title: 'GitHub', isShown: true, isFocused: false, isPlaced: true }] }))
  on('prompt.read', async () => ({ value: { text: '', cursor: 0 } }))
  on('ui.toast', async () => ({ value: undefined }))
  on('prompt.fill', async (_$, e) => {
    filled.push(e.text)
    return { isFilled: true, box: { text: e.text, cursor: e.text.length } }
  })
  return { calls, filled, clock }
}

const open = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.command.run({ command: 'gh-pane', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

test('the pane orders the backlog and each button fills its command', async ($, on) => {
  const { calls, filled } = host(on)
  await open($)

  for (const surface of ['terminal', 'desktop'] as const) {
    filled.length = 0
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ text: 'PR cap 1/3 · ready now: 1 · runs: 2 active · 1 stale' })).toBeDefined()
    expect(await ui.find({ text: '██░░░░░░ 1/4' })).toBeDefined()
    expect(await ui.find({ text: /✓ 1 done/ })).toBeDefined()
    expect(await ui.find({ text: 'blocked by #24' })).toBeDefined()
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

    await ui.press({ key: 'ship-27' })
    await ui.press({ key: 'triage-32' })
    await ui.press({ key: 'triage-all' })
    await ui.press({ key: 'release-35' })
    expect(filled).toEqual([
      '/ship 27',
      '/triage 32',
      '/triage #32, #33 one by one',
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

test('the pane follows a non-default userConfig', {
  options: {
    readyForAgentLabel: 'go',
    needsTriageLabel: 'inbox',
    prCap: 5,
    worktreeLayout: 'wt/{n}',
    shipCommand: 'ship it {n}',
    triageCommand: '/look {issues}',
  },
}, async ($, on) => {
  const { filled } = host(on, {
    issues: [issue(7, ['go']), issue(8, ['inbox']), issue(9, ['go'], assigned('ann', 1)), issue(10, ['ready-for-agent'])],
  })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'PR cap 0/5 · ready now: 1 · runs: 1 active · 0 stale' })).toBeDefined()
  expect(await ui.find({ text: /◐ ship worktree 9/ })).toBeDefined()
  expect(await ui.find({ text: /needs triage \(1\)/ })).toBeDefined()
  expect(await ui.find({ key: 'ship-10' })).toBeUndefined()
  await ui.press({ key: 'ship-7' })
  await ui.press({ key: 'triage-8' })
  expect(filled).toEqual(['ship it 7', '/look 8'])
})

test('an empty repo says so, with no fixture data', async ($, on) => {
  host(on, { issues: [] })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'Nothing open in acme/widgets.' })).toBeDefined()
  expect(await ui.find({ text: /#\d/ })).toBeUndefined()
})

for (const [name, setup, line] of [
  ['a failing gh', { ghFails: 'gh: HTTP 401: Bad credentials' }, 'gh-pane: gh api: gh: HTTP 401: Bad credentials'],
  ['a missing gh', { ghMissing: true }, /^gh-pane: .*process\.run/],
  ['a repo off GitHub', { remote: 'git@gitlab.com:acme/widgets.git' }, 'gh-pane: origin is not on GitHub: git@gitlab.com:acme/widgets.git'],
] as const) {
  test(`${name} shows one error line`, async ($, on) => {
    host(on, setup)
    await open($)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: line })).toBeDefined()
    expect(await ui.find({ text: /PR cap/ })).toBeUndefined()
  })
}

test('/gh-pane is immediate, and the pane re-reads after a Bash gh or git push, and every 120 s', async ($, on) => {
  const { calls, clock } = host(on)
  on('tool.call', async () => ({ result: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const commands: unknown[] = []
  on('command.register', (_, e) => {
    commands.push(e)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/w/widgets', surface: 'terminal', isInteractive: true })
  // Registered immediate, so typed mid-turn it opens the pane at once.
  expect(commands).toEqual([expect.objectContaining({ name: 'gh-pane', immediate: true })])
  await open($)
  const reads = () => calls.filter(argv => argv.at(-1) === 'repos/acme/widgets/issues?state=open&per_page=100').length
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

  await clock.advance(120_000)
  expect(reads()).toBe(4)
})
