# Codex local storage failures

Use this quick path when Codex fails before the agent starts with messages such as `No space left on device`, `database or disk is full`, or a damaged `~/.codex/state_*.sqlite` database.

## Likely causes

These failures usually mean the home filesystem is full or so close to full that Codex cannot create PATH wrapper files under `~/.codex/tmp`. Once the disk is full, SQLite cannot extend the state database, write its WAL/SHM sidecars, or complete a repair copy, so `state_*.sqlite` can look damaged even when the root problem is disk pressure.

## Triage first

Confirm whether the failure is disk pressure, not the project under test:

```bash
df -h "$HOME"
du -sh ~/.codex/* 2>/dev/null | sort -h
```

If `$HOME` is full, free space outside Codex too. The sqlite repair flow needs enough free space to copy or rebuild state.

## Safest deletion first

For a guided dry run from this bundled skill, use [`scripts/codex-storage-cleanup.sh`](../scripts/codex-storage-cleanup.sh):

```bash
bash skills/diagnose/scripts/codex-storage-cleanup.sh
bash skills/diagnose/scripts/codex-storage-cleanup.sh --execute
```

The script dry run prints free space and Codex path sizes, then shows the cleanup it would perform. With `--execute`, it removes only transient temp files, moves state databases into a unique timestamped backup directory under `~/.codex/backup/`, and prints a post-cleanup disk report; it does not delete `~/.codex`. If you only want to clear temp files and leave `state_*.sqlite*` untouched, run `bash skills/diagnose/scripts/codex-storage-cleanup.sh --execute --tmp-only`. If you override the target with `--codex-dir`, the path must end in `/.codex` so the helper cannot accidentally clean an unrelated directory.

Delete transient Codex temp files before deleting durable state:

```bash
rm -rf ~/.codex/tmp
```

Retry Codex after removing temp files. If it still reports `database or disk is full`, prefer the built-in repair prompt once free space exists.

## Back up damaged local state

If the sqlite state is still blocking startup and you accept that local Codex session state may be rebuilt, move the database files aside first:

```bash
mkdir -p ~/.codex/backup
mv ~/.codex/state_*.sqlite* ~/.codex/backup/ 2>/dev/null || true
```

## Last-resort reset command

Only delete the local state database when backup or repair is not possible and losing local Codex session state is acceptable. The helper requires an explicit acknowledgement for that path:

```bash
bash skills/diagnose/scripts/codex-storage-cleanup.sh --execute --delete-state --i-understand-local-state-will-be-lost
```

Equivalent manual last-resort command:

```bash
rm -f ~/.codex/state_*.sqlite ~/.codex/state_*.sqlite-shm ~/.codex/state_*.sqlite-wal
```

Do not run `rm -rf ~/.codex` unless you intentionally want to remove all local Codex settings, caches, and state.
