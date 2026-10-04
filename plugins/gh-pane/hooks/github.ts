// Reads the session repo's open issues and PRs over GitHub REST (`gh api`), never GraphQL, which flakes 401
// mid-session (docs/adr/0001-mods-may-read-the-session-repo.md).

import type { Issue, Snapshot } from '../types'
import { closesOf, worktreeIssue } from './rules'

/** Runs argv on the host and answers its stdout, throwing on a nonzero exit; register.tsx owns `$`. */
export type Runner = (argv: string[]) => Promise<string>

type Raw = Record<string, any>

// Every path read here answers a list; --slurp wraps each page in an outer array.
const list = async (run: Runner, path: string): Promise<Raw[]> =>
  (JSON.parse(await run(['gh', 'api', '--paginate', '--slurp', path])) as Raw[][]).flat()

/** Runs `tasks` at most 8 at a time: GitHub's secondary rate limit refuses many concurrent requests. */
async function inTurn(tasks: (() => Promise<void>)[]) {
  const queue = [...tasks]
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let task = queue.shift(); task !== undefined; task = queue.shift()) await task()
  }))
}

/** The open backlog, `layout` matching each claimed issue to its ship worktree. */
export async function readBacklog(run: Runner, layout: string, now: string): Promise<Snapshot> {
  // gh fills `{owner}/{repo}` from the checkout's remotes, and with none on a GitHub host fails in its own words.
  const repo = (await run(['gh', 'api', 'repos/{owner}/{repo}', '--jq', '.full_name'])).trim()
  // The first worktree listed is the main checkout.
  const [main = '', ...paths] = [...(await run(['git', 'worktree', 'list', '--porcelain'])).matchAll(/^worktree (.+)$/gm)].map(m => m[1]!)
  const worktrees = new Map(paths.map(path => [worktreeIssue(layout, main, path), path.slice(path.lastIndexOf('/') + 1)]))

  const open = await list(run, `repos/${repo}/issues?state=open&per_page=100`)
  const prs = open.filter(raw => raw.pull_request)
  const closer = new Map(prs.flatMap(pr => closesOf(pr.body ?? '').map(n => [n, pr.number as number])))
  const raws = open.filter(raw => !raw.pull_request)
  const issues: Issue[] = raws.map(raw => ({
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    labels: raw.labels.map((l: Raw) => l.name),
    assignees: raw.assignees.map((a: Raw) => a.login),
    children: [],
    subs: { total: raw.sub_issues_summary?.total ?? 0, done: raw.sub_issues_summary?.completed ?? 0 },
    blockers: [],
    pr: closer.get(raw.number),
    worktree: worktrees.get(raw.number),
  }))
  // Sub-issues and blockers may live in another repo, so they match by url, never by number.
  const byUrl = new Map(issues.map(issue => [issue.url, issue]))

  await inTurn(
    issues.flatMap((issue, i) => [
      issue.subs.total > 0 && (() =>
        list(run, `repos/${repo}/issues/${issue.number}/sub_issues?per_page=100`).then(subs => {
          const children = subs.flatMap(s => byUrl.get(s.html_url) ?? [])
          issue.children = children.map(child => child.number)
          for (const child of children) child.parent = issue.number
        })),
      raws[i]!.issue_dependencies_summary?.blocked_by > 0 && (() =>
        list(run, `repos/${repo}/issues/${issue.number}/dependencies/blocked_by`).then(blockers => {
          issue.blockers = blockers
            .filter(b => b.state === 'open')
            .map(b => {
              const where = b.repository_url.slice(b.repository_url.lastIndexOf('/repos/') + '/repos/'.length)
              return { label: where === repo ? `#${b.number}` : `${where}#${b.number}`, url: b.html_url }
            })
        })),
      issue.assignees.length > 0 && (() =>
        list(run, `repos/${repo}/issues/${issue.number}/events?per_page=100`).then(events => {
          issue.claimedAt = events.findLast(ev => ev.event === 'assigned')?.created_at
        })),
    ]).filter(task => task !== false),
  )
  return { repo, issues, prs: prs.length, fetchedAt: now }
}
