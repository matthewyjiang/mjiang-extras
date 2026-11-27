#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-rpms.sh [--repo-dir DIR] [--arch-dir DIR] RPM...

Copies one or more built RPMs into this dnf repo, removes older RPMs with the
same package names, and refreshes the repodata. The sign-fedora-repo workflow
signs the new RPMs and the repodata after the push.

Examples:
  scripts/publish-rpms.sh ~/rpmbuild/RPMS/*/*.rpm
  scripts/publish-rpms.sh --repo-dir mjiang-extras *.rpm
EOF
}

repo_dir="."
arch_dir="fedora/x86_64"
packages=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)
      repo_dir="${2:?missing value for --repo-dir}"
      shift 2
      ;;
    --arch-dir)
      arch_dir="${2:?missing value for --arch-dir}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      packages+=("$@")
      break
      ;;
    *)
      packages+=("$1")
      shift
      ;;
  esac
done

if [[ ${#packages[@]} -eq 0 ]]; then
  usage >&2
  exit 2
fi

command -v rpm >/dev/null || { echo "error: rpm is required" >&2; exit 1; }
command -v createrepo_c >/dev/null || { echo "error: createrepo_c is required" >&2; exit 1; }

repo_dir="$(realpath "$repo_dir")"
target_dir="$repo_dir/$arch_dir"
mkdir -p "$target_dir"

# Source RPMs are not served; skip them so a `RPMS/*/*.rpm` style glob and a
# stray SRPM both do the right thing.
for pkg in "${packages[@]}"; do
  [[ -f "$pkg" ]] || { echo "error: package not found: $pkg" >&2; exit 1; }
  pkg_abs="$(realpath "$pkg")"
  if [[ "$pkg_abs" == *.src.rpm ]]; then
    echo "Skipping source RPM $(basename "$pkg_abs")"
    continue
  fi

  pkg_name="$(rpm -qp --nosignature --qf '%{NAME}' "$pkg_abs")"
  [[ -n "$pkg_name" ]] || { echo "error: could not read package name from $pkg" >&2; exit 1; }
  echo "Publishing $pkg_name from $(basename "$pkg_abs")"

  # Remove older builds by exact RPM name, not filename prefix, so publishing
  # `foo` never deletes `foo-debug`.
  shopt -s nullglob
  for existing in "$target_dir"/*.rpm; do
    if [[ "$(rpm -qp --nosignature --qf '%{NAME}' "$existing")" == "$pkg_name" ]]; then
      rm -f "$existing"
    fi
  done
  shopt -u nullglob
  cp "$pkg_abs" "$target_dir/"
done

# Full regeneration; the repo is small. The old repomd.xml signature no longer
# matches, so drop it until sign-fedora-repo signs the new metadata.
# gzip metadata (createrepo_c defaults to zstd) so the website can read it with
# the browser's DecompressionStream. Keep flags in sync with sign-fedora-repo.sh.
rm -f "$target_dir/repodata/repomd.xml.asc"
createrepo_c --quiet --general-compress-type=gz "$target_dir"
echo "Updated $target_dir/repodata"
