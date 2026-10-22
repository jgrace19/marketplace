#!/usr/bin/env bash
# Reset the long-lived demo branch to the tagged baseline.
#
# Only refs/heads/demo/base is updated, and only with --force-with-lease
# against that ref. main and master are never checked out or pushed.
# Re-run with --yes when the reset would drop commits.

set -euo pipefail

usage() {
  echo "Usage: scripts/demo-reset.sh [--yes]" >&2
}

if [[ $# -gt 1 ]]; then
  usage
  exit 2
fi

YES=0
if [[ $# -eq 1 ]]; then
  if [[ "$1" != "--yes" ]]; then
    usage
    exit 2
  fi
  YES=1
fi

cd "$(git rev-parse --show-toplevel)"

head_ref="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$head_ref" == "main" || "$head_ref" == "master" ]]; then
  echo "error: refusing to run while HEAD is ${head_ref}." >&2
  exit 1
fi

dest_ref="refs/heads/demo/base"
tag_name="demo-baseline"

case "$dest_ref" in
  refs/heads/main|refs/heads/master)
    echo "error: refusing to update ${dest_ref}." >&2
    exit 1
    ;;
  refs/heads/demo/base)
    ;;
  *)
    echo "error: refusing to update ${dest_ref}." >&2
    exit 1
    ;;
esac

echo "Fetching ${dest_ref} and ${tag_name} from origin..."
git fetch origin "refs/heads/demo/base:refs/remotes/origin/demo/base" "refs/tags/${tag_name}:refs/tags/${tag_name}"

if ! git rev-parse --verify --quiet "refs/tags/${tag_name}^{commit}" >/dev/null; then
  echo "error: tag ${tag_name} not found." >&2
  exit 1
fi

baseline="$(git rev-parse "refs/tags/${tag_name}^{commit}")"
remote_old="$(git rev-parse refs/remotes/origin/demo/base)"

local_sha=""
if git show-ref --verify --quiet "$dest_ref"; then
  local_sha="$(git rev-parse "$dest_ref")"
fi

if [[ "$remote_old" == "$baseline" && "$local_sha" == "$baseline" ]]; then
  echo "demo/base is already at ${tag_name} (${baseline})."
  exit 0
fi

if [[ -n "$local_sha" ]]; then
  drop_count="$(git rev-list --count "$local_sha" "$remote_old" --not "$baseline")"
else
  drop_count="$(git rev-list --count "$remote_old" --not "$baseline")"
fi

if [[ "$drop_count" -gt 0 && "$YES" -ne 1 ]]; then
  echo "error: resetting demo/base to ${tag_name} would drop ${drop_count} commit(s)." >&2
  echo "Commits on origin/demo/base that are not in ${tag_name}:" >&2
  git log --oneline "${baseline}..${remote_old}" >&2 || true
  if [[ -n "$local_sha" && "$local_sha" != "$remote_old" ]]; then
    echo "Commits on local demo/base that are not in ${tag_name}:" >&2
    git log --oneline "${baseline}..${local_sha}" >&2 || true
  fi
  echo "Re-run with --yes to discard them." >&2
  exit 1
fi

if [[ "$head_ref" == "demo/base" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "error: demo/base has uncommitted changes. Commit or stash them before resetting." >&2
  exit 1
fi

# Lease is pinned to the remote demo branch we just fetched. No other ref is
# named, and this is not a bare --force push.
git push --force-with-lease="${dest_ref}:${remote_old}" origin "${baseline}:${dest_ref}"

if [[ "$head_ref" == "demo/base" ]]; then
  git reset --hard "$baseline"
elif [[ -n "$local_sha" ]]; then
  git update-ref "$dest_ref" "$baseline"
else
  git branch demo/base "$baseline"
fi

echo "demo/base now points at ${tag_name} (${baseline})."
