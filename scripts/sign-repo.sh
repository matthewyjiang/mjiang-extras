#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/sign-repo.sh [--repo-dir DIR] [--arch-dir DIR] [--repo-name NAME] [--gpg-key KEYID]

Signs every Arch package in this pacman repo and refreshes/signs the repo
metadata database. Requires a private GPG key in the current keyring.

Environment:
  GPG_KEY_ID        Optional signing key ID, fingerprint, or email.
  GPG_PASSPHRASE    Optional passphrase for batch/CI signing.

Examples:
  scripts/sign-repo.sh --gpg-key ABCDEF1234567890
  GPG_KEY_ID=ABCDEF1234567890 scripts/sign-repo.sh
EOF
}

repo_dir="."
arch_dir="x86_64"
repo_name="mjiang-extras"
gpg_key="${GPG_KEY_ID:-}"

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
    --gpg-key)
      gpg_key="${2:?missing value for --gpg-key}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command -v gpg >/dev/null || { echo "error: gpg is required" >&2; exit 1; }
command -v repo-add >/dev/null || { echo "error: repo-add is required; install pacman-contrib" >&2; exit 1; }

if [[ -z "$gpg_key" ]]; then
  echo "error: signing key required via --gpg-key or GPG_KEY_ID" >&2
  exit 2
fi

repo_dir="$(realpath "$repo_dir")"
target_dir="$repo_dir/$arch_dir"

shopt -s nullglob
packages=("$target_dir"/*.pkg.tar.zst)
if [[ ${#packages[@]} -eq 0 ]]; then
  echo "error: no packages found in $target_dir" >&2
  exit 1
fi

gpg_args=(--batch --yes --local-user "$gpg_key")
if [[ -n "${GPG_PASSPHRASE:-}" ]]; then
  gpg_args+=(--pinentry-mode loopback --passphrase "$GPG_PASSPHRASE")
fi

for pkg in "${packages[@]}"; do
  echo "Signing $(basename "$pkg")"
  gpg "${gpg_args[@]}" --detach-sign --no-armor --output "$pkg.sig" "$pkg"
done

# Rebuild and sign both .db and .files archives. repo-add also maintains the
# mjiang-extras.db / mjiang-extras.files symlinks used by pacman.
echo "Refreshing and signing $repo_name database"
# If a passphrase is used, the package signing loop above unlocks/caches the key
# for repo-add's own gpg invocation.
repo-add --sign --key "$gpg_key" "$target_dir/$repo_name.db.tar.gz" "${packages[@]}"

echo "Signed packages and $target_dir/$repo_name.db.tar.gz"
