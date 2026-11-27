# Repository signing

This repository signs both package trees with the same GPG key:

- Arch: every `x86_64/*.pkg.tar.zst` package and the pacman database.
- Fedora: every `fedora/x86_64/*.rpm` and `fedora/x86_64/repodata/repomd.xml`.

Pacman users get `SigLevel = Required`:

```ini
[mjiang-extras]
SigLevel = Required
Server = https://repo.matthewyjiang.com/$arch
```

Fedora users get `gpgcheck=1` and `repo_gpgcheck=1` from
[`mjiang-extras.repo`](../mjiang-extras.repo).

## What is automated

### Arch

- `.github/workflows/sign-repo.yml` runs on package changes or manually.
- It imports a private GPG key from GitHub Actions secrets.
- It runs `scripts/sign-repo.sh` to create/refresh:
  - `x86_64/*.pkg.tar.zst.sig`
  - `x86_64/mjiang-extras.db.tar.gz.sig`
  - `x86_64/mjiang-extras.files.tar.gz.sig`
- It commits those signatures back to `main`.

### Fedora

- `.github/workflows/sign-fedora-repo.yml` runs when RPMs change, or manually.
- It runs `scripts/sign-fedora-repo.sh`, which:
  - signs only RPMs not already signed by this key (signed RPMs stay
    byte-identical, so git does not churn on large binaries);
  - regenerates `fedora/x86_64/repodata/` with `createrepo_c`;
  - writes `fedora/x86_64/repodata/repomd.xml.asc`.
- It uses the same `PACKAGE_SIGNING_KEY*` secrets as the Arch workflow.
- `.github/workflows/test-fedora-scripts.yml` exercises publish, sign, and
  `dnf install` end to end with a throwaway key on PRs that touch the scripts.

## One-time manual setup

These steps create the signing key and add it to GitHub Actions. They are manual
because the private key and passphrase should not be generated or exposed by this
repo.

### 1. Generate a signing key locally

On a trusted machine:

```bash
gpg --full-generate-key
```

Recommended choices:

- Key type: RSA and RSA, or ECC if you prefer.
- Size: 4096 for RSA.
- Expiry: 1-2 years is reasonable.
- User ID: something like `mjiang-extras package signing <matthewyjiang@gmail.com>`.
- Passphrase: use a strong passphrase.

Get the fingerprint/key ID:

```bash
gpg --list-secret-keys --keyid-format LONG
```

Use the long key ID or full fingerprint as `PACKAGE_SIGNING_KEY_ID` below.

### 2. Export the public key into this repo

```bash
gpg --armor --export PACKAGE_SIGNING_KEY_ID > mjiang-extras.gpg
git add mjiang-extras.gpg
git commit -m "Add package signing public key"
git push
```

After this is published, clients can download:

```text
https://repo.matthewyjiang.com/mjiang-extras.gpg
```

### 3. Export the private key for GitHub Actions

```bash
gpg --armor --export-secret-keys PACKAGE_SIGNING_KEY_ID > private-signing-key.asc
```

Do **not** commit this file.

### 4. Add GitHub Actions secrets

Using `gh` CLI from this repo:

```bash
gh secret set PACKAGE_SIGNING_KEY < private-signing-key.asc
gh secret set PACKAGE_SIGNING_KEY_ID --body "PACKAGE_SIGNING_KEY_ID"
gh secret set PACKAGE_SIGNING_PASSPHRASE --body "YOUR_KEY_PASSPHRASE"
```

Replace the placeholder values. If the key has no passphrase, set
`PACKAGE_SIGNING_PASSPHRASE` to an empty value or leave it unset.

Then securely delete the temporary private-key export:

```bash
shred -u private-signing-key.asc 2>/dev/null || rm -f private-signing-key.asc
```

### 5. Run the signing workflow

```bash
gh workflow run sign-repo.yml
gh run watch
```

When it finishes, pull the generated signature commit:

```bash
git pull --ff-only
```

You should see `*.sig` files in `x86_64/`.

## Client setup

After `mjiang-extras.gpg` and the signatures are published, users run:

```bash
curl -fsSL https://repo.matthewyjiang.com/mjiang-extras.gpg | sudo pacman-key --add -
sudo pacman-key --lsign-key PACKAGE_SIGNING_KEY_ID
```

Then add this to `/etc/pacman.conf`:

```ini
[mjiang-extras]
SigLevel = Required
Server = https://repo.matthewyjiang.com/$arch
```

Finally:

```bash
sudo pacman -Syy
```

Fedora clients:

```bash
sudo dnf config-manager addrepo --from-repofile=https://repo.matthewyjiang.com/mjiang-extras.repo
```

dnf prompts to import the key from `mjiang-extras.gpg` on first install.

## Key expiry

The key expires on 2028-06-10. Before then, extend it (`gpg --quick-set-expire`),
re-export `mjiang-extras.gpg`, and update the `PACKAGE_SIGNING_KEY` secret.
Clients must re-import the public key: `pacman-key --add` on Arch, and on
Fedora `sudo rpmkeys --import https://repo.matthewyjiang.com/mjiang-extras.gpg`.

## Local signing

If you want to sign from a local checkout instead of GitHub Actions:

```bash
GPG_KEY_ID=PACKAGE_SIGNING_KEY_ID scripts/sign-repo.sh          # Arch
GPG_KEY_ID=PACKAGE_SIGNING_KEY_ID scripts/sign-fedora-repo.sh   # Fedora
git add x86_64/ fedora/
git commit -m "Sign package repository"
git push
```
