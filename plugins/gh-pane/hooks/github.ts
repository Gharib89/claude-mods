// Reads the session repo's open issues and PRs over GitHub REST (`gh api`), never GraphQL, which flakes 401
// mid-session (docs/adr/0001-mods-may-read-the-session-repo.md).

import type { CiState, Issue, Snapshot } from '../types'
import { closesOf, worktreeIssue } from './rules'

/** Runs argv on the host and answers how it exited, rejecting only when it could not run; register.tsx owns `$`. */
export type Runner = (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

type Raw = Record<string, any>

/** `owner/repo` from an item's `repository_url`, as GitHub spells it. */
const repoOf = (url: string) => url.slice(url.lastIndexOf('/repos/') + '/repos/'.length)

const failed = (argv: string[], stderr: string) => new Error(`${argv[0]} ${argv[1]}: ${stderr.trim().split('\n')[0]}`)

/** Runs argv and answers its stdout, throwing on any nonzero exit. */
async function stdoutOf(run: Runner, argv: string[]): Promise<string> {
  const { exitCode, stdout, stderr } = await run(argv)
  if (exitCode !== 0) throw failed(argv, stderr)
  return stdout
}

// Each page read, by the path or URL it was read from: its ETag, its body and the next page's URL. A 304 answers
// this body, and carries no Link header, so the next page comes from here too. A module variable for the reason
// register.tsx's `kept` is one: it outlives a /clear. A path names no repo (`{owner}/{repo}`), but an ETag names its
// body, so a 304 answers the right body whichever checkout read it first.
const pages = new Map<string, { etag: string; body: any; next?: string }>()

/**
 * Every page of `path`, one `gh api -i` call each, conditional on that page's last ETag: GitHub charges no rate
 * limit for a 304. Never `--paginate`, whose pagination a 304 on the first page stops (measured on gh 2.103).
 * `pick` takes a page's items from its body: every path read here answers a list, except check runs.
 */
async function list(run: Runner, path: string, pick = (body: any): Raw[] => body): Promise<Raw[]> {
  const items: Raw[] = []
  for (let url: string | undefined = path; url !== undefined; ) {
    const cached = pages.get(url)
    const argv = ['gh', 'api', '-i', ...(cached ? ['-H', `If-None-Match: ${cached.etag}`] : []), url]
    const { exitCode, stdout, stderr } = await run(argv)
    // gh prints the status line and headers on stdout, then a blank line and the body, and exits 1 on a 304.
    const end = stdout.search(/\r?\n\r?\n/)
    const head = stdout.slice(0, end)
    const isUnchanged = cached !== undefined && exitCode === 1 && /^HTTP\/\S+ 304/.test(head)
    if (exitCode !== 0 && !isUnchanged) throw failed(argv, stderr)
    const page = isUnchanged
      ? cached
      : { etag: /^etag: *(.+?)\r?$/im.exec(head)?.[1] ?? '', body: JSON.parse(stdout.slice(end)), next: /<([^>]+)>; *rel="next"/.exec(head)?.[1] }
    const got = pick(page.body)
    // A full last page stays uncached, so it is read whole next time: a 304 carries no Link header, and so could not
    // say that a page was added after it.
    if (page.next === undefined && got.length >= Number(/[?&]per_page=(\d+)/.exec(url)?.[1] ?? 30)) pages.delete(url)
    else pages.set(url, page)
    items.push(...got)
    url = page.next
  }
  return items
}

/** Runs `tasks` at most 8 at a time: GitHub's secondary rate limit refuses many concurrent requests. */
async function inTurn(tasks: (() => Promise<void>)[]) {
  const queue = [...tasks]
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let task = queue.shift(); task !== undefined; task = queue.shift()) await task()
  }))
}

/** The open backlog, `layout` matching each claimed issue to its ship worktree, in two rounds of reads. */
export async function readBacklog(run: Runner, layout: string, now: string): Promise<Snapshot> {
  // gh fills `{owner}/{repo}` from the checkout's remotes, and with none on a GitHub host fails in its own words.
  const [open, porcelain] = await Promise.all([
    list(run, 'repos/{owner}/{repo}/issues?state=open&per_page=100'),
    stdoutOf(run, ['git', 'worktree', 'list', '--porcelain']),
  ])
  // The canonical name, as GitHub spells it, from any open item; only an empty backlog reads the repo for it.
  const repo = open[0] !== undefined ? repoOf(open[0].repository_url) : (await stdoutOf(run, ['gh', 'api', 'repos/{owner}/{repo}', '--jq', '.full_name'])).trim()
  // The first worktree listed is the main checkout.
  const [main = '', ...paths] = [...porcelain.matchAll(/^worktree (.+)$/gm)].map(m => m[1]!)
  const worktrees = new Map(paths.map(path => [worktreeIssue(layout, main, path), path.slice(path.lastIndexOf('/') + 1)]))

  const prs = open.filter(raw => raw.pull_request)
  const closer = new Map(prs.flatMap(pr => closesOf(pr.body ?? '').map(n => [n, pr.number as number])))
  const raws = open.filter(raw => !raw.pull_request)
  const issues: Issue[] = raws.map(raw => ({
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    labels: raw.labels.map((l: Raw) => l.name),
    labelColors: Object.fromEntries(raw.labels.map((l: Raw) => [l.name, l.color])),
    updatedAt: raw.updated_at,
    comments: raw.comments,
    milestone: raw.milestone?.title,
    assignees: raw.assignees.map((a: Raw) => a.login),
    children: [],
    subs: { total: raw.sub_issues_summary?.total ?? 0, done: raw.sub_issues_summary?.completed ?? 0 },
    blockers: [],
    pr: closer.get(raw.number),
    worktree: worktrees.get(raw.number),
  }))
  // Sub-issues and blockers may live in another repo, so they match by url, never by number.
  const byUrl = new Map(issues.map(issue => [issue.url, issue]))

  // Check runs only: legacy commit statuses answer `pending` when a repo posts none, which would mark every PR running.
  const ci: Record<number, CiState> = {}
  await inTurn([
    ...issues.flatMap((issue, i) => [
      // A finished list: its children are closed, so none could match an open issue.
      issue.subs.total > issue.subs.done && (() =>
        list(run, `repos/{owner}/{repo}/issues/${issue.number}/sub_issues?per_page=100`).then(subs => {
          const children = subs.flatMap(s => byUrl.get(s.html_url) ?? [])
          issue.children = children.map(child => child.number)
          for (const child of children) child.parent = issue.number
        })),
      raws[i]!.issue_dependencies_summary?.blocked_by > 0 && (() =>
        list(run, `repos/{owner}/{repo}/issues/${issue.number}/dependencies/blocked_by`).then(blockers => {
          issue.blockers = blockers
            .filter(b => b.state === 'open')
            .map(b => {
              const where = repoOf(b.repository_url)
              return { label: where === repo ? `#${b.number}` : `${where}#${b.number}`, url: b.html_url }
            })
        })),
      issue.assignees.length > 0 && (() =>
        list(run, `repos/{owner}/{repo}/issues/${issue.number}/events?per_page=100`).then(events => {
          issue.claimedAt = events.findLast(ev => ev.event === 'assigned')?.created_at
        })),
    ]).filter(task => task !== false),
    ...[...new Set(issues.flatMap(issue => issue.pr ?? []))].map(n => async () => {
      const runs = await list(run, `repos/{owner}/{repo}/commits/refs/pull/${n}/head/check-runs?per_page=100`, body => body.check_runs)
      if (runs.length === 0) return
      ci[n] = runs.some(r => r.status !== 'completed')
        ? 'running'
        : runs.every(r => ['success', 'skipped', 'neutral'].includes(r.conclusion))
          ? 'pass'
          : 'fail'
    }),
  ])
  return { repo, issues, prs: prs.length, fetchedAt: now, ci }
}

/** Whether PR `n` of the session repo is merged. */
export async function isMerged(run: Runner, n: number): Promise<boolean> {
  return (await stdoutOf(run, ['gh', 'api', `repos/{owner}/{repo}/pulls/${n}`, '--jq', '.merged'])).trim() === 'true'
}
