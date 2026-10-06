// gh-pane: `/gh-pane`, or the band's button above the prompt, docks a pane of the session repo's open issues and PRs
// in run order. Its buttons fill the prompt with the next command and never send it: the person reads it and presses
// Enter.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Issue, Snapshot } from '../types'
import { readBacklog } from './github'
import { fill, runLine } from './rules'

const PANE = 'gh-pane'
const snapshot = atom({ plugin: 'gh-pane', key: 'snapshot' } as const, null)

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

async function refresh($: EngineInterface, config: Config) {
  const ticket = ++reads
  const cwd = await $.session.cwd()
  const run = async (argv: string[]) => {
    const { exitCode, stdout, stderr } = await $.process.run(argv).catch((error: unknown) => {
      throw new Error(`${argv[0]} did not run (not installed, or timed out): ${messageOf(error)}`)
    })
    if (exitCode !== 0) throw new Error(`${argv[0]} ${argv[1]}: ${stderr.trim().split('\n')[0]}`)
    return stdout
  }
  const now = new Date(await $.clock.now()).toISOString()
  const next = await readBacklog(run, config.worktreeLayout, now).catch((error: unknown) => ({ error: `gh-pane: ${messageOf(error)}` }))
  if (ticket !== reads) return
  kept = { cwd, view: next }
  await update($, snapshot, () => next)
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
 * A row's state, first match wins. A map ticket (a sub-issue of a map) left open, unblocked, unclaimed and waiting on
 * neither triage nor info is next.
 */
function stateOf(
  issue: Issue,
  config: Config,
  isMapTicket: boolean,
): { tag: string; color: string; pr?: number; blockers?: Issue['blockers']; isReady?: true; isNext?: true } {
  if (issue.pr !== undefined) return { tag: 'in PR ', color: 'cyan', pr: issue.pr }
  if (issue.blockers.length > 0) return { tag: 'blocked by ', color: 'yellow', blockers: issue.blockers }
  if (issue.assignees.length > 0) return { tag: `claimed (${issue.assignees.join(', ')})`, color: 'blue' }
  if (issue.labels.includes(config.readyForAgent)) return { tag: 'ready now', color: 'green', isReady: true }
  if (issue.labels.includes(config.readyForHuman)) return { tag: 'yours', color: 'magenta' }
  const waiting = issue.labels.find(l => l === config.needsTriage || l === config.needsInfo)
  if (waiting !== undefined) return { tag: waiting, color: 'gray' }
  if (issue.labels.includes(config.mapLabel)) return { tag: 'map', color: 'gray' }
  if (isMapTicket) return { tag: 'next', color: 'green', isNext: true }
  return { tag: 'untriaged', color: 'gray' }
}

// PROTOTYPE (wayfinder #28, throwaway): merge and next buttons for the ship loop. The band's `proto` buttons switch
// the variant (A: a gate strip in the pane, B: buttons in the band, C: on the rows) and the mode (send: the button
// sends; fill: it fills and Enter sends). `sim gate` fakes a gate on the first open PR; a simulated merge sends nothing.
type Gate = { pr?: number; phase: 'gate' | 'merging' | 'merged'; isSim: boolean }
let gate: Gate | null = null
let variant: 'A' | 'B' | 'C' = 'A'
let mode: 'send' | 'fill' = 'send'
const GATE_TEXT = 'Reply "merge"'

// The first row with a button that starts work, in the pane's order: a ship or a map's next.
function nextOf(view: Snapshot | null, config: Config): { n: number; text: string; verb: string } | undefined {
  if (view === null || 'error' in view) return undefined
  const byNumber = new Map(view.issues.map(issue => [issue.number, issue]))
  const mapOf = (issue: Issue): number | undefined =>
    issue.labels.includes(config.mapLabel) ? issue.number : issue.parent === undefined ? undefined : mapOf(byNumber.get(issue.parent)!)
  const walk = (issue: Issue): Issue[] => [issue, ...issue.children.flatMap(n => walk(byNumber.get(n)!))]
  for (const issue of view.issues.filter(i => i.parent === undefined).flatMap(walk)) {
    const map = mapOf(issue)
    const state = stateOf(issue, config, map !== undefined && map !== issue.number)
    if (state.isReady) return { n: issue.number, text: fill(config.shipCommand, { n: issue.number }), verb: 'ship' }
    if (state.isNext) return { n: issue.number, text: fill(config.mapCommand, { map: map!, n: issue.number }), verb: 'next' }
  }
  return undefined
}

async function pressMerge($: EngineInterface) {
  if (gate === null) return
  if (gate.isSim) {
    gate = { ...gate, phase: 'merged' }
    $.ui.toast(`PROTOTYPE sim: ${mode === 'send' ? 'would send' : 'would fill'} "merge"; jumping to merged`)
  } else if (mode === 'send') {
    await $.prompt.submit({ text: 'merge', asUser: true })
  } else {
    await propose($, 'merge')
  }
  $.ui.invalidate('ui.render')
}

// Send: /clear, then the command; on 2.1.291 `$.command.run` refuses inside a command.run hook but runs from a press,
// and the clear resolves once the fresh session has its id. PROTOTYPE: the command is filled, not run, after the clear.
async function pressNext($: EngineInterface, text: string) {
  if (mode === 'fill') return propose($, text)
  await $.command.run({ command: 'clear' })
  gate = null
  await $.prompt.fill({ text })
  $.ui.toast(`PROTOTYPE: cleared; send mode would now run ${text} itself (filled instead)`)
}

export const register: Register = (on, options) => {
  const config = configOf(options)

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    if (e.answer.includes(GATE_TEXT)) gate = { pr: Number(/\/pull\/(\d+)/.exec(e.answer)?.[1]) || undefined, phase: 'gate', isSim: false }
    else if (gate?.phase === 'merging') gate = { ...gate, phase: 'merged' }
    $.ui.invalidate('ui.render')
    return done
  })

  on('prompt.submit', async ($, e, next) => {
    if (gate?.phase === 'gate' && !gate.isSim && e.text.trim() === 'merge') gate = { ...gate, phase: 'merging' }
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gh-pane',
      description: "Open a pane of this repo's issues and PRs in run order",
      // Typed mid-turn, the pane opens at once instead of waiting for the turn to end.
      immediate: true,
    })
    $.clock.every(120_000, () => refreshIfOpen($, config))
    return next(e)
  })

  on('command.run', { command: 'gh-pane' }, async $ => {
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
    const { Box, Button, Text }: E = $.ui.resolve(e)
    const view = (await read($, snapshot)) ?? (kept?.cwd === (await $.session.cwd()) ? kept.view : null)
    const nextUp = nextOf(view, config)
    const simPr = view !== null && !('error' in view) ? view.issues.find(issue => issue.pr !== undefined)?.pr : undefined
    // An unreadable pane list reads as closed: a throw here would take the band of every plugin beneath with it.
    const shown = await isOpen($).catch(() => false)
    return (
      <Box flexDirection="column">
        {below}
        <Box gap={2}>
          <Button
            key="toggle"
            plain
            label={`${shown ? 'Hide' : 'Open'} gh-pane ${config.buttonIcon}`.trim()}
            onPress={() => (shown ? hide($) : show($, config)).catch(error => $.ui.toast(`gh-pane: ${messageOf(error)}`))}
          />
          {variant === 'B' && gate?.phase === 'gate' && (
            <Button key="b-merge" hotkey="m" label={`merge PR #${gate.pr ?? '?'}`} onPress={() => pressMerge($).catch(error => $.ui.toast(`${messageOf(error)}`))} />
          )}
          {variant === 'B' && gate?.phase === 'merging' && <Text color="cyan">{`merging PR #${gate.pr ?? '?'}…`}</Text>}
          {variant === 'B' && gate?.phase === 'merged' && nextUp !== undefined && (
            <Button key="b-next" hotkey="n" label={`${mode === 'send' ? 'clear + ' : ''}${nextUp.text}`} onPress={() => pressNext($, nextUp.text).catch(error => $.ui.toast(`${messageOf(error)}`))} />
          )}
          <Text dimColor>│ proto:</Text>
          <Button key="p-variant" plain hotkey="v" label={`variant ${variant}`} onPress={() => { variant = variant === 'A' ? 'B' : variant === 'B' ? 'C' : 'A'; $.ui.invalidate('ui.render') }} />
          <Button key="p-mode" plain hotkey="s" label={`mode ${mode}`} onPress={() => { mode = mode === 'send' ? 'fill' : 'send'; $.ui.invalidate('ui.render') }} />
          <Button key="p-sim" plain hotkey="g" label={gate === null ? 'sim gate' : 'reset gate'} onPress={() => { gate = gate === null ? { pr: simPr, phase: 'gate', isSim: true } : null; $.ui.invalidate('ui.render') }} />
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
    const view = (await read($, snapshot)) ?? (kept?.cwd === (await $.session.cwd()) ? kept.view : null)
    const room = e.props.bodyColumns
    if (view === null) return <Text dimColor>Reading the repo over gh api…</Text>
    if ('error' in view) return <Text color="red">{cut(view.error, room)}</Text>
    if (view.issues.length === 0 && view.prs === 0) return <Text dimColor>{`Nothing open in ${view.repo}.`}</Text>

    const byNumber = new Map(view.issues.map(issue => [issue.number, issue]))
    const has = (issue: Issue, label: string) => issue.labels.includes(label)
    // A map and its tickets at every depth resolve by a closing comment, never a PR.
    const mapOf = (issue: Issue): number | undefined =>
      has(issue, config.mapLabel) ? issue.number : issue.parent === undefined ? undefined : mapOf(byNumber.get(issue.parent)!)
    const isMapTicket = (issue: Issue) => mapOf(issue) !== undefined && !has(issue, config.mapLabel)
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
    const nextUp = nextOf(view, config)
    const isAfterMerge = variant === 'C' && gate?.phase === 'merged'

    const triage = (issues: number[]) =>
      fill(config.triageCommand, { issues: issues.length === 1 ? `${issues[0]}` : `${issues.map(n => `#${n}`).join(', ')} one by one` })

    const row = (issue: Issue, prefix: string) => {
      const state = stateOf(issue, config, isMapTicket(issue))
      const bar = '█'.repeat(Math.round((issue.subs.done / Math.max(1, issue.subs.total)) * 8)).padEnd(8, '░')
      const run = runs.get(issue.number)
      const pad = `${prefix.replace('├', '│').replace(/[└•▾]/, ' ')}  ↳`
      return [
        <Box key={`row-${issue.number}`} gap={1}>
          <Text dimColor>{prefix}</Text>
          <Text bold={state.isReady === true}>
            {ref(issue.number)} {cut(issue.title, Math.max(8, room - prefix.length - 36))}
          </Text>
          {issue.subs.total > 0 && <Text dimColor>{`${bar} ${issue.subs.done}/${issue.subs.total}`}</Text>}
          <Text color={state.color}>
            {state.tag}
            {state.pr !== undefined ? ref(state.pr, 'pull') : ''}
            {state.blockers ? blockers(state.blockers) : ''}
          </Text>
          {variant === 'C' && gate?.phase === 'gate' && state.pr !== undefined && state.pr === gate.pr && (
            <Button key={`merge-${issue.number}`} hotkey="m" label="merge" onPress={() => pressMerge($).catch(error => $.ui.toast(`${messageOf(error)}`))} />
          )}
          {variant === 'C' && gate?.phase === 'merging' && state.pr === gate.pr && <Text color="cyan">◐ merging…</Text>}
          {state.isReady && (
            <Button
              key={`ship-${issue.number}`}
              {...(isAfterMerge && nextUp?.n === issue.number ? {} : { plain: true as const })}
              hotkey={isAfterMerge && nextUp?.n === issue.number ? 'n' : undefined}
              label={variant === 'C' && mode === 'send' ? 'clear + ship' : 'ship'}
              onPress={() => (variant === 'C' ? pressNext($, fill(config.shipCommand, { n: issue.number })) : propose($, fill(config.shipCommand, { n: issue.number })))}
            />
          )}
          {state.isNext && (
            <Button
              key={`next-${issue.number}`}
              {...(isAfterMerge && nextUp?.n === issue.number ? {} : { plain: true as const })}
              hotkey={isAfterMerge && nextUp?.n === issue.number ? 'n' : undefined}
              label={variant === 'C' && mode === 'send' ? 'clear + next' : 'next'}
              onPress={() =>
                variant === 'C'
                  ? pressNext($, fill(config.mapCommand, { map: mapOf(issue)!, n: issue.number }))
                  : propose($, fill(config.mapCommand, { map: mapOf(issue)!, n: issue.number }))
              }
            />
          )}
          {has(issue, config.needsTriage) && (
            <Button key={`triage-${issue.number}`} plain label="triage" onPress={() => propose($, triage([issue.number]))} />
          )}
        </Box>,
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

    // A spec tree draws in place whatever its root's label; a lone issue waiting on triage or info waits below.
    const top = view.issues.filter(issue => issue.parent === undefined)
    const isWaiting = (issue: Issue, label: string) => issue.subs.total === 0 && has(issue, label)
    const roots = top.filter(issue => !isWaiting(issue, config.needsTriage) && !isWaiting(issue, config.needsInfo))
    const waiting = [
      { name: 'needs triage', issues: top.filter(issue => isWaiting(issue, config.needsTriage)), canTriage: true },
      { name: 'needs info', issues: top.filter(issue => isWaiting(issue, config.needsInfo)), canTriage: false },
    ]

    return (
      <Box flexDirection="column" width={room}>
        <Text color={isCapFull ? 'yellow' : undefined} dimColor={!isCapFull}>
          {`PR cap ${view.prs}/${config.prCap} · ready now: ${ready} · runs: ${lines.length - stale} active · ${stale} stale`}
        </Text>
        {variant === 'A' && gate !== null && (
          <Box gap={1} borderStyle="round" borderColor={gate.phase === 'merged' ? 'green' : 'yellow'} paddingX={1}>
            {gate.phase === 'gate' && <Text color="yellow">◆ this session waits at the merge gate:</Text>}
            {gate.phase === 'gate' && (gate.pr !== undefined ? ref(gate.pr, 'pull') : <Text>PR</Text>)}
            {gate.phase === 'gate' && <Button key="a-merge" hotkey="m" label="merge" onPress={() => pressMerge($).catch(error => $.ui.toast(`${messageOf(error)}`))} />}
            {gate.phase === 'merging' && <Text color="cyan">{`◐ merging #${gate.pr ?? '?'}…`}</Text>}
            {gate.phase === 'merged' && <Text color="green">{`✓ #${gate.pr ?? '?'} merged · next:`}</Text>}
            {gate.phase === 'merged' && (nextUp === undefined ? <Text dimColor>nothing ready</Text> : <Text bold>{nextUp.text}</Text>)}
            {gate.phase === 'merged' && nextUp !== undefined && (
              <Button key="a-next" hotkey="n" label={mode === 'send' ? 'clear + next' : 'next'} onPress={() => pressNext($, nextUp.text).catch(error => $.ui.toast(`${messageOf(error)}`))} />
            )}
          </Box>
        )}
        {roots.map(root =>
          root.subs.total === 0 ? (
            row(root, '•')
          ) : (
            <Box key={`tree-${root.number}`} flexDirection="column" marginTop={1}>
              {row(root, '▾')}
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
