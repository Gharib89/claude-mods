import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const TOOL_ID = 'mcp__smart-compact__compact_now'
const SUMMARY = { messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }] }
const TURN_END = { answer: 'queued', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

// The engine's own answers to the events the mod raises or awaits: a test answers them itself (Claude Code 2.1.288).
const engine = (on: On) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 42 }, rateLimits: [] } }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.toast', (_, e) => {
    throw new Error(`unexpected toast: ${e.text}`)
  })
}

test('compact_now compacts with its instructions at turn end, then submits resume', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  const compacted: (string | undefined)[] = []
  const submitted: string[] = []
  on('session.compact', (_, e) => {
    compacted.push(e.instructions)
    return SUMMARY
  })
  on('prompt.submit', (_, e, next) => {
    submitted.push(e.text)
    return next(e)
  })

  const call = await $.tool.call({ tool: TOOL_ID, instructions: 'keep the migration plan', resume: 'Continue the migration at step 4' })
  // A plugin tool's own answer carries `result`, not `text` (2.1.288).
  expect(call.result).toMatch(/Compaction queued \(context 42% full\)/)
  expect(compacted).toHaveLength(0)

  await $.turn.complete(TURN_END)
  await clock.settle()

  expect(compacted).toHaveLength(1)
  expect(compacted[0]).toMatch(/^keep the migration plan/)
  expect(compacted[0]).toMatch(/run file/)
  expect(submitted).toEqual(['Continue the migration at step 4'])
})

test('a turn with no compact_now call compacts nothing', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  let compactions = 0
  on('session.compact', () => {
    compactions++
    return SUMMARY
  })
  await $.turn.complete(TURN_END)
  await clock.settle()
  expect(compactions).toBe(0)
})

test('a subagent cannot queue a compaction', async ($, on) => {
  engine(on)
  const call = await $.tool.call({ tool: TOOL_ID, agentId: 'sub-1', instructions: 'x', resume: 'y' })
  expect(call.deny).toMatch(/main conversation only/)
})

test('a call without both inputs is denied and queues nothing', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  let compactions = 0
  on('session.compact', () => {
    compactions++
    return SUMMARY
  })
  const call = await $.tool.call({ tool: TOOL_ID })
  expect(call.deny).toMatch(/needs both `instructions` and `resume`/)
  await $.turn.complete(TURN_END)
  await clock.settle()
  expect(compactions).toBe(0)
})

test('a threshold compaction gets the keep-list', async ($, on) => {
  let seen: string | undefined
  on('session.compact', (_, e) => {
    seen = e.instructions
    return SUMMARY
  })
  await $.session.compact({ trigger: 'auto', messages: SUMMARY.messages })
  expect(seen).toMatch(/run file/)
})

test('reminds once at 60% and once at 80% of the auto-compact point, again after a drop', async ($, on) => {
  let tokens = 0
  const toasts: string[] = []
  on('session.usage', (_, e) => ({
    value: {
      startedAt: 0,
      context: {
        window: 1_000_000,
        tokens,
        ...(e.breakdown ? { breakdown: { autoCompactThreshold: 100_000 } as never } : {}),
      },
      rateLimits: [],
    },
  }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // A built-in tool, so the test type-checks whichever MCP tools the generated types list.
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }))
  const step = async (at: number) => {
    tokens = at
    return (await $.tool.call({ tool: 'Read', file_path: 'notes.md' })).context ?? []
  }

  expect(await step(50_000)).toEqual([])
  expect(await step(61_000)).toEqual([expect.stringMatching(/61% of the auto-compact point\. Do not compact yet/)])
  expect(await step(70_000)).toEqual([])
  expect(await step(85_000)).toEqual([expect.stringMatching(/85%.*very next step boundary/)])
  expect(await step(90_000)).toEqual([])
  expect(await step(10_000)).toEqual([])
  expect(await step(62_000)).toHaveLength(1)
  expect(toasts).toHaveLength(3)
})
