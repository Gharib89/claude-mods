import { expect, test } from 'claude-code/testing'

import { ageOf, cellsOf, closesOf, commandOf, fill, gatePr, mergedPrOf, pack, runLine, worktreeIssue, wrapped } from '../hooks/rules'

const NOW = '2026-10-04T12:00:00Z'
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString()

test('a claim older than 24 h with no PR is stale', () => {
  expect(runLine({ claimedAt: hoursAgo(72), now: NOW, hasPr: false })).toEqual({
    text: '! stale claim: claimed 3d ago, no PR',
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

test('one age wording: just now under an hour, then hours under a day, then days', () => {
  expect(ageOf(NOW, hoursAgo(0))).toBe('just now')
  expect(ageOf(NOW, hoursAgo(59 / 60))).toBe('just now')
  expect(ageOf(NOW, hoursAgo(1))).toBe('1h ago')
  expect(ageOf(NOW, hoursAgo(23.9))).toBe('23h ago')
  expect(ageOf(NOW, hoursAgo(24))).toBe('1d ago')
  expect(ageOf(NOW, hoursAgo(72))).toBe('3d ago')
})

test('a claim under an hour reads just now, never 0h ago', () => {
  expect(runLine({ claimedAt: hoursAgo(0.2), now: NOW, hasPr: false })).toEqual({ text: '◐ claimed just now, no PR yet', isStale: false })
})

test('pack fills lines up to the room, one column between items, and gives an item too wide a line alone', () => {
  const words = (text: string, room: number) => pack(text.split(' '), room, word => word.length).map(line => line.join(' '))
  expect(words('aa bb cc dd', 5)).toEqual(['aa bb', 'cc dd'])
  expect(words('aa bb cc', 8)).toEqual(['aa bb cc'])
  expect(words('aa bbbbbbbbbb cc', 5)).toEqual(['aa', 'bbbbbbbbbb', 'cc'])
  expect(pack([], 5, () => 1)).toEqual([])
})

test('a wide character or an emoji takes two cells, any other character one', () => {
  expect(cellsOf('abc')).toBe(3)
  expect(cellsOf('日本語')).toBe(6)
  expect(cellsOf('fix 🚀 now')).toBe(10)
  expect(cellsOf('▶ ◆ ⊘')).toBe(5)
  // Each block's edges: Hangul Jamo, CJK, Hangul, fullwidth forms, Kana Supplement, the astral ideographs.
  for (const char of ['\u1100', '\u115f', '\u4e00', '\u9fff', '\uac00', '\ud7a3', '\uff01', '\uff60', '\u{1b000}', '\u{1b2ff}', '\u{20000}', '\u{3fffd}']) expect([char, cellsOf(char)]).toEqual([char, 2])
  for (const char of ['\u10ff', '\u1160', '\uff61', '\u{1afff}', '\u{1b300}']) expect([char, cellsOf(char)]).toEqual([char, 1])
})

test('wrapped packs text by cells and breaks a word wider than the line, wide characters included', () => {
  expect(wrapped('aa bb cc', 5)).toEqual(['aa bb', 'cc'])
  // Runs of spaces and empty text leave no empty piece behind.
  expect(wrapped('ab  cd ef', 4)).toEqual(['ab', 'cd', 'ef'])
  expect(wrapped('', 10)).toEqual([])
  expect(wrapped('abcdefgh', 3)).toEqual(['abc', 'def', 'gh'])
  // Six wide characters draw 12 cells: in 5 they take three lines of at most 4.
  expect(wrapped('日本語日本語', 5)).toEqual(['日本', '語日', '本語'])
  for (const line of wrapped('修正 the 日本語のタイトル row', 8)) expect([line, cellsOf(line) <= 8]).toEqual([line, true])
})

test('a matching worktree names the run', () => {
  expect(runLine({ claimedAt: hoursAgo(5), now: NOW, hasPr: false, worktree: 'gh-pane-12' })).toEqual({
    text: '◐ ship worktree gh-pane-12',
    isStale: false,
  })
})

test('a claim that closes without a PR is never stale', () => {
  expect(runLine({ claimedAt: hoursAgo(72), now: NOW, hasPr: false, expectsPr: false })).toEqual({
    text: '◐ claimed 3d ago',
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

test('a gate answer names its PR by the first /pull/N, and only with the gate text', () => {
  const text = 'Reply "merge"'
  expect(gatePr(`${text}\nhttps://github.com/a/b/pull/42 and https://github.com/a/b/pull/7`, text)).toBe(42)
  expect(gatePr('https://github.com/a/b/pull/42', text)).toBeUndefined()
  expect(gatePr(text, text)).toBeUndefined()
  // Not a PR link: an issue, or a pull with no number.
  expect(gatePr(`${text} https://github.com/a/b/issues/42 and /pull/ and /pull/x`, text)).toBeUndefined()
  // The text is no pattern: `.` and quotes match themselves.
  expect(gatePr('Reply merge /pull/3', 'Reply "merge"')).toBeUndefined()
  expect(gatePr('Say a.c /pull/3', 'a.c')).toBe(3)
  expect(gatePr('Say abc /pull/3', 'a.c')).toBeUndefined()
  // The number ends at its digits, and `/pulls/7` is no PR path.
  expect(gatePr(`${text} /pull/42abc`, text)).toBe(42)
  expect(gatePr(`${text} /pulls/7`, text)).toBeUndefined()
})

test('a merged answer names its PR by the first /pull/N after the merged text, never one before it', () => {
  const text = 'Merged on a clean gate:'
  expect(mergedPrOf(`See https://github.com/a/b/pull/7\n${text} https://github.com/a/b/pull/42`, text)).toBe(42)
  expect(mergedPrOf(`${text} https://github.com/a/b/pull/42 and https://github.com/a/b/pull/7`, text)).toBe(42)
  expect(mergedPrOf(`https://github.com/a/b/pull/42\n${text}`, text)).toBeUndefined()
  expect(mergedPrOf('Merged https://github.com/a/b/pull/42', text)).toBeUndefined()
  // Only the merged line's own link counts: a link on a later line is some other PR.
  expect(mergedPrOf(`${text} (no link)\nSee https://github.com/a/b/pull/7`, text)).toBeUndefined()
})

test('a slash command splits into its name and args, and other text is no command', () => {
  expect(commandOf('/ship 8')).toEqual({ command: 'ship', args: '8' })
  expect(commandOf('/wayfinder 4 7')).toEqual({ command: 'wayfinder', args: '4 7' })
  expect(commandOf('  /triage #1, #2 one by one  ')).toEqual({ command: 'triage', args: '#1, #2 one by one' })
  expect(commandOf('/clear')).toEqual({ command: 'clear', args: '' })
  expect(commandOf('/plan:go a\nb')).toEqual({ command: 'plan:go', args: 'a\nb' })
  for (const text of ['ship it 7', '', '/', '/ ship', ' / ']) expect([text, commandOf(text)]).toEqual([text, undefined])
})
