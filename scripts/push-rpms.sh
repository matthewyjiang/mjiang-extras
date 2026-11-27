#!/usr/bin/env bash
# Publish RPMs into a checkout of this repo, commit, and push to main, retrying
# when another publisher or sign-fedora-repo wins the race. Package repos call
# this from CI instead of scripting git themselves.
#
# Every Fedora writer rewrites fedora/x86_64/repodata, so `git pull --rebase`
# would conflict. Each attempt instead resets to the fresh origin/main and
# reruns publish-rpms.sh there.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/push-rpms.sh --repo-dir DIR --message MESSAGE RPM...

DIR must be a git checkout of mjiang-extras with push credentials. Any local
changes in DIR are discarded: each attempt starts from origin/main.
EOF
}

# Wrapped in a function so bash has parsed the whole script before
# `git reset --hard` can rewrite this file underneath it.
main() {
  local repo_dir="" message="" packages=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo-dir)
        repo_dir="${2:?missing value for --repo-dir}"
        shift 2
        ;;
      --message)
        message="${2:?missing value for --message}"
        shift 2
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        packages+=("$(realpath "$1")")
        shift
        ;;
    esac
  done

  if [[ -z "$repo_dir" || -z "$message" || ${#packages[@]} -eq 0 ]]; then
    usage >&2
    return 2
  fi

  cd "$repo_dir"
  local attempt
  # Five attempts with linear backoff: writers are a handful of CI jobs that
  # each finish in seconds, so this covers far more overlap than happens.
  for attempt in 1 2 3 4 5; do
    git fetch --quiet origin main
    git reset --quiet --hard origin/main
    bash scripts/publish-rpms.sh --repo-dir . "${packages[@]}"
    git add fedora/
    if git diff --cached --quiet; then
      echo "No Fedora package changes to publish."
      return 0
    fi
    git commit --quiet -m "$message"
    if git push --quiet origin HEAD:main; then
      echo "Pushed: $message"
      return 0
    fi
    echo "Push attempt $attempt lost a race; retrying"
    sleep $((attempt * 5))
  done
  echo "error: could not push after $attempt attempts" >&2
  return 1
}

main "$@"
exit
