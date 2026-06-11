# Publishing packages from other repos

This repo is the pacman repository. Individual package repos can build their own
`*.pkg.tar.zst` files and push them here automatically.

## One-time setup

### 1. Create a fine-grained GitHub token

Create a fine-grained personal access token with access only to this repository:

- Repository: `matthewyjiang/mjiang-extras`
- Permission: **Contents: Read and write**

Suggested secret name in each package repo:

```text
MJIANG_EXTRAS_PUSH_TOKEN
```

Add it at:

```text
Package repo → Settings → Secrets and variables → Actions → New repository secret
```

### 2. Check workflow permissions

In each package repo, check:

```text
Settings → Actions → General → Workflow permissions
```

Recommended:

- **Read repository contents and packages permissions** is enough if using the PAT above.
- If a workflow also pushes to its own repo, use **Read and write permissions**.

Also ensure Actions are enabled for the package repo.

### 3. Branch protection note

If `mjiang-extras` has branch protection on `main`, allow the token/user to push,
or publish to a PR branch instead. The simple workflow below assumes direct push to
`main` is allowed.

## Package repo workflow template

Put this in the package source repo as:

```text
.github/workflows/publish-arch-package.yml
```

```yaml
name: publish-arch-package

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    container: archlinux:latest

    steps:
      - name: Install build tools
        run: |
          pacman -Sy --noconfirm base-devel git pacman-contrib

      - name: Checkout package repo
        uses: actions/checkout@v4

      - name: Build package
        run: |
          makepkg -s --noconfirm

      - name: Checkout mjiang-extras
        uses: actions/checkout@v4
        with:
          repository: matthewyjiang/mjiang-extras
          token: ${{ secrets.MJIANG_EXTRAS_PUSH_TOKEN }}
          path: mjiang-extras

      - name: Publish package files
        run: |
          set -euo pipefail

          chmod +x mjiang-extras/scripts/publish-packages.sh
          mjiang-extras/scripts/publish-packages.sh --repo-dir mjiang-extras ./*.pkg.tar.zst

          cd mjiang-extras
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add x86_64/
          git commit -m "Update packages from ${{ github.repository }}" || exit 0
          git push
```

## Notes

- Split packages and debug packages are supported. The script detects every built
  package name with `pacman -Qp`, removes older archives for those names, then
  copies the new archives.
- Packages with `arch=('any')` still publish into `x86_64/` because this repo is
  served at `https://repo.matthewyjiang.com/$arch`.
- The `mjiang-extras` repo signs packages centrally. After a package repo pushes
  new `*.pkg.tar.zst` files, the `sign-repo` workflow creates/refreshes package
  signatures and signed repo metadata. See [Repository signing](signing.md).
- If builds require AUR dependencies or custom system packages, add them to the
  `Install build tools` step before `makepkg`.
- For manual publishing from a local checkout, build packages, clone this repo,
  then run:

```bash
mjiang-extras/scripts/publish-packages.sh --repo-dir mjiang-extras /path/to/*.pkg.tar.zst
```
