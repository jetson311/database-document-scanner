# Git push workaround: SSH vs HTTPS

## Problem

When pushing to GitHub you see:

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

This usually happens when:

- The remote is set to **HTTPS** (`https://github.com/...`)
- Git tries to prompt for username/password (or token) and the environment is non-interactive (e.g. IDE, CI, or script)

## Fix: use SSH like your other repos

This project and others (e.g. **erin-gray-website**) should use **SSH** for `origin` so pushes use your SSH key and don’t ask for a username.

### 1. Check current remote

```bash
git remote -v
```

If you see `https://github.com/jetson311/research-matrix.git`, switch to SSH.

### 2. Switch origin to SSH

```bash
git remote set-url origin git@github.com:jetson311/research-matrix.git
```

Confirm:

```bash
git remote -v
# Should show:
# origin  git@github.com:jetson311/research-matrix.git (fetch)
# origin  git@github.com:jetson311/research-matrix.git (push)
```

### 3. Push as usual

```bash
git push -u origin <branch-name>
```

No username prompt; your existing SSH key (same as erin-gray-website) is used.

## For other repos

Use the same pattern with the right repo name:

```bash
git remote set-url origin git@github.com:jetson311/<repo-name>.git
```

## Reference

- **erin-gray-website** is already configured with SSH: `git@github.com:jetson311/erin-gray-website.git`. Use that as the template for any repo that still uses HTTPS and fails to push.
