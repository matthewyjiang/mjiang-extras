# mjiang-extras

Add this repo to your system:
```bash
echo -e '\n[mjiang-extras]\nSigLevel = Never\nServer = https://repo.matthewyjiang.com/$arch\n' | sudo tee -a /etc/pacman.conf && sudo pacman -Syy
```

## List of packages and versions:
- git-credential-1password-git r37.3c31135-1
- git-credential-1password-git-debug r37.3c31135-1
- razer-coolingpad-linux 0.1.0-1 (`any`)

## Updating the repo
When you build a new package version, drop the new `*.pkg.tar.zst` files into `x86_64/`, remove the old package archives you no longer want to serve, then refresh the repo database. Packages with `arch=('any')` still go in `x86_64/` in this repo layout, because clients fetch from `https://repo.matthewyjiang.com/$arch`.

```bash
repo-add x86_64/mjiang-extras.db.tar.gz x86_64/*.pkg.tar.zst
```

After that, commit the updated package files and repo metadata in `x86_64/`, then push to `origin` so the hosted repo gets the new packages.
