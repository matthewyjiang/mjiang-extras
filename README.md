# mjiang-extras

Browse the package database at <https://repo.matthewyjiang.com/>.

## Arch Linux

Add this repo to your system:
```bash
curl -fsSL https://repo.matthewyjiang.com/mjiang-extras.gpg | sudo pacman-key --add -
sudo pacman-key --lsign-key 8269F3B4ED361F6BE6C0233DD113C94146264D14
printf '\n[mjiang-extras]\nSigLevel = Required\nServer = https://repo.matthewyjiang.com/$arch\n' | sudo tee -a /etc/pacman.conf
sudo pacman -Syy
```

## Fedora

Fedora 44 and newer, x86_64:
```bash
sudo dnf config-manager addrepo --from-repofile=https://repo.matthewyjiang.com/mjiang-extras.repo
sudo dnf install rho-coding-agent
```

dnf asks to import the signing key (fingerprint `8269F3B4ED361F6BE6C0233DD113C94146264D14`) on first install. Packages and repo metadata are both signed (`gpgcheck=1`, `repo_gpgcheck=1`).

## Publishing packages

Package source repos can publish built packages here automatically with GitHub Actions. See:

- [Publishing packages from other repos](docs/publishing-from-package-repos.md)
- [Repository signing setup](docs/signing.md)

For manual updates, build the package, then run:

```bash
scripts/publish-packages.sh /path/to/*.pkg.tar.zst   # Arch
scripts/publish-rpms.sh /path/to/*.rpm               # Fedora
```

Each script copies packages into its tree (`x86_64/` or `fedora/x86_64/`), removes older builds of the same package names, and refreshes the repo metadata. Signing happens centrally after the push. Architecture-independent packages (`any` / `noarch`) still go in the `x86_64` trees, because clients fetch from `$arch` / `$basearch` paths.
