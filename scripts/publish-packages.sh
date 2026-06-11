#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-packages.sh [--repo-dir DIR] [--arch-dir DIR] [--repo-name NAME] PACKAGE...

Copies one or more built Arch package files into this pacman repo, removes older
archives for the same package names, and refreshes the repo database.

Examples:
  scripts/publish-packages.sh ../*.pkg.tar.zst
  scripts/publish-packages.sh --repo-dir mjiang-extras *.pkg.tar.zst
EOF
}

repo_dir="."
arch_dir="x86_64"
repo_name="mjiang-extras"
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
    --repo-name)
      repo_name="${2:?missing value for --repo-name}"
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

command -v pacman >/dev/null || { echo "error: pacman is required" >&2; exit 1; }
command -v repo-add >/dev/null || { echo "error: repo-add is required; install pacman-contrib" >&2; exit 1; }

repo_dir="$(realpath "$repo_dir")"
target_dir="$repo_dir/$arch_dir"
mkdir -p "$target_dir"

for pkg in "${packages[@]}"; do
  [[ -f "$pkg" ]] || { echo "error: package not found: $pkg" >&2; exit 1; }

  pkg_abs="$(realpath "$pkg")"
  pkg_name="$(pacman -Qp "$pkg_abs" | awk '{print $1}')"

  if [[ -z "$pkg_name" ]]; then
    echo "error: could not determine package name for $pkg" >&2
    exit 1
  fi

  echo "Publishing $pkg_name from $(basename "$pkg_abs")"

  # Remove old package archives for this package, including optional signatures.
  rm -f "$target_dir/$pkg_name"-*.pkg.tar.* "$target_dir/$pkg_name"-*.pkg.tar.*.sig
  cp "$pkg_abs" "$target_dir/"
done

shopt -s nullglob
repo_packages=("$target_dir"/*.pkg.tar.zst "$target_dir"/*.pkg.tar.zst.sig)
if [[ ${#repo_packages[@]} -eq 0 ]]; then
  echo "error: no packages found in $target_dir" >&2
  exit 1
fi

repo-add "$target_dir/$repo_name.db.tar.gz" "$target_dir"/*.pkg.tar.zst

echo "Updated $target_dir/$repo_name.db.tar.gz"
