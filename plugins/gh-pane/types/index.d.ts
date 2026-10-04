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

declare module 'claude-code' {
  interface PluginState {
    'gh-pane': { snapshot: Snapshot | null }
  }
}
