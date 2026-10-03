import type { Register } from 'claude-code'

const TOOL = 'compact_now'
const TOOL_ID = 'mcp__smart-compact__compact_now'

// Every compaction, the threshold's included, keeps what long work needs to resume.
const KEEP = [
  'The summary must keep, verbatim, whatever of these the work has: the task and its goal;',
  'the plan and which steps are done; the current step and the next one; the branch, worktree and PR;',
  'every file being changed; decisions and open findings not yet written down;',
  'and the path of any progress or run-record file the work keeps.',
].join(' ')

type Pending = { instructions: string; resume: string }

const withKeep = (instructions: string | undefined) => [instructions, KEEP].filter(Boolean).join('\n\n')

// Shares of the auto-compact point at which Claude is told, once each, to plan a compact; highest first.
const LEVELS = [
  {
    at: 80,
    say: (pct: number) =>
      `smart-compact: context is at ${pct}% of the auto-compact point, so auto-compaction will soon cut in mid-step. Call compact_now at the very next step boundary.`,
  },
  {
    at: 60,
    say: (pct: number) =>
      `smart-compact: context is at ${pct}% of the auto-compact point. Do not compact yet: keep working and note where the next step boundary falls. compact_now becomes due at 80%.`,
  },
] as const

export const register: Register = on => {
  // A module variable: a reload between the tool call and the turn's end drops the request, which is harmless.
  let pending: Pending | undefined
  // The highest level already said; back to 0 once the context drops below the lowest (after a compaction).
  let warned = 0
  let compactAt: number | undefined

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description: [
        'Compact your own context at a step boundary you choose, then resume on your own.',
        'Call it between the steps of long work (after a check passes, before the next step starts), so the summary lands on finished work.',
        'Reminders arrive as the context fills: at 60% of the auto-compact point a heads-up, at 80% a request to call this at the very next step boundary.',
        'After the call, end your turn with a one-line status: compaction runs when the turn ends, then `resume` is submitted as the next prompt.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          instructions: {
            type: 'string',
            description:
              'What this summary must keep beyond the general keep-list: the names, numbers, paths and open decisions the next step needs.',
          },
          resume: {
            type: 'string',
            description:
              'The prompt that restarts the work after compaction, self-contained: the step to continue at and where the work keeps its record (e.g. "Continue the migration at step 4; progress is in notes/migration.md").',
          },
        },
        required: ['instructions', 'resume'],
      },
    })
    return next(e)
  })

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: 'compact_now compacts the main conversation only; call it from the main loop.' }
    const { instructions, resume } = e as unknown as Pending
    pending = { instructions, resume }
    const { context } = await $.session.usage()
    return {
      result: `Compaction queued (context ${context.percent ?? '?'}% full). End your turn now with a one-line status.`,
    }
  })

  // Every main-loop tool result: how full the context is against the auto-compact point, not the model's window.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.tool === TOOL_ID || ran.deny !== undefined) return ran
    // context.percent is against the model's window (1M on Opus 5.5); the breakdown carries the auto-compact
    // point, cached until the next compaction (seen on Claude Code 2.1.288).
    if (compactAt === undefined) {
      const { context } = await $.session.usage({ breakdown: 'summary' })
      compactAt = context.breakdown?.autoCompactThreshold ?? context.window
    }
    const { tokens } = (await $.session.usage()).context
    if (tokens === undefined) return ran
    const pct = Math.round((100 * tokens) / compactAt)
    const level = LEVELS.find(l => pct >= l.at)
    if (level === undefined) {
      warned = 0
      return ran
    }
    if (level.at <= warned) return ran
    warned = level.at
    $.ui.toast(`smart-compact: context at ${pct}% of the auto-compact point`)
    return { ...ran, context: [...(ran.context ?? []), level.say(pct)] }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const request = pending
    if (e.agentId !== undefined || request === undefined) return done
    pending = undefined
    if (e.isAborted) {
      $.ui.toast('smart-compact: turn interrupted, compaction dropped')
      return done
    }
    // $.session.compact refuses while a turn runs, so it starts once this dispatch has returned (Claude Code 2.1.288).
    $.clock.after(0, () => {
      void (async () => {
        const compacted = await $.session.compact({ instructions: withKeep(request.instructions) })
        if (compacted.skip !== undefined) {
          $.ui.toast(`smart-compact: compaction skipped (${compacted.skip}); not resuming`)
          return
        }
        // Without asUser the prompt shows as "The smart-compact plugin sent a message", which is honest (2.1.288).
        await $.prompt.submit({ text: request.resume })
      })().catch(err => $.ui.toast(`smart-compact: ${String(err)}`))
    })
    return done
  })

  // A plugin's own $.session.compact skips its own session.compact hook (Claude Code 2.1.288), so the queued path
  // above adds KEEP itself.
  on('session.compact', ($, e, next) => {
    compactAt = undefined
    return next({ ...e, instructions: withKeep(e.instructions) })
  })
}
