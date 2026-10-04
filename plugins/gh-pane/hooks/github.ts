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

/** The open backlog, `layout` matching each claimed issue to its ship worktree. */
export async function readBacklog(run: Runner, layout: string, now: string): Promise<Snapshot> {
  const remote = (await run(['git', 'remote', 'get-url', 'origin'])).trim()
  const repo = /github\.com[:/](.+?)(?:\.git)?$/.exec(remote)?.[1]
  if (repo === undefined) throw new Error(`origin is not on GitHub: ${remote}`)
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
  const byNumber = new Map(issues.map(issue => [issue.number, issue]))

  await Promise.all(
    issues.flatMap((issue, i) => [
      issue.subs.total > 0 &&
        list(run, `repos/${repo}/issues/${issue.number}/sub_issues?per_page=100`).then(subs => {
          issue.children = subs.map(s => s.number as number).filter(n => byNumber.has(n))
          for (const n of issue.children) byNumber.get(n)!.parent = issue.number
        }),
      raws[i]!.issue_dependencies_summary?.blocked_by > 0 &&
        list(run, `repos/${repo}/issues/${issue.number}/dependencies/blocked_by`).then(blockers => {
          issue.blockers = blockers.filter(b => b.state === 'open').map(b => b.number)
        }),
      issue.assignees.length > 0 &&
        list(run, `repos/${repo}/issues/${issue.number}/events?per_page=100`).then(events => {
          issue.claimedAt = events.findLast(ev => ev.event === 'assigned')?.created_at
        }),
    ]),
  )
  return { repo, issues, prs: prs.length, fetchedAt: now }
}
