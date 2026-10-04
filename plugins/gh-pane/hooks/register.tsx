// gh-pane: `/gh-pane` docks a pane of the session repo's open issues and PRs in run order. Its buttons fill the
// prompt with the next command and never send it: the person reads it and presses Enter.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Issue } from '../types'
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
  prCap: Number(o.prCap),
  worktreeLayout: String(o.worktreeLayout),
  shipCommand: String(o.shipCommand),
  triageCommand: String(o.triageCommand),
  releaseRequest: String(o.releaseRequest),
})

const cut = (text: string, room: number) => (text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1))}…`)

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0]

// Reads overlap (a timer, a gh call, the command): only the latest one started may land.
let reads = 0

async function refresh($: EngineInterface, config: Config) {
  const read = ++reads
  const run = async (argv: string[]) => {
    const { exitCode, stdout, stderr } = await $.process.run(argv).catch((error: unknown) => {
      throw new Error(`${argv[0]} did not run (not installed, or timed out): ${messageOf(error)}`)
    })
    if (exitCode !== 0) throw new Error(`${argv[0]} ${argv[1]}: ${stderr.trim().split('\n')[0]}`)
    return stdout
  }
  const now = new Date(await $.clock.now()).toISOString()
  const next = await readBacklog(run, config.worktreeLayout, now).catch((error: unknown) => ({ error: `gh-pane: ${messageOf(error)}` }))
  if (read === reads) await update($, snapshot, () => next)
}

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function propose($: EngineInterface, text: string) {
  const draft = (await $.prompt.read()).text.trim()
  await $.prompt.fill(draft === '' ? { text } : { text: ` ${text}`, mode: 'append' })
  $.ui.toast(`In the prompt: ${text}  (Enter sends it)`)
}

/** A row's state, first match wins. */
function stateOf(issue: Issue, config: Config): { tag: string; color: string; pr?: number; blockers?: Issue['blockers']; isReady?: true } {
  if (issue.pr !== undefined) return { tag: 'in PR ', color: 'cyan', pr: issue.pr }
  if (issue.blockers.length > 0) return { tag: 'blocked by ', color: 'yellow', blockers: issue.blockers }
  if (issue.assignees.length > 0) return { tag: `claimed (${issue.assignees.join(', ')})`, color: 'blue' }
  if (issue.labels.includes(config.readyForAgent)) return { tag: 'ready now', color: 'green', isReady: true }
  if (issue.labels.includes(config.readyForHuman)) return { tag: 'yours', color: 'magenta' }
  return { tag: issue.labels.find(l => l === config.needsTriage || l === config.needsInfo) ?? 'untriaged', color: 'gray' }
}

export const register: Register = (on, options) => {
  const config = configOf(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gh-pane',
      description: "Open a pane of this repo's issues and PRs in run order",
      // Typed mid-turn, the pane opens at once instead of waiting for the turn to end.
      immediate: true,
    })
    $.clock.every(120_000, async () => {
      if (await isOpen($)) await refresh($, config)
    })
    return next(e)
  })

  on('command.run', { command: 'gh-pane' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'GitHub' })
    await refresh($, config)
    return { text: opened.isPlaced ? 'gh-pane opened.' : `gh-pane is waiting: ${opened.reason}` }
  })

  // A gh call or a push moves issues and PRs: re-read once it has run. Each word counts only where a command starts
  // or follows a space or shell operator, and git's global options (`-C <path>`, `-c <key=value>`, `--no-pager`) may
  // sit before `push`.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/(?:^|[\s;&|(])(?:gh\s|git\s+(?:-[Cc]\s+\S+\s+|-\S+\s+)*push\b)/.test(e.command) && (await isOpen($))) {
      void refresh($, config).catch((error: unknown) => $.ui.toast(`gh-pane did not refresh: ${messageOf(error)}`))
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link }: E = $.ui.resolve(e)
    const view = await read($, snapshot)
    const room = e.props.bodyColumns
    if (view === null) return <Text dimColor>Reading the repo over gh api…</Text>
    if ('error' in view) return <Text color="red">{cut(view.error, room)}</Text>
    if (view.issues.length === 0 && view.prs === 0) return <Text dimColor>{`Nothing open in ${view.repo}.`}</Text>

    const byNumber = new Map(view.issues.map(issue => [issue.number, issue]))
    const has = (issue: Issue, label: string) => issue.labels.includes(label)
    const ref = (n: number, kind: 'issues' | 'pull' = 'issues') => (
      <Link href={(kind === 'issues' && byNumber.get(n)?.url) || `https://github.com/${view.repo}/${kind}/${n}`} label={`#${n}`} />
    )
    const blockers = (list: Issue['blockers']) =>
      list.flatMap(({ label, url }, i) => [...(i === 0 ? [] : [', ']), <Link key={label} href={url} label={label} />])
    const runs = new Map(
      view.issues
        .filter(issue => issue.assignees.length > 0)
        .map(issue => [issue.number, runLine({ ...issue, now: view.fetchedAt, hasPr: issue.pr !== undefined })] as const),
    )
    const lines = [...runs.values()].filter(line => line !== null)
    const stale = lines.filter(line => line.isStale).length
    const ready = view.issues.filter(issue => stateOf(issue, config).isReady).length
    const isCapFull = view.prs >= config.prCap

    const triage = (issues: number[]) =>
      fill(config.triageCommand, { issues: issues.length === 1 ? `${issues[0]}` : `${issues.map(n => `#${n}`).join(', ')} one by one` })

    const row = (issue: Issue, prefix: string) => {
      const state = stateOf(issue, config)
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
          {state.isReady && (
            <Button key={`ship-${issue.number}`} plain label="ship" onPress={() => propose($, fill(config.shipCommand, { n: issue.number }))} />
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
