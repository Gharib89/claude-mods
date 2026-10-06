// The state contract of the gh-pane mod.

/** One open issue of the session repo, as the pane orders it. */
export type Issue = {
  number: number
  title: string
  url: string
  labels: string[]
  assignees: string[]
  /** Its open sub-issues in this repo, in the parent's order. */
  children: number[]
  /** Its sub-issues, all of them and the closed ones (GitHub's `sub_issues_summary`). */
  subs: { total: number; done: number }
  /** The open issue it is a sub-issue of. */
  parent?: number
  /** Its open blockers, labelled `#N` in this repo and `owner/repo#N` in another. */
  blockers: { label: string; url: string }[]
  /** The open PR whose body closes it. */
  pr?: number
  /** When it was last assigned: the claim's start. */
  claimedAt?: string
  /** The folder name of its ship worktree, when one matches the layout. */
  worktree?: string
}

export type Snapshot =
  | { repo: string; issues: Issue[]; prs: number; fetchedAt: string }
  | { error: string }

/** Where this session stands at a ship run's merge gate: the PR it names and what the band offers. */
export type Gate = {
  pr: number
  phase: 'gate' | 'merging' | 'merged'
  /** Once merged: the command the next button runs after a /clear, the first ready row's. None when nothing is ready. */
  next?: { text: string; command: string; args: string }
}

declare module 'claude-code' {
  interface PluginState {
    'gh-pane': { snapshot: Snapshot | null; gate: Gate | null }
  }
}
