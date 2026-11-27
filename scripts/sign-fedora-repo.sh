#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/sign-fedora-repo.sh [--repo-dir DIR] [--arch-dir DIR] [--gpg-key KEYID]

Signs every not-yet-signed RPM in this dnf repo, regenerates the repodata, and
writes a detached signature for repodata/repomd.xml (repo_gpgcheck). Requires
the private key in the current GPG keyring and the matching public key at
mjiang-extras.gpg.

Already-signed RPMs are left byte-for-byte alone so git does not churn on
multi-megabyte binaries every run.

Environment:
  GPG_KEY_ID        Optional signing key ID, fingerprint, or email.
  GPG_PASSPHRASE    Optional passphrase for batch/CI signing.
EOF
}

repo_dir="."
arch_dir="fedora/x86_64"
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

for tool in gpg rpmsign rpmkeys createrepo_c; do
  command -v "$tool" >/dev/null || { echo "error: $tool is required" >&2; exit 1; }
done

if [[ -z "$gpg_key" ]]; then
  echo "error: signing key required via --gpg-key or GPG_KEY_ID" >&2
  exit 2
fi

repo_dir="$(realpath "$repo_dir")"
target_dir="$repo_dir/$arch_dir"
public_key="$repo_dir/mjiang-extras.gpg"
[[ -f "$public_key" ]] || { echo "error: missing public key $public_key" >&2; exit 1; }

shopt -s nullglob
packages=("$target_dir"/*.rpm)
if [[ ${#packages[@]} -eq 0 ]]; then
  # Not an error: the repo exists before the first RPM is published.
  echo "No RPMs in $target_dir; nothing to sign."
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Verify against a private rpm keyring that trusts only this repo's key, so
# "signed" means "signed by us", not by anything the host happens to trust.
rpmdb_dir="$tmp/rpmdb"
mkdir -p "$rpmdb_dir"
rpmkeys --dbpath "$rpmdb_dir" --import "$public_key"
signed_by_us() {
  rpmkeys --dbpath "$rpmdb_dir" --define '_pkgverify_level signature' --checksig "$1" >/dev/null 2>&1
}

sign_args=(--define "_gpg_name $gpg_key")
gpg_args=(--batch --yes --local-user "$gpg_key")
if [[ -n "${GPG_PASSPHRASE:-}" ]]; then
  passphrase_file="$tmp/passphrase"
  ( umask 077; printf '%s' "$GPG_PASSPHRASE" > "$passphrase_file" )
  sign_args+=(--define "_gpg_sign_cmd_extra_args --batch --pinentry-mode loopback --passphrase-file $passphrase_file")
  gpg_args+=(--pinentry-mode loopback --passphrase-file "$passphrase_file")
fi

for pkg in "${packages[@]}"; do
  if signed_by_us "$pkg"; then
    echo "Already signed: $(basename "$pkg")"
    continue
  fi
  echo "Signing $(basename "$pkg")"
  # --delsign first so a package signed by some other key is not left with two.
  rpmsign --delsign "$pkg" >/dev/null
  rpmsign "${sign_args[@]}" --addsign "$pkg"
  signed_by_us "$pkg" || { echo "error: signature check failed after signing $pkg" >&2; exit 1; }
done

# Signing rewrote package headers, so checksums in the old repodata are stale.
# Keep these createrepo_c flags in sync with scripts/publish-rpms.sh.
echo "Refreshing and signing repodata"
rm -f "$target_dir/repodata/repomd.xml.asc"
createrepo_c --quiet --general-compress-type=gz "$target_dir"
gpg "${gpg_args[@]}" --detach-sign --armor \
  --output "$target_dir/repodata/repomd.xml.asc" "$target_dir/repodata/repomd.xml"
gpg --batch --no-default-keyring --keyring "$tmp/verify.kbx" --import "$public_key" 2>/dev/null
gpg --batch --no-default-keyring --keyring "$tmp/verify.kbx" \
  --verify "$target_dir/repodata/repomd.xml.asc" "$target_dir/repodata/repomd.xml"

echo "Signed ${#packages[@]} RPM(s) and $target_dir/repodata/repomd.xml"
