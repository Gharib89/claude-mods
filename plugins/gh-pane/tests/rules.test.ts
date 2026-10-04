import { expect, test } from 'claude-code/testing'

import { closesOf, fill, runLine, worktreeIssue } from '../hooks/rules'

const NOW = '2026-10-04T12:00:00Z'
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString()

test('a claim older than 24 h with no PR is stale', () => {
  expect(runLine({ claimedAt: hoursAgo(72), now: NOW, hasPr: false })).toEqual({
    text: '✗ stale claim: claimed 3d ago, no PR',
    isStale: true,
  })
  // Staleness wins over a worktree: the run that made it is gone.
  expect(runLine({ claimedAt: hoursAgo(25), now: NOW, hasPr: false, worktree: 'gh-pane-12' })?.isStale).toBe(true)
})

test('a claim with a closing PR is not stale, however old', () => {
  expect(runLine({ claimedAt: hoursAgo(72), now: NOW, hasPr: true })).toBeNull()
  expect(runLine({ claimedAt: hoursAgo(72), now: NOW, hasPr: true, worktree: 'gh-pane-12' })).toEqual({
    text: '◐ ship worktree gh-pane-12',
    isStale: false,
  })
})

test('a claim under 24 h is not stale', () => {
  expect(runLine({ claimedAt: hoursAgo(5), now: NOW, hasPr: false })).toEqual({
    text: '◐ claimed 5h ago, no PR yet',
    isStale: false,
  })
  expect(runLine({ claimedAt: hoursAgo(24), now: NOW, hasPr: false })?.isStale).toBe(false)
  // No assigned event read: the age is unknown, never stale.
  expect(runLine({ now: NOW, hasPr: false })).toEqual({ text: '◐ claimed, no PR yet', isStale: false })
})

test('a matching worktree names the run', () => {
  expect(runLine({ claimedAt: hoursAgo(5), now: NOW, hasPr: false, worktree: 'gh-pane-12' })).toEqual({
    text: '◐ ship worktree gh-pane-12',
    isStale: false,
  })
})

test('a worktree path maps to its issue through the layout', () => {
  const main = '/w/claude-mods'
  const layout = '{repo}.worktrees/{slug}-{n}'
  expect(worktreeIssue(layout, main, '/w/claude-mods.worktrees/gh-pane-12')).toBe(12)
  expect(worktreeIssue(layout, main, '/w/claude-mods.worktrees/fix-2-step-112')).toBe(112)
  expect(worktreeIssue(layout, main, '/w/claude-mods')).toBeUndefined()
  expect(worktreeIssue(layout, main, '/w/claude-mods.worktrees/a/b-12')).toBeUndefined()
  expect(worktreeIssue(layout, main, '/w/other.worktrees/gh-pane-12')).toBeUndefined()
  expect(worktreeIssue(layout, main, '/w/claude-mods.worktrees/gh-pane-12x')).toBeUndefined()
  // The repo name is literal text, not a pattern: its dot matches a dot only.
  expect(worktreeIssue(layout, '/w/my.repo', '/w/myXrepo.worktrees/s-3')).toBeUndefined()
  expect(worktreeIssue(layout, '/w/my.repo', '/w/my.repo.worktrees/s-3')).toBe(3)
  expect(worktreeIssue('wt/{repo}/{n}', main, '/w/wt/claude-mods/7')).toBe(7)
})

test('a PR body closes the issues its closing keywords name', () => {
  expect(closesOf('Closes #12')).toEqual([12])
  expect(closesOf('fixes #3, resolves #4 and Fixed: #5')).toEqual([3, 4, 5])
  expect(closesOf('Refs #12, see #13; discloses #14; closes #15x')).toEqual([])
  expect(closesOf('closes owner/repo#9')).toEqual([])
})

test('a template fills each placeholder it has a value for, and leaves the rest verbatim', () => {
  expect(fill('/ship {n} {title}', { n: 7 })).toBe('/ship 7 {title}')
  expect(fill('/ship {n}, then {n} again', { n: 7 })).toBe('/ship 7, then 7 again')
  expect(fill('no placeholder here', { n: 7 })).toBe('no placeholder here')
  // A value lands literally, `$&` included, and an inherited key is not a value.
  expect(fill('free {user}', { user: '$& and $1' })).toBe('free $& and $1')
  expect(fill('{constructor} {toString}', {})).toBe('{constructor} {toString}')
})
