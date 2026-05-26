# tmux profile

Portable tmux assets and the `tx` tmux-session launcher.

## Files

- `tmux.conf` — tmux configuration. Install as `~/.tmux.conf`.
- `git-status.sh` — status-bar git segment. Prints the branch name in green when clean and red when changed/untracked.
- `short-path.sh` — status-bar path segment. Prints only the last two path folders, e.g. `/home/xel/git/gormes/gormes-agent` -> `/gormes/gormes-agent`.
- `tx` — installable helper for starting, attaching, listing, and killing configured tmux sessions.
- `install.sh` — installer for the config, status helpers, and `tx`.

## Install

From this directory:

```sh
./install.sh
```

If `tx` is already on your `PATH` from an npm install/link, you can also run:

```sh
tx install
```

Defaults:

- tmux config -> `~/.tmux.conf`
- status helpers -> `~/.tmux/git-status.sh` and `~/.tmux/short-path.sh`
- `tx` -> `~/.local/bin/tx`

Existing targets are backed up as `*.bak.<timestamp>` by default. Disable backups with:

```sh
TX_INSTALL_BACKUP=0 ./install.sh
```

Override install locations when needed:

```sh
TMUX_CONF_TARGET=/tmp/tmux.conf \
TMUX_HELPER_DIR=/tmp/tmux \
TX_BIN_DIR=/tmp/bin \
./install.sh
```

Reload tmux:

```sh
tmux source-file ~/.tmux.conf
```

Plugin support is optional. If TPM is missing, the config still loads and skips plugins. Install TPM with:

```sh
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

## npm/bin install

The repository package declares:

```json
{ "bin": { "tx": "./tmux/tx" } }
```

So `tx` is available when this package is installed or linked by npm. The tmux config and status helper scripts still require `tx install`, `./install.sh`, or manual copying.

## User-facing colors

Only these two color knobs are intended for user customization:

```tmux
set -g @primary_color '#06d6a0'
set -g @primary_text_color '#101820'
```

They color only the tmux session name and hostname.

## tx config

`tx` reads sessions from:

```text
$TX_CONFIG
$XDG_CONFIG_HOME/tx/sessions.conf
~/.config/tx/sessions.conf
```

Create a starter config:

```sh
tx init
```

Add the current directory:

```sh
tx add ga
```

Add an explicit directory:

```sh
tx add ga ~/git/gormes/gormes-agent
```

Inspect and use:

```sh
tx config
tx ls
tx doctor
tx which ga
tx ga
```

Config format:

```text
WORK=~/git
ga,gormes=$WORK/gormes/gormes-agent
```

Alias prefixes are accepted. Exact aliases win; otherwise the shortest matching alias wins, with alphabetical order used as a tie-breaker.
