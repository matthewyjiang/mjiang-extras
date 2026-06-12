# Publishing packages from package repositories

This document is an operator-facing and agent-facing runbook for setting up automatic publishing from an individual Arch package source repository into this pacman repository, `matthewyjiang/mjiang-extras`.

The intended end state is:

1. A package repo builds one or more `*.pkg.tar.zst` artifacts in GitHub Actions.
2. The workflow checks out `matthewyjiang/mjiang-extras` with a narrowly scoped token.
3. The workflow runs `scripts/publish-packages.sh` from this repo.
4. The workflow commits updated package archives under `x86_64/` and pushes to `main`.
5. This repo's central signing workflow signs packages and refreshes signed repo metadata.

## Important GitHub Actions trigger caveat

If a release workflow creates a tag using the repository `GITHUB_TOKEN`, GitHub will not trigger most other workflows from that tag push.

This means a workflow like this may not run for auto-created release tags:

```yaml
on:
  push:
    tags:
      - "v*"
```

This is expected GitHub behavior. It prevents recursive workflow execution.

Use one of these approaches:

1. **Manual or human-created tags**  
   Tag push triggers are fine when tags are pushed by a human or external token.

2. **Explicit workflow dispatch from the release workflow**  
   If a release workflow creates the tag, have it explicitly dispatch the package publishing workflow:

   ```sh
   gh workflow run publish-arch-package.yml --ref "$TAG"
   ```

   The release workflow needs:

   ```yaml
   permissions:
     actions: write
     contents: write
   ```

3. **Use a PAT/App token to create the tag**  
   If tags are created with a token other than `GITHUB_TOKEN`, normal tag push triggers can work. Prefer explicit dispatch unless there is a reason to use a separate token.

Keep the tag trigger anyway if manual tag publishing is useful, but do not rely on it for tags created by `GITHUB_TOKEN`.

## What the setup agent should ask the operator

Before editing a package repo, ask the operator for these decisions and credentials.

### Required

- **Package source repo**: owner/name, for example `matthewyjiang/steam-autostart-silent`.
- **Publishing trigger**:
  - tags only, usually `v*`;
  - manual only, via `workflow_dispatch`;
  - every push to a branch;
  - explicit dispatch from a release workflow;
  - or a combination.
- **Tag creation source**:
  - human/manual tag push;
  - release workflow using `GITHUB_TOKEN`;
  - release workflow using a PAT/App token.
- **Token availability**: confirm that the package repo has, or can be given, a GitHub Actions secret named `MJIANG_EXTRAS_PUSH_TOKEN`.
- **Build command**: confirm that `makepkg -s --noconfirm` is sufficient, or collect the exact build steps.
- **Package artifacts**: confirm the built packages will exist at `./*.pkg.tar.zst`, or collect the output path/glob.

### Often needed

- **AUR/system dependencies**: ask whether the package needs dependencies beyond `base-devel`, `git`, and `pacman-contrib`.
- **Submodules or Git LFS**: ask whether the source checkout needs `submodules: recursive` or LFS.
- **Versioning policy**: ask whether publishing should happen only on release tags, on every commit, or by manual dispatch while testing.
- **Branch protection**: ask whether `mjiang-extras/main` allows the token identity to push directly. If not, ask whether to use a pull-request workflow instead.
- **Package directory**: ask whether `PKGBUILD` lives at repo root or under a subdirectory like `packaging/arch`.
- **Release integration**: if another workflow creates release tags, ask whether the package workflow should be dispatched from that workflow.

### Do not ask for directly in chat

Do **not** ask the operator to paste a PAT or private key into chat. Ask them to create the secret in GitHub, then confirm the secret name.

## One-time setup in GitHub

### 1. Create a fine-grained GitHub token for publishing to `mjiang-extras`

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

Use the token value as the secret value. The agent should only ask the operator to confirm that the secret exists; it should not handle the token value.

### 2. Check package repo workflow permissions

In each package repo, check:

```text
Settings → Actions → General → Workflow permissions
```

Recommended:

- **Read repository contents and packages permissions** is enough if the publishing workflow only uses the PAT above.
- If a workflow also pushes to its own repo, creates releases, or dispatches other workflows, use the minimum explicit permissions needed in YAML.

For a release workflow that dispatches package publishing:

```yaml
permissions:
  actions: write
  contents: write
```

### 3. Check target repo branch protection

If `mjiang-extras` has branch protection on `main`, direct pushes must be allowed for the token identity, or the publishing workflow must push to a branch and open a pull request instead.

The template below assumes direct push to `main` is allowed.

## Agent setup procedure

When setting this up in a package repo, follow this checklist.

1. Inspect the package repo.
   - Confirm it contains a `PKGBUILD` or equivalent Arch package build setup.
   - Check whether `PKGBUILD` is at repo root or in a subdirectory.
   - Check whether `makepkg -s --noconfirm` succeeds locally or is already used in CI.
   - Look for existing `.github/workflows/*` files to avoid duplicate workflows.
2. Confirm operator answers from the section above.
3. Add or update `.github/workflows/publish-arch-package.yml`.
4. Keep token use limited to the checkout of `mjiang-extras`.
5. Do not add signing keys to the package repo. Signing is centralized in `mjiang-extras`.
6. Prefer a manual `workflow_dispatch` trigger while testing.
7. If release tags are auto-created with `GITHUB_TOKEN`, update the release workflow to explicitly dispatch this package workflow.
8. After the first run, verify that:
   - package archives were committed to `x86_64/` in `mjiang-extras`;
   - older archives for the same package names were removed;
   - the `sign-repo` workflow in `mjiang-extras` completed;
   - corresponding `.sig`, `.db`, and `.files` metadata were refreshed.

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

permissions:
  contents: read

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
          set -euo pipefail
          useradd --create-home builder
          chown -R builder:builder "$GITHUB_WORKSPACE"
          runuser -u builder -- bash -lc "cd '$GITHUB_WORKSPACE' && makepkg -s --noconfirm"

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
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add x86_64/
          git commit -m "Update packages from ${{ github.repository }}" || exit 0
          git push
```

## If `PKGBUILD` is in a subdirectory

For a repo layout like:

```text
packaging/arch/PKGBUILD
```

run `makepkg` from that directory and adjust the package glob:

```yaml
- name: Build package
  run: |
    set -euo pipefail
    useradd --create-home builder
    chown -R builder:builder "$GITHUB_WORKSPACE"
    runuser -u builder -- bash -lc "cd '$GITHUB_WORKSPACE/packaging/arch' && makepkg -s --noconfirm"

- name: Publish package files
  run: |
    set -euo pipefail

    chmod +x mjiang-extras/scripts/publish-packages.sh
    mjiang-extras/scripts/publish-packages.sh --repo-dir mjiang-extras packaging/arch/*.pkg.tar.zst

    cd mjiang-extras
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add x86_64/
    git commit -m "Update packages from ${{ github.repository }}" || exit 0
    git push
```

The `PKGBUILD` may need to locate the repo root using `$startdir` if it builds source files outside the package directory.

## Dispatching from an auto-release workflow

If a package repo has a release workflow that creates tags with `GITHUB_TOKEN`, add an explicit dispatch step after the release tag is created.

Example shell step:

```sh
gh workflow run publish-arch-package.yml --ref "$TAG"
```

Example workflow permissions:

```yaml
permissions:
  actions: write
  contents: write
```

If the release logic lives in a script, dispatch from the script after creating the GitHub Release.

Keep this package workflow trigger:

```yaml
on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
```

The tag trigger handles manual tag pushes. The explicit dispatch handles auto-created tags.

## Common adaptations

### Manual-only testing workflow

Use this trigger while validating a new package repo:

```yaml
on:
  workflow_dispatch:
```

After a successful manual run, add the final tag, branch, or release-dispatch trigger.

### Publish on release tags

Use this for package repos that cut version tags manually or with a non-`GITHUB_TOKEN` credential:

```yaml
on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
```

If tags are created by a workflow using `GITHUB_TOKEN`, also dispatch the workflow explicitly from the release workflow.

### Publish on main branch changes

Use this for package repos that should publish every change on `main`:

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
```

### Additional pacman dependencies

If the build needs system packages, extend the install step:

```yaml
- name: Install build tools
  run: |
    pacman -Sy --noconfirm base-devel git pacman-contrib cmake ninja rust sqlite
```

Also keep Arch package dependencies accurate in `PKGBUILD`:

```bash
depends=("gcc-libs" "glibc" "sqlite")
makedepends=("cargo" "sqlite")
```

### Prefer system libraries for Arch packages

For Arch packages, prefer linking against Arch system libraries instead of bundled copies when practical.

For example, if a Rust package normally uses bundled SQLite for developer convenience, make it feature-gated and build the Arch package without the bundled feature:

```toml
[features]
default = ["bundled-sqlite"]
bundled-sqlite = ["rusqlite/bundled"]

[dependencies]
rusqlite = { version = "0.31", default-features = false }
```

Then in `PKGBUILD`:

```bash
cargo build --release --locked -p package-name --no-default-features
cargo test --locked -p package-name --no-default-features
```

And add `sqlite` to `depends`/`makedepends`.

### AUR dependencies

Avoid ad-hoc, unreviewed AUR helper installs in CI when possible. Prefer one of these approaches:

1. vendor the needed build step in the package repo;
2. build required AUR dependencies explicitly before `makepkg`;
3. ask the operator whether the package should be moved into this repo or built another way.

If an AUR helper is necessary, make the choice explicit in the workflow and document why.

### Artifact glob differs from repository root

If packages are emitted elsewhere, change only the final argument to `publish-packages.sh`:

```bash
mjiang-extras/scripts/publish-packages.sh --repo-dir mjiang-extras ./out/*.pkg.tar.zst
```

### Pull-request based publishing

If direct pushes to `mjiang-extras/main` are not allowed, replace the final `git push` flow with a branch push and PR creation. Ask the operator before doing this because it changes the publishing path from automatic publishing to review-gated publishing.

## How `publish-packages.sh` behaves

The script is intentionally package-name aware:

- It reads each new package archive with `pacman -Qp`.
- It removes older archives under `x86_64/` for the same package names.
- It copies the new archives into `x86_64/`.
- It supports split packages and debug packages.

Packages with `arch=('any')` still publish into `x86_64/` because this repo is served at:

```text
https://repo.matthewyjiang.com/$arch
```

## Signing and repository metadata

Package repos should not sign packages themselves for this repository. This repo signs centrally.

After a package repo pushes new `*.pkg.tar.zst` files, the `sign-repo` workflow in `mjiang-extras` creates or refreshes:

- package signatures, `*.pkg.tar.zst.sig`;
- `x86_64/mjiang-extras.db.tar.gz` and signature;
- `x86_64/mjiang-extras.files.tar.gz` and signature.

See [Repository signing](signing.md) for signing details.

## Manual publishing from a local checkout

For emergency or one-off publishing:

```bash
# In the package repo
makepkg -s --noconfirm

# Clone or update this repo beside it
git clone git@github.com:matthewyjiang/mjiang-extras.git

# Publish the built package archives
mjiang-extras/scripts/publish-packages.sh --repo-dir mjiang-extras /path/to/package-repo/*.pkg.tar.zst

cd mjiang-extras
git add x86_64/
git commit -m "Update packages from package repo"
git push
```

The central signing workflow should still run after the push.

## Troubleshooting

- **Tag was created but package workflow did not run**: if the tag was created by a workflow using `GITHUB_TOKEN`, this is expected. Add an explicit `gh workflow run publish-arch-package.yml --ref <tag>` dispatch from the release workflow, with `actions: write` permission.
- **`Resource not accessible by integration`**: the workflow is probably using `GITHUB_TOKEN` or an under-scoped token. Confirm `MJIANG_EXTRAS_PUSH_TOKEN` exists and has `Contents: Read and write` for `matthewyjiang/mjiang-extras`. If dispatching another workflow, confirm `actions: write`.
- **`Permission denied` on `git push`**: check branch protection and token repository access.
- **`makepkg: command not found`**: confirm the job is running in `container: archlinux:latest` and installs `base-devel`.
- **`Running makepkg as root is not allowed`**: create a non-root builder user, `chown` the workspace, and run `makepkg` through `runuser`.
- **No files matched `*.pkg.tar.zst`**: confirm the build output path and adjust the artifact glob.
- **Package appears but no `.sig` file appears**: check the `sign-repo` workflow run in `mjiang-extras`.
- **Old package files remain**: confirm the new package's `pacman -Qp` package name matches the old package's name. The cleanup is by package name, not by filename prefix alone.
- **Undefined SQLite symbols while linking Rust packages**: for Arch packages, prefer system SQLite. Add `sqlite` to `depends` and `makedepends`, disable bundled SQLite features for the package build, and build with `--no-default-features` if appropriate.
