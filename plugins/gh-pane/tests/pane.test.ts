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
}

const PORCELAIN = [
  'worktree /w/widgets\nHEAD 1\nbranch refs/heads/main',
  'worktree /w/widgets.worktrees/resume-22\nHEAD 2\nbranch refs/heads/fix/resume-22',
  'worktree /w/wt/9\nHEAD 3\nbranch refs/heads/feat/9',
].join('\n\n')

type Host = { issues?: Raw[]; ghFails?: string; ghMissing?: boolean; isOffGitHub?: boolean; openFails?: string; isSubmitBroken?: boolean; pullFails?: string }

/**
 * Stubs git and gh behind `$.process.run`; answers every argv it saw in `calls`. Read number `repo.failsAt` fails.
 * `fixture.issues` is what the next read lists, `pulls` which PRs read as merged; `sent` and `ran` are the prompts and
 * the commands the mod submitted or ran, `typed` the prompts a person typed.
 */
function host(on: On, { issues = BACKLOG, ghFails, ghMissing, isOffGitHub, openFails, isSubmitBroken, pullFails }: Host = {}) {
  const calls: string[][] = []
  const fixture = { issues }
  const pulls: Record<number, boolean> = {}
  const sent: { text: string; asUser: boolean }[] = []
  const typed: string[] = []
  const ran: { command: string; args: string }[] = []
  const filled: string[] = []
  const clock = mock.clock(on, { now: NOW })
  const panes = { isOpen: true, isBroken: false }
  const toasts: string[] = []
  const repo = { reads: 0, failsAt: 0 }
  on('process.run', async (_$, e, next) => {
    calls.push([...e.argv])
    const [cmd, sub, ...rest] = e.argv
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const fail = (stderr: string) => ({ value: { exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git' && sub === 'worktree') return ok(`${PORCELAIN}\n`)
    // Nothing beneath answers, so $.process.run rejects as it does for a command that cannot start.
    if (ghMissing) return next(e)
    if (ghFails !== undefined) return fail(`${ghFails}\nmore detail\n`)
    if (rest[0] === 'repos/{owner}/{repo}') {
      if (++repo.reads === repo.failsAt) return fail('gh: HTTP 401: Bad credentials\n')
      // gh's own words when no remote of the checkout is on a GitHub host.
      return isOffGitHub
        ? fail('unable to expand placeholder in path: none of the git remotes configured for this repository point to a known GitHub host.\n')
        : ok('acme/widgets\n')
    }
    const pull = /^repos\/\{owner\}\/\{repo\}\/pulls\/(\d+)$/.exec(rest[0] ?? '')
    if (pull) return pullFails === undefined ? ok(`${pulls[Number(pull[1])] ?? false}\n`) : fail(pullFails)
    const path = rest.at(-1)!
    const events = /issues\/(\d+)\/events/.exec(path)
    if (events) {
      const hours = fixture.issues.find(i => i.number === Number(events[1]))?.claimedHoursAgo as number
      return ok(JSON.stringify([[{ event: 'labeled', created_at: ago(200) }, { event: 'assigned', created_at: ago(hours) }]]))
    }
    if (path === 'repos/acme/widgets/issues?state=open&per_page=100') return ok(JSON.stringify([fixture.issues]))
    return ok(JSON.stringify([API[path] ?? []]))
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
  return { calls, filled, clock, panes, repo, toasts, opened, closed, folder, fixture, pulls, sent, typed, ran }
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
    expect(await ui.find({ text: '██░░░░░░ 1/4' })).toBeDefined()
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
      issue(7, ['go']),
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
  await ui.press({ key: 'ship-7' })
  await ui.press({ key: 'triage-8' })
  await ui.press({ key: 'release-13' })
  await ui.press({ key: 'next-15' })
  expect(filled).toEqual(['ship it 7', '/look 8', 'free #13 from cat', 'walk 14/15'])
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

test('an empty repo says so, with no fixture data', async ($, on) => {
  host(on, { issues: [] })
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'Nothing open in acme/widgets.' })).toBeDefined()
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
  const { calls, clock, repo } = host(on)
  repo.failsAt = 1
  await open($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: 'gh-pane: gh api: gh: HTTP 401: Bad credentials' })).toBeDefined()
  const reads = () => calls.filter(argv => argv[2] === 'repos/{owner}/{repo}').length
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

test('a newer read wins over an older one that answers after it', async ($, on) => {
  const { repo, clock } = host(on)
  on('tool.call', async () => ({ result: '' }))
  await open($)
  // Two reads in flight: the older still has the backlog's sub-issues, blockers and claims to read when the newer
  // fails at its first call and lands.
  repo.failsAt = 3
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
  // Pane closed: the next command still comes from a fresh read, which sees #8 become ready since the gate.
  panes.isOpen = false
  fixture.issues = [issue(9, ['needs-triage']), issue(8, ['ready-for-agent']), issue(7, ['ready-for-agent'])]
  pulls[42] = true
  await answer($, MERGED)
  await clock.settle()

  const next = await band.find({ key: 'next' })
  expect(next?.props.label).toBe('clear + /ship 8')
  expect(next?.props.hotkey).toBe('n')
  expect(calls).toContainEqual(['gh', 'api', 'repos/{owner}/{repo}/pulls/42', '--jq', '.merged'])
  expect(await band.find({ text: /merging/ })).toBeUndefined()

  await band.press({ key: 'next' })
  expect(ran).toEqual([{ command: 'clear', args: '' }, { command: 'ship', args: '8' }])
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
  const { pulls, repo, toasts, clock } = host(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  pulls[42] = true
  repo.failsAt = 1
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
