# mjiang-extras

Browse the package database at <https://repo.matthewyjiang.com/>.

Add this repo to your system:
```bash
curl -fsSL https://repo.matthewyjiang.com/mjiang-extras.gpg | sudo pacman-key --add -
sudo pacman-key --lsign-key 8269F3B4ED361F6BE6C0233DD113C94146264D14
printf '\n[mjiang-extras]\nSigLevel = Required\nServer = https://repo.matthewyjiang.com/$arch\n' | sudo tee -a /etc/pacman.conf
sudo pacman -Syy
```

Replace `8269F3B4ED361F6BE6C0233DD113C94146264D14` with the fingerprint shown in [`docs/signing.md`](docs/signing.md) after the signing key is created.

## List of packages and versions:
- git-credential-1password-git r37.3c31135-1
- git-credential-1password-git-debug r37.3c31135-1
- razer-coolingpad-linux 0.2.0-1 (`any`)

## Publishing packages

Package source repos can publish built packages here automatically with GitHub Actions. See:

- [Publishing packages from other repos](docs/publishing-from-package-repos.md)
- [Repository signing setup](docs/signing.md)

For manual updates, build the package, then run:

```bash
scripts/publish-packages.sh /path/to/*.pkg.tar.zst
```

The script copies packages into `x86_64/`, removes older archives for the same package names, and refreshes the repo database. Packages with `arch=('any')` still go in `x86_64/` in this repo layout, because clients fetch from `https://repo.matthewyjiang.com/$arch`.
