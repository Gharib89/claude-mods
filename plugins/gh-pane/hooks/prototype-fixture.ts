// PROTOTYPE, throwaway: a made-up backlog drawn in place of `gh api`, covering every state the redesign touches.
// Label names and colours are claude-mods' own. Set PROTOTYPE_FIXTURE to false to read the real repo instead.

import type { Issue, Snapshot } from '../types'

export const PROTOTYPE_FIXTURE = true

const C: Record<string, string> = {
  bug: 'd73a4a', enhancement: 'a2eeef', chore: 'fef2c0', refactor: '8250df', documentation: '0075ca',
  XS: 'e4e4e7', S: 'b4b4bb', M: '71717a', L: '3f3f46', XL: '18181b',
  critical: 'b60205', high: 'd93f0b', med: 'fbca04', low: '0e8a16',
  'needs-triage': 'FBCA04', 'needs-info': 'D876E3', 'ready-for-agent': '0E8A16', 'ready-for-human': '1D76DB',
  'wayfinder:map': '5319e7', 'wayfinder:task': '5319e7', wontfix: 'ffffff',
}

const ago = (now: string, hours: number) => new Date(Date.parse(now) - hours * 3_600_000).toISOString()

export function fixture(now: string): Snapshot {
  const at = (hours: number) => ago(now, hours)
  const issue = (n: number, title: string, labels: string[], more: Partial<Issue> = {}): Issue => ({
    number: n,
    title,
    url: `https://github.com/Gharib89/claude-mods/issues/${n}`,
    labels,
    labelColors: Object.fromEntries(labels.map(l => [l, C[l] ?? 'cccccc'])),
    assignees: [],
    children: [],
    subs: { total: 0, done: 0 },
    blockers: [],
    updatedAt: at(5),
    comments: 0,
    ...more,
  })
  const issues: Issue[] = [
    issue(60, 'Spec: gh-pane shows labels with their colours, rows that expand, and a CI mark on every PR tag', ['enhancement', 'L'], {
      subs: { total: 5, done: 1 }, children: [61, 62, 63, 64], comments: 4, updatedAt: at(2), milestone: 'gh-pane 0.7',
    }),
    issue(61, 'Read label colours, updated time, comments and milestone from the issues list', ['enhancement', 'S', 'high', 'ready-for-agent'], {
      parent: 60, comments: 1, updatedAt: at(1),
    }),
    issue(62, 'Draw ▸/▾ toggles and the expand-all mode, kept past /clear', ['enhancement', 'M', 'med'], {
      parent: 60, assignees: ['Gharib89'], claimedAt: at(3), worktree: 'gh-pane-62', updatedAt: at(3),
    }),
    issue(63, 'CI mark on the in-PR tag from check runs by the PR head ref', ['enhancement', 'S', 'med'], {
      parent: 60, assignees: ['Gharib89'], pr: 71, comments: 2, updatedAt: at(0.5),
    }),
    issue(64, 'Docs: the redesigned pane in the README', ['documentation', 'XS', 'low'], {
      parent: 60, blockers: [{ label: '#62', url: 'https://github.com/Gharib89/claude-mods/issues/62' }],
    }),
    issue(65, 'Merge button stays hidden after a typed merge on a stale base, so the gate has no way forward', ['bug', 'S', 'critical'], {
      assignees: ['Gharib89'], pr: 72, comments: 6, updatedAt: at(0.2),
    }),
    issue(66, 'Toast floods when the network drops for a minute', ['bug', 'XS', 'high'], {
      assignees: ['Gharib89'], claimedAt: at(52), comments: 1, updatedAt: at(50),
    }),
    issue(67, 'Rename the band button icon option', ['chore', 'XS', 'low'], { pr: 73, updatedAt: at(8) }),
    issue(68, 'Split register.tsx: the row renderer has grown past 200 lines', ['refactor', 'M', 'ready-for-human'], {
      comments: 3, updatedAt: at(30),
    }),
    issue(69, 'Pane flickers when two refreshes land in the same second on a slow link', ['needs-triage'], { updatedAt: at(4) }),
    issue(70, 'Option to hide PR rows that are drafts', ['needs-triage', 'enhancement'], { updatedAt: at(26) }),
    issue(74, 'Which terminal fonts draw the Nerd Font mark?', ['needs-info'], { comments: 2, updatedAt: at(80) }),
  ]
  return { repo: 'Gharib89/claude-mods', issues, prs: 3, fetchedAt: now, ci: { 71: 'pass', 72: 'fail', 73: 'running' } }
}
