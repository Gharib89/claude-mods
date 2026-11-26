#!/usr/bin/env bash
# merge-form-guard: ship-run's PreToolUse hook on Bash, declared in its SKILL.md
# frontmatter. A call to `merge.sh` or `run-file.sh gate admit` passes only in
# the bare form: the script path (`.claude/skills/ship-run/scripts/...`, or the
# absolute path of an install with no project copy) and literal arguments,
# nothing else in the command. That is the form the owner's allow rules match;
# any other form (a `cd` prefix, a variable, `;`, `&&`, a pipe, a redirect, a
# newline) falls to the auto-mode classifier, which refused about a third of
# them with no owner word in the transcript (#1419).
#
# stdin: the hook's JSON ({cwd, tool_input: {command}}).
# Exit 0 lets the call through: any other command and the bare form. A
# failure of the script's own exits 0 or, under `set -u`, 1: never 2, the one
# code Claude Code reads as a refusal, so the guard never blocks on its error.
# Exit 2 refuses, printing on stderr the bare command per call, in order, with
# the command's own `NAME=value` assignments resolved, `$PWD` and a `cd <dir>`
# turned into a literal path, and redirects and pipes dropped.
#
# Quoting is judged as the shell would: a single-quoted `--ruling` holding `;`
# or `$` is still bare. The lexer is deliberately small (no heredocs, no nested
# substitutions): a command it misreads is one it refuses, never one it passes,
# since only a lone gated call whose words rebuild exactly passes.

set -uo pipefail
input=$(cat) || exit 0
case $input in *merge.sh* | *run-file.sh*) ;; *) exit 0 ;; esac
command -v jq >/dev/null 2>&1 || exit 0
cmd=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null) || exit 0
cwd=$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null) || cwd=
case $cmd in *merge.sh* | *run-file.sh*) ;; *) exit 0 ;; esac

# lex <string>: appends its segments (split at unquoted ; & && | || newline and
# parens) to segs, each its words (split at unquoted blanks) joined by US,
# quotes kept in the words. Sets sep, redir and dollar when it meets an
# unquoted separator, an unquoted redirect, or a `$` or backtick outside single
# quotes; a newline anywhere counts as a separator.
US=$'\037'
segs=() sep=0 redir=0 dollar=0
lex() {
  local s=$1 i=0 n=${#1} c nx q='' word='' seg=''
  while [ "$i" -le "$n" ]; do
    c=${s:i:1} nx=${s:i+1:1}
    [ "$c" = $'\n' ] && sep=1
    if [ "$i" = "$n" ]; then c=$'\n'; q=''
    elif [ "$q" = "'" ]; then word+=$c; [ "$c" = "'" ] && q=''; i=$((i + 1)); continue
    elif [ "$q" = '"' ]; then
      word+=$c
      case $c in
        \\) word+=$nx; [ "$nx" = $'\n' ] && sep=1; i=$((i + 1)) ;;
        '"') q='' ;;
        '$' | '`') dollar=1 ;;
      esac
      i=$((i + 1)); continue
    fi
    case $c in
      "'" | '"') q=$c; word+=$c ;;
      \\) word+=$c$nx; [ "$nx" = $'\n' ] && sep=1; i=$((i + 1)) ;;
      ' ' | $'\t' | $'\n' | ';' | '(' | ')' | '&' | '|')
        case $c in
          '&') if [ "${word: -1}" = '>' ] || [ "$nx" = '>' ]; then word+=$c; i=$((i + 1)); continue; fi ;;
        esac
        [ -n "$word" ] && seg+="$word$US"; word=''
        case $c in ' ' | $'\t') ;; *)
          [ "$i" -lt "$n" ] && sep=1
          [ -n "$seg" ] && segs+=("$seg"); seg=''
          case $c$nx in '&&' | '||' | '|&') i=$((i + 1)) ;; esac ;;
        esac ;;
      '<' | '>') redir=1; word+=$c ;;
      '$' | '`') dollar=1; word+=$c ;;
      *) word+=$c ;;
    esac
    i=$((i + 1))
  done
}
lex "$cmd"

# Variables the command assigns, and the directory a `cd` moved to.
names=() values=() cdir='' unresolved=0
# expand <word>: sets X to the word with $NAME and ${NAME} replaced where known,
# a single-quoted word kept. A global, not a $(...), so `unresolved` survives.
expand() {
  local w=$1 out='' name val k=0
  case $w in "'"*) X=$w; return ;; esac
  while [[ $w =~ \$\{?([A-Za-z_][A-Za-z0-9_]*)\}? ]]; do
    out+=${w%%"${BASH_REMATCH[0]}"*}; w=${w#*"${BASH_REMATCH[0]}"}
    name=${BASH_REMATCH[1]} val=''
    if [ "$name" = PWD ]; then val=${cdir:-$cwd}
    else
      k=0
      while [ "$k" -lt "${#names[@]}" ]; do [ "${names[k]}" = "$name" ] && val=${values[k]}; k=$((k + 1)); done
    fi
    if [ -n "$val" ]; then out+=$val; else out+=${BASH_REMATCH[0]}; unresolved=1; fi
  done
  X=$out$w
}
unquote() { case $X in \'*\' | \"*\") X=${X:1:${#X}-2} ;; esac; }

# Per segment: record its leading assignments or its `cd`, lex a quoted string
# a shell runs (after `eval`, or after `-c` or an option cluster ending in c,
# as in `bash -lc`) as commands of its own, then gate the first word that is
# ship's `merge.sh` followed by a PR number or a variable and one more word, or
# ship's `run-file.sh` followed by `gate admit`, in command position: first, or
# behind wrappers (`timeout`, `env`, `sudo`, `bash -c`, a keyword) with their
# options and option arguments, so a wrapper hides nothing. A word that is no
# wrapper ends the scan: a path another command reads as data (`grep x
# .../merge.sh 1 2`, `printf %s .../merge.sh`) is no call, and a quoted string
# nothing runs (an `echo`, a commit message) is not read. The word is ship's under a
# ship-run or ship scripts directory, behind a variable, or as `./<script>`
# after a `cd` into one; another tool's merge.sh is not.
bare=() raw=() si=0
while [ "$si" -lt "${#segs[@]}" ]; do
  IFS=$US read -r -a ws <<<"${segs[si]}"
  si=$((si + 1)) j=0 call=''
  while [[ ${ws[j]:-} =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; do
    names+=("${BASH_REMATCH[1]}"); expand "${BASH_REMATCH[2]}"; unquote; values+=("$X"); j=$((j + 1))
  done
  if [ "${ws[j]:-}" = cd ]; then
    [ -n "${ws[j + 1]:-}" ] && { expand "${ws[j + 1]}"; unquote; cdir=$X; }
    continue
  fi
  while [ "$j" -lt "${#ws[@]}" ]; do
    w=${ws[j]} nx1=${ws[j + 1]:-} nx2=${ws[j + 2]:-} pw=''
    [ "$j" -gt 0 ] && pw=${ws[j - 1]}
    case $pw in eval | -*c)
      case $w in "$'"*) w=${w:1} ;; esac
      case $w in [\'\"]*merge.sh* | [\'\"]*run-file.sh*) X=$w; unquote; lex "$X" ;; esac ;;
    esac
    expand "$w"; unquote; base=${X##*/}
    if { [ "$base" = merge.sh ] && [ -n "$nx2" ] && [[ $nx1 =~ ^[\"\']?(\$|[0-9]+[\"\']?$) ]]; } ||
      { [ "$base" = run-file.sh ] && [ "$nx1 $nx2" = 'gate admit' ]; }; then
      case $X in
        */ship-run/scripts/"$base" | */ship/scripts/"$base" | *'$'*) call=$X; break ;;
        "$base" | ./"$base") case $cdir in */ship-run/scripts* | */ship/scripts*) call=$X; break ;; esac ;;
      esac
    fi
    case $w in
      timeout | nice | ionice | env | sudo | doas | command | builtin | exec | time | nohup | \
        setsid | stdbuf | xargs | eval | bash | sh | then | do | else | '!' | '{' | -* | \
        [0-9]* | [A-Za-z_]*=*) ;;
      *) case $pw in -*) ;; *) break ;; esac ;;
    esac
    j=$((j + 1))
  done
  [ -n "$call" ] || continue
  # An absolute path is bare only with no project copy where the call runs: the
  # allow rule names the relative path, which an absolute one never matches.
  line=.claude/skills/ship-run/scripts/$base
  case $call in /*/ship-run/scripts/"$base") [ -f "${cdir:-$cwd}/$line" ] || line=$call ;; esac
  has_wt=0 skip=0
  for a in "${ws[@]:j+1}"; do
    if [ "$skip" = 1 ]; then skip=0; continue; fi
    case $a in
      [0-9]'>' | [0-9]'>>' | '>' | '>>' | '<' | '&>') skip=1; continue ;;
      [0-9]'>'* | '>'* | '<'* | '&>'*) continue ;;
      --worktree) has_wt=1 ;;
    esac
    expand "$a"; line+=" $X"
  done
  [ "$base" = merge.sh ] && [ -n "$cdir" ] && [ "$has_wt" = 0 ] && line+=" --worktree $cdir"
  case $line in *'$'* | *'`'*) unresolved=1 ;; esac
  bare+=("$line")
  r=''; for a in "${ws[@]}"; do r+=${r:+ }$a; done; raw+=("$r")
done

[ "${#bare[@]}" -gt 0 ] || exit 0
[ "${#segs[@]}" = 1 ] && [ "${#bare[@]}" = 1 ] && [ "$sep$redir$dollar" = 000 ] && [ "${bare[0]}" = "${raw[0]}" ] && exit 0

{
  echo "ship-run: this merge call is not in the bare form, so it misses the owner's allow rule and falls to the auto-mode classifier. The allow rule already exists (preflight warns when it does not): do not propose a new one. Run each line below as its own Bash call from the worktree root, with nothing before or after it (no cd, variable, ;, &&, |, redirect or newline):"
  printf '  %s\n' "${bare[@]}"
  echo "Each prints one compact JSON object that needs no trimming."
  [ "$unresolved" = 0 ] || echo "Replace each \$NAME, \$(...) or backtick still in a line with its literal value."
} >&2
exit 2
