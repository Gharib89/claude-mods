// gh-pane: `/gh-pane`, or the band's button above the prompt, shows or hides a pane of the session repo's open issues
// and PRs in run order. Its buttons fill the prompt with the next command and never send it: the person reads it and
// presses Enter. Two band buttons act on this session's own state instead: at its own merge gate one sends the merge
// reply, and once the PR is merged, there or by a ship run on its own, one clears the session and runs the next command.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Gate, Issue, Snapshot } from '../types'
import { isMerged, readBacklog, type Runner } from './github'
import { commandOf, fill, gatePr, mergedPrOf, runLine } from './rules'

const PANE = 'gh-pane'
const snapshot = atom({ plugin: 'gh-pane', key: 'snapshot' } as const, null)
const gate = atom({ plugin: 'gh-pane', key: 'gate' } as const, null)

type E = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link'>
type Config = ReturnType<typeof configOf>

const configOf = (o: PluginOptions) => ({
  needsTriage: String(o.needsTriageLabel),
  needsInfo: String(o.needsInfoLabel),
  readyForAgent: String(o.readyForAgentLabel),
  readyForHuman: String(o.readyForHumanLabel),
  mapLabel: String(o.mapLabel),
  mapCommand: String(o.mapCommand),
  prCap: Number(o.prCap),
  worktreeLayout: String(o.worktreeLayout),
  shipCommand: String(o.shipCommand),
  triageCommand: String(o.triageCommand),
  releaseRequest: String(o.releaseRequest),
  closeRequest: String(o.closeRequest),
  gateText: String(o.gateText),
  mergedText: String(o.mergedText),
  mergeReply: String(o.mergeReply),
  buttonIcon: String(o.buttonIcon),
})

const cut = (text: string, room: number) => (text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1))}…`)

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0]

// Reads overlap (a timer, a gh call, the command): only the latest one started may land.
let reads = 0
// The last snapshot landed, which the pane draws while `$.state` holds none; the state copy stays because its write
// redraws the pane. A /clear empties `$.state` while the pane stays up, and its one hook, `session.end`, runs before
// that, so a read started there lands in the old session (seen on 2.1.289). This module variable outlives the /clear,
// and draws only in the folder it was read in: one process may host more than one session.
let kept: { cwd: string; view: Snapshot } | null = null
// Which rows are expanded, per repo: the mode, and the rows toggled against it. A module variable for the reason `kept`
// is one: it outlives the /clear the next button runs.
const expansion = new Map<string, { all: boolean; flipped: Set<number> }>()

// Black or white ink on a label's hex colour, by perceived brightness.
const inkOn = (hex: string) => {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i + 1, i + 3), 16))
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.6 ? '#000000' : '#ffffff'
}

const age = (now: string, then: string) => {
  const hours = (Date.parse(now) - Date.parse(then)) / 3_600_000
  return hours < 1 ? `${Math.max(1, Math.floor(hours * 60))}m ago` : hours < 24 ? `${Math.floor(hours)}h ago` : `${Math.floor(hours / 24)}d ago`
}

const runnerOf = ($: EngineInterface): Runner => async argv => {
  const { exitCode, stdout, stderr } = await $.process.run(argv).catch((error: unknown) => {
    throw new Error(`${argv[0]} did not run (not installed, or timed out): ${messageOf(error)}`)
  })
  if (exitCode !== 0) throw new Error(`${argv[0]} ${argv[1]}: ${stderr.trim().split('\n')[0]}`)
  return stdout
}

// Answers the snapshot it read, landed or not: a read overtaken by a newer one is still fresh for its caller.
async function refresh($: EngineInterface, config: Config): Promise<Snapshot> {
  const ticket = ++reads
  const cwd = await $.session.cwd()
  const run = runnerOf($)
  const now = new Date(await $.clock.now()).toISOString()
  const next = await readBacklog(run, config.worktreeLayout, now).catch((error: unknown) => ({ error: `gh-pane: ${messageOf(error)}` }))
  if (ticket !== reads) return next
  kept = { cwd, view: next }
  await update($, snapshot, () => next)
  return next
}

// Opened by the person (the command, the band's button), the pane is placed at any width. The band draws from
// `$.ui.panes()`, which no redraw follows (2.1.289), so show, hide and the ui.close hook each invalidate it.
async function show($: EngineInterface, config: Config) {
  const opened = await $.ui.open({ id: PANE, title: 'gh-pane' })
  $.ui.invalidate('ui.render')
  await refresh($, config)
  return opened
}

// The mod's own $.ui.close skips its own ui.close hook (seen in `claude plugin test` on 2.1.289), so hide
// invalidates the band itself.
async function hide($: EngineInterface) {
  await $.ui.close({ id: PANE })
  $.ui.invalidate('ui.render')
}

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

// Nothing awaits a timer tick or a re-read after a tool call, so a failure there is toasted rather than dropped.
async function refreshIfOpen($: EngineInterface, config: Config) {
  try {
    if (await isOpen($)) await refresh($, config)
  } catch (error) {
    $.ui.toast(`gh-pane did not refresh: ${messageOf(error)}`)
  }
}

async function propose($: EngineInterface, text: string) {
  const draft = (await $.prompt.read()).text.trim()
  await $.prompt.fill(draft === '' ? { text } : { text: ` ${text}`, mode: 'append' })
  $.ui.toast(`In the prompt: ${text}  (Enter sends it)`)
}

/**
 * A row's state, first match wins. An issue whose sub-issues are all closed waits only on its own close. A map ticket
 * (a sub-issue of a map) left open, unblocked, unclaimed and waiting on neither triage nor info is next.
 */
function stateOf(
  issue: Issue,
  config: Config,
  isMapTicket: boolean,
): { tag: string; color: string; pr?: number; blockers?: Issue['blockers']; isReady?: true; isNext?: true; isDone?: true } {
  if (issue.pr !== undefined) return { tag: 'in PR ', color: 'cyan', pr: issue.pr }
  if (issue.subs.total > 0 && issue.subs.done === issue.subs.total) return { tag: 'all done', color: 'green', isDone: true }
  if (issue.blockers.length > 0) return { tag: 'blocked by ', color: 'yellow', blockers: issue.blockers }
  if (issue.assignees.length > 0) return { tag: `claimed (${issue.assignees.join(', ')})`, color: 'blue' }
  if (issue.labels.includes(config.readyForAgent)) return { tag: 'ready now', color: 'green', isReady: true }
  if (issue.labels.includes(config.readyForHuman)) return { tag: 'yours', color: 'magenta' }
  const waiting = issue.labels.find(l => l === config.needsTriage || l === config.needsInfo)
  if (waiting !== undefined) return { tag: waiting, color: 'gray' }
  if (issue.labels.includes(config.mapLabel)) return { tag: 'map', color: 'gray' }
  if (isMapTicket) return { tag: 'ready now', color: 'green', isNext: true }
  return { tag: 'untriaged', color: 'gray' }
}

type Open = Exclude<Snapshot, { error: string }>

const has = (issue: Issue, label: string) => issue.labels.includes(label)

/** The pane's order: each root's tree, then the lone issues waiting on triage or info. */
function arrange(view: Open, config: Config) {
  const byNumber = new Map(view.issues.map(issue => [issue.number, issue]))
  // A map and its tickets at every depth resolve by a closing comment, never a PR.
  const mapOf = (issue: Issue): number | undefined =>
    has(issue, config.mapLabel) ? issue.number : issue.parent === undefined ? undefined : mapOf(byNumber.get(issue.parent)!)
  const isMapTicket = (issue: Issue) => mapOf(issue) !== undefined && !has(issue, config.mapLabel)
  // A spec tree draws in place whatever its root's label; a lone issue waiting on triage or info waits below.
  // Oldest first, as ship selects; GitHub lists newest first. Sub-issues keep their parent's order.
  const top = view.issues.filter(issue => issue.parent === undefined).sort((a, b) => a.number - b.number)
  const isWaiting = (issue: Issue, label: string) => issue.subs.total === 0 && has(issue, label)
  const roots = top.filter(issue => !isWaiting(issue, config.needsTriage) && !isWaiting(issue, config.needsInfo))
  const waiting = [
    { name: 'needs triage', issues: top.filter(issue => isWaiting(issue, config.needsTriage)), canTriage: true },
    { name: 'needs info', issues: top.filter(issue => isWaiting(issue, config.needsInfo)), canTriage: false },
  ]
  return { byNumber, mapOf, isMapTicket, roots, waiting }
}

/** The command of the first row in the pane's order whose button starts work: a ready issue's ship or a map's next. */
function nextCommand(view: Open, config: Config): string | undefined {
  const { byNumber, mapOf, isMapTicket, roots, waiting } = arrange(view, config)
  const walk = (issue: Issue): Issue[] => [issue, ...issue.children.flatMap(n => walk(byNumber.get(n)!))]
  for (const issue of [...roots.flatMap(walk), ...waiting.flatMap(group => group.issues)]) {
    const state = stateOf(issue, config, isMapTicket(issue))
    if (state.isReady) return fill(config.shipCommand, { n: issue.number })
    if (state.isNext) return fill(config.mapCommand, { map: mapOf(issue)!, n: issue.number })
  }
  return undefined
}

const setGate = ($: EngineInterface, to: Gate | null) => update($, gate, () => to)

// Sends the reply as the person's own words. The press marks the merging before the send, so the state is right
// whether or not the mod's own prompt.submit hook sees this call.
async function pressMerge($: EngineInterface, config: Config, at: Gate) {
  await setGate($, { ...at, phase: 'merging' })
  try {
    await $.prompt.submit({ text: config.mergeReply, asUser: true })
  } catch (error) {
    await setGate($, at)
    throw error
  }
}

// The merge reply's turn, or one carrying the merged text, ended: the PR itself says whether it merged (a stale-base
// or a no leaves it open), and a fresh read, pane open or not, picks the next command.
async function settleMerge($: EngineInterface, config: Config, pr: number) {
  try {
    if (!(await isMerged(runnerOf($), pr))) return await setGate($, null)
    const view = await refresh($, config)
    if ('error' in view) $.ui.toast(view.error)
    const text = 'error' in view ? undefined : nextCommand(view, config)
    const run = text === undefined ? undefined : commandOf(text)
    await setGate($, { pr, phase: 'merged', next: text === undefined || run === undefined ? undefined : { text, ...run } })
  } catch (error) {
    await setGate($, null)
    $.ui.toast(`gh-pane could not read PR #${pr}: ${messageOf(error)}`)
  }
}

// Seen on 2.1.291: `$.command.run` works from a button press but is refused inside a `command.run` hook, no
// `session.start` fires after a /clear, and `$.prompt.submit` refuses text starting with `/`. So the next button runs
// the whole chain inside one press: /clear, then the command as a command.
async function pressNext($: EngineInterface, next: NonNullable<Gate['next']>) {
  await setGate($, null)
  await $.command.run({ command: 'clear' })
  await $.command.run({ command: next.command, args: next.args })
}

export const register: Register = (on, options) => {
  const config = configOf(options)

  // A main-loop answer carrying the gate text puts this session at the gate, and one carrying the merged text says a
  // ship run merged on its own, with no gate to answer; a subagent's turn is neither.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    const mergedPr = mergedPrOf(e.answer, config.mergedText)
    const pr = gatePr(e.answer, config.gateText)
    if (mergedPr !== undefined) void settleMerge($, config, mergedPr)
    else if (pr !== undefined) await setGate($, { pr, phase: 'gate' })
    else {
      const at = await read($, gate)
      if (at?.phase === 'merging') void settleMerge($, config, at.pr)
      // The next command was picked at merge time: it stands for the turn that follows the merge, no longer.
      else if (at?.phase === 'merged') await setGate($, null)
    }
    return done
  })

  // A typed reply: the merge word counts as the button's press, anything else hides the button until the gate returns.
  on('prompt.submit', async ($, e, next) => {
    const at = await read($, gate)
    if (at?.phase === 'gate') await setGate($, e.text.trim() === config.mergeReply ? { ...at, phase: 'merging' } : null)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await setGate($, null)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gh-pane',
      description: "Open or hide a pane of this repo's issues and PRs in run order",
      // Typed mid-turn, the pane opens or hides at once instead of waiting for the turn to end.
      immediate: true,
    })
    $.clock.every(120_000, () => refreshIfOpen($, config))
    return next(e)
  })

  // Run again while the pane is open, the command hides it, so one key binding shows and hides it as the band's button does.
  // An unreadable pane list reads as closed, as on the band, so the command still opens the pane.
  on('command.run', { command: 'gh-pane' }, async $ => {
    if (await isOpen($).catch(() => false)) {
      await hide($)
      return { text: 'gh-pane hidden.' }
    }
    const opened = await show($, config)
    return { text: opened.isPlaced ? 'gh-pane opened.' : `gh-pane is waiting: ${opened.reason}` }
  })

  // Closed by the person's close mark; an unload runs none of the opener's hooks.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    $.ui.invalidate('ui.render')
    return closed
  })

  // One button above the prompt that shows or hides the pane; whatever another plugin draws there stays above it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text, Button }: E = $.ui.resolve(e)
    // An unreadable pane list or gate reads as closed: a throw here would take the band of every plugin beneath with it.
    const shown = await isOpen($).catch(() => false)
    const at = await read($, gate).catch(() => null)
    const upNext = at?.phase === 'merged' ? at.next : undefined
    const toast = (error: unknown) => $.ui.toast(`gh-pane: ${messageOf(error)}`)
    return (
      <Box flexDirection="column">
        {below}
        <Box gap={2}>
          <Button
            key="toggle"
            plain
            label={`${shown ? 'Hide' : 'Open'} gh-pane ${config.buttonIcon}`.trim()}
            onPress={() => (shown ? hide($) : show($, config)).catch(toast)}
          />
          {at?.phase === 'gate' && <Button key="merge" hotkey="m" label={`merge PR #${at.pr}`} onPress={() => pressMerge($, config, at).catch(toast)} />}
          {at?.phase === 'merging' && <Text color="cyan">{`merging PR #${at.pr}…`}</Text>}
          {upNext && <Button key="next" hotkey="n" label={`clear + ${upNext.text}`} onPress={() => pressNext($, upNext).catch(toast)} />}
        </Box>
      </Box>
    )
  })

  // A gh call or a push moves issues and PRs: re-read once it has run. Each word counts only where a command starts
  // or follows a space or shell operator, and git's global options (`-C <path>`, `-c <key=value>`, `--no-pager`) may
  // sit before `push`.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/(?:^|[\s;&|(])(?:gh\s|git\s+(?:-[Cc]\s+\S+\s+|-\S+\s+)*push\b)/.test(e.command)) void refreshIfOpen($, config)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link }: E = $.ui.resolve(e)
    // A snapshot an older version wrote (no `ci`) may still be in `$.state` once the mod reloads, and draws as none.
    const stored = await read($, snapshot)
    const view = (stored !== null && !('error' in stored) && !('ci' in stored) ? null : stored) ?? (kept?.cwd === (await $.session.cwd()) ? kept.view : null)
    const room = e.props.bodyColumns
    if (view === null) return <Text dimColor>Reading the repo over gh api…</Text>
    // A failed read (a network blip) holds the pane until the next re-read, so retry starts one now.
    if ('error' in view) {
      return (
        <Box gap={1}>
          <Text color="red">{cut(view.error, room - 10)}</Text>
          <Button key="retry" label="retry" onPress={() => refreshIfOpen($, config)} />
        </Box>
      )
    }
    if (view.issues.length === 0 && view.prs === 0) return <Text dimColor>{`Nothing open in ${view.repo}.`}</Text>

    const { byNumber, mapOf, isMapTicket, roots, waiting } = arrange(view, config)
    const ref = (n: number, kind: 'issues' | 'pull' = 'issues') => (
      <Link href={(kind === 'issues' && byNumber.get(n)?.url) || `https://github.com/${view.repo}/${kind}/${n}`} label={`#${n}`} />
    )
    const blockers = (list: Issue['blockers']) =>
      list.flatMap(({ label, url }, i) => [...(i === 0 ? [] : [', ']), <Link key={label} href={url} label={label} />])
    const runs = new Map(
      view.issues
        .filter(issue => issue.assignees.length > 0)
        .map(issue => [issue.number, runLine({ ...issue, now: view.fetchedAt, hasPr: issue.pr !== undefined, expectsPr: mapOf(issue) === undefined })] as const),
    )
    const lines = [...runs.values()].filter(line => line !== null)
    const stale = lines.filter(line => line.isStale).length
    // Ready now: every row with a button that starts work, a ship or a map's next.
    const ready = view.issues.filter(issue => {
      const state = stateOf(issue, config, isMapTicket(issue))
      return state.isReady || state.isNext
    }).length
    const isCapFull = view.prs >= config.prCap

    const triage = (issues: number[]) =>
      fill(config.triageCommand, { issues: issues.length === 1 ? `${issues[0]}` : `${issues.map(n => `#${n}`).join(', ')} one by one` })

    // The labels a row shows: all but the state labels its tag already says.
    const stateLabels = [config.needsTriage, config.needsInfo, config.readyForAgent, config.readyForHuman, config.mapLabel]
    const colorOf = (issue: Issue, label: string) => `#${issue.labelColors[label] || 'ededed'}`
    const ciMark = { pass: ['✓', 'green'], fail: ['✗', 'red'], running: ['●', 'yellow'] } as const

    if (!expansion.has(view.repo)) expansion.set(view.repo, { all: false, flipped: new Set() })
    const expanded = expansion.get(view.repo)!
    const toggle = (n: number) => {
      if (!expanded.flipped.delete(n)) expanded.flipped.add(n)
      $.ui.invalidate('ui.render')
    }

    const row = (issue: Issue, prefix: string) => {
      const state = stateOf(issue, config, isMapTicket(issue))
      const labels = issue.labels.filter(label => !stateLabels.includes(label))
      const ci = state.pr === undefined ? undefined : view.ci[state.pr]
      const isExpanded = expanded.all !== expanded.flipped.has(issue.number)
      const bar = '█'.repeat(Math.round((issue.subs.done / Math.max(1, issue.subs.total)) * 8)).padEnd(8, '░')
      const run = runs.get(issue.number)
      const pad = `${prefix.replace('├', '│').replace(/[└•]/, ' ')}  ↳`
      const indent = pad.replace('↳', ' ')
      const facts = [
        ...(issue.assignees.length > 0 && !state.tag.startsWith('claimed') ? [issue.assignees.join(', ')] : []),
        `updated ${age(view.fetchedAt, issue.updatedAt)}`,
        `${issue.comments} comment${issue.comments === 1 ? '' : 's'}`,
        ...(issue.milestone ? [issue.milestone] : []),
      ]
      // The row's buttons, each named by its label: what it fills in the prompt.
      const buttons = [
        state.isReady && { name: 'ship', fills: () => fill(config.shipCommand, { n: issue.number }) },
        state.isNext && { name: 'next', fills: () => fill(config.mapCommand, { map: mapOf(issue)!, n: issue.number }) },
        state.isDone && { name: 'close', fills: () => fill(config.closeRequest, { n: issue.number, total: issue.subs.total }) },
        has(issue, config.needsTriage) && { name: 'triage', fills: () => triage([issue.number]) },
      ].flatMap(button => button || [])
      // What follows a collapsed title, measured, each part with its one-column gap: the dots, the count, the tag, the
      // CI mark and the buttons.
      const tail = [
        labels.length,
        issue.subs.total > 0 ? `${issue.subs.done}/${issue.subs.total}`.length : 0,
        `${state.tag}${state.pr === undefined ? '' : `#${state.pr}`}${(state.blockers ?? []).map(b => b.label).join(', ')}`.length,
        ci ? 1 : 0,
        ...buttons.map(button => button.name.length),
      ].reduce((sum, width) => sum + (width > 0 ? width + 1 : 0), 0)
      // The prefix, the toggle and `#N `, each with its gap, and one spare column.
      const titleRoom = Math.max(8, room - prefix.length - 3 - `#${issue.number} `.length - tail - 1)
      return [
        <Box key={`row-${issue.number}`} gap={1}>
          <Text dimColor>{prefix}</Text>
          <Button key={`toggle-${issue.number}`} plain label={isExpanded ? '▾' : '▸'} onPress={() => toggle(issue.number)} />
          <Text bold={state.isReady === true}>
            {ref(issue.number)}
            {isExpanded ? '' : ` ${cut(issue.title, titleRoom)}`}
          </Text>
          {!isExpanded && labels.length > 0 && (
            <Text>
              {labels.map(label => (
                <Text key={`dot-${issue.number}-${label}`} color={colorOf(issue, label)}>
                  ●
                </Text>
              ))}
            </Text>
          )}
          {issue.subs.total > 0 && <Text dimColor>{`${isExpanded ? `${bar} ` : ''}${issue.subs.done}/${issue.subs.total}`}</Text>}
          <Text color={state.color}>
            {state.tag}
            {state.pr !== undefined ? ref(state.pr, 'pull') : ''}
            {state.blockers ? blockers(state.blockers) : ''}
          </Text>
          {ci && <Text color={ciMark[ci][1]}>{ciMark[ci][0]}</Text>}
          {buttons.map(({ name, fills }) => (
            <Button key={`${name}-${issue.number}`} plain label={name} onPress={() => propose($, fills())} />
          ))}
        </Box>,
        // The title on lines of its own: wrapped inside the first line's row, it wrapped the prefix and tag too (2.1.296).
        isExpanded && (
          <Box key={`title-${issue.number}`} gap={1}>
            <Box flexShrink={0}>
              <Text dimColor>{indent}</Text>
            </Box>
            <Box flexShrink={1}>
              <Text bold={state.isReady === true} wrap="wrap">
                {issue.title}
              </Text>
            </Box>
          </Box>
        ),
        run && (
          <Box key={`run-${issue.number}`} gap={1}>
            <Text dimColor>{pad}</Text>
            <Text color={run.isStale ? 'red' : 'cyan'} bold={run.isStale}>
              {cut(run.text, Math.max(12, room - pad.length - 12))}
            </Text>
            {run.isStale && (
              <Button
                key={`release-${issue.number}`}
                plain
                label="release"
                onPress={() => propose($, fill(config.releaseRequest, { n: issue.number, user: issue.assignees.join(', ') }))}
              />
            )}
          </Box>
        ),
        isExpanded && labels.length > 0 && (
          <Box key={`chips-${issue.number}`} gap={1}>
            <Box flexShrink={0}>
              <Text dimColor>{indent}</Text>
            </Box>
            <Box flexShrink={1} gap={1} flexWrap="wrap">
              {labels.map(label => (
                <Text key={`chip-${issue.number}-${label}`} backgroundColor={colorOf(issue, label)} color={inkOn(colorOf(issue, label))}>
                  {` ${label} `}
                </Text>
              ))}
            </Box>
          </Box>
        ),
        isExpanded && (
          <Box key={`facts-${issue.number}`} gap={1}>
            <Text dimColor>{indent}</Text>
            <Text dimColor>{facts.join(' · ')}</Text>
          </Box>
        ),
      ]
    }

    // Each sub-issue below `issue`, at every depth.
    const branch = (issue: Issue, indent: string): ReturnType<typeof row> => [
      issue.subs.done > 0 ? <Text key={`done-${issue.number}`} dimColor>{`${indent}├ ✓ ${issue.subs.done} done`}</Text> : undefined,
      ...issue.children.flatMap((n, i) => {
        const isLast = i === issue.children.length - 1
        const child = byNumber.get(n)!
        return [...row(child, `${indent}${isLast ? '└' : '├'}`), ...branch(child, `${indent}${isLast ? ' ' : '│'} `)]
      }),
    ]

    return (
      <Box flexDirection="column" width={room}>
        <Text color={isCapFull ? 'yellow' : undefined} dimColor={!isCapFull}>
          {`PR cap ${view.prs}/${config.prCap} · ready now: ${ready} · runs: ${lines.length - stale} active · ${stale} stale`}
        </Text>
        <Box gap={1}>
          <Button key="refresh" plain label="↻" onPress={() => refreshIfOpen($, config)} />
          <Button
            key="expand"
            plain
            hotkey="e"
            label={expanded.all ? 'collapse all' : 'expand all'}
            onPress={() => {
              expanded.all = !expanded.all
              expanded.flipped.clear()
              $.ui.invalidate('ui.render')
            }}
          />
        </Box>
        {roots.map(root =>
          root.subs.total === 0 ? (
            row(root, '•')
          ) : (
            <Box key={`tree-${root.number}`} flexDirection="column" marginTop={1}>
              {row(root, '•')}
              {branch(root, '  ')}
            </Box>
          ),
        )}
        {waiting.map(({ name, issues, canTriage }) =>
          issues.length === 0 ? null : (
            <Box key={name} flexDirection="column" marginTop={1}>
              <Box gap={1}>
                <Text bold color="gray">{`${name} (${issues.length})`}</Text>
                {canTriage && issues.length > 1 && (
                  <Button key="triage-all" plain label="triage all" onPress={() => propose($, triage(issues.map(issue => issue.number)))} />
                )}
              </Box>
              {issues.flatMap((issue, i) => row(issue, i === issues.length - 1 ? '  └' : '  ├'))}
            </Box>
          ),
        )}
      </Box>
    )
  })
}
