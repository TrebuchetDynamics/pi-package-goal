# tmux profile

Portable tmux assets and the `tx` tmux-session launcher.

## Files

- `tmux.conf` — tmux configuration. Install as `~/.tmux.conf`.
- `style.tmux` — local style overrides. Installed as `~/.tmux/style.tmux` only when missing.
- `git-status.sh` — optional status-bar git segment. Prints the branch name in green when clean and red when changed/untracked.
- `short-path.sh` — optional status-bar path segment. Prints only the last two path folders, e.g. `/home/xel/git/pi-package-development-goal` -> `git/pi-package-development-goal`.
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
- local style -> `~/.tmux/style.tmux` (kept if it already exists)
- status helpers -> `~/.tmux/git-status.sh` and `~/.tmux/short-path.sh`
- `tx` -> `~/.local/bin/tx`

Existing targets are backed up as `*.bak.<timestamp>` by default. Disable backups with:

```sh
TX_INSTALL_BACKUP=0 ./install.sh
```

Override install locations when needed. When `TMUX_HELPER_DIR` is set, the installed tmux config is rewritten to invoke helper scripts from that directory:

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

## Runtime flow

- `install.sh` copies the shared assets into user locations: `tmux.conf`, helper scripts, optional local style, and the `tx` launcher.
- `tmux.conf` renders session name, short current path, git branch/status, and host name in the status bar. It refreshes every 120 seconds.
- `tx` reads session aliases from its config file, starts or switches to the matching tmux session, and uses the alias as the tmux session name.
- `style.tmux` stores per-machine colors and is sourced by `tmux.conf` from `~/.tmux/style.tmux`.

## Helper-script contract

The shared config calls `short-path.sh` and `git-status.sh` in the status bar. The installer places both helpers under `~/.tmux` (or `TMUX_HELPER_DIR`) and rewrites `tmux.conf` to that helper path.

Each helper takes one argument: the current pane path from `#{pane_current_path}`. `git-status.sh` prints the branch in green when clean and red when changed/untracked; outside git repos it prints nothing.

For very slow SSH/mobile links, disable periodic helper calls in `~/.tmux/local.tmux`:

```tmux
set -g status-interval 0
set -g status-left '#[bg=#{@primary_color},fg=#{@primary_text_color},bold] #S '
set -g status-left-length 40
```

## npm/bin install

The repository package declares:

```json
{ "bin": { "tx": "./tmux/tx" } }
```

So `tx` is available when this package is installed or linked by npm. The tmux config and status helper scripts still require `tx install`, `./install.sh`, or manual copying.

## Screen resizing

The profile does not set tmux resize options. It leaves `window-size` and `aggressive-resize` at tmux built-in defaults. This is intentional: forcing a manual window size can make mobile SSH clients repaint worse.

Inspect attached client sizes with:

```sh
tmux list-clients -F '#{client_name} #{client_session} #{client_width}x#{client_height} #{client_tty}'
```

If resize/redraw feels slow in a phone SSH app such as Termius, first close old SSH tabs and detach stale tmux clients:

```sh
tmux detach-client -a
tmux list-clients -F '#{client_name} #{client_session} #{client_width}x#{client_height} #{client_tty}'
```

The goal is one attached client, or at least no stale phone clients at very different sizes.

Avoid this as a default fix:

```sh
# Usually worse on mobile; use only as a temporary experiment.
tmux set -g window-size manual
```

Return to normal resize behavior with:

```sh
tmux set -g window-size latest
```

## Mouse

Mouse mode is left at the tmux built-in default (`off`) for maximum SSH/mobile compatibility.

## Local/mobile overrides

The shared config sources `~/.tmux/local.tmux` at the end when it exists. Use this file for machine-specific settings only after stale-client cleanup is not enough.

The defaults keep history large and refresh repo info slowly:

```tmux
set -g status-interval 120
set -g history-limit 50000
```

Test one extra setting at a time so rollback is easy:

```tmux
# Optional if your local terminal needs truecolor more than low-byte output.
# set -as terminal-overrides ',xterm-256color:RGB'

# Optional if you prefer phone drag/scroll through tmux instead of the SSH app.
# set -g mouse on
```

Rollback to shared defaults:

```sh
rm -f ~/.tmux/local.tmux
tmux set -g window-size latest
tmux source-file ~/.tmux.conf
```

Keep resize overrides out of shared config unless there is a measured, cross-client reason. The shared profile intentionally leaves tmux resize behavior at defaults.

## User-facing colors

Per-machine colors live in `~/.tmux/style.tmux`, sourced by `~/.tmux.conf`:

```tmux
set -g @primary_color '#06d6a0'
set -g @primary_text_color '#101820'
```

The installer creates this file only when missing, so each PC can keep local colors while updating the shared tmux config. These colors affect the tmux session name and hostname. The current git branch is shown by `~/.tmux/git-status.sh`: green when clean, red when changed or untracked.

## tx config

`tx` reads sessions from:

```text
$TX_CONFIG
$XDG_CONFIG_HOME/tx/session.config
~/.config/tx/session.config

If the legacy `sessions.conf` already exists and `session.config` does not, `tx` keeps using the legacy file.
```

Create a starter config:

```sh
tx init
```

Add the current directory with an explicit alias:

```sh
tx add ga
tx add . ga
```

Add an explicit directory with an explicit alias. Alias-first and directory-first forms are both accepted:

```sh
tx add ga ~/git/gormes/gormes-agent
tx add ~/git/gormes/gormes-agent ga
```

Prompt for an alias while adding the current directory or another directory:

```sh
tx add .
tx add ~/git/gormes/gormes-agent
```

If the target directory already has a config row, the new alias is appended to that row's comma-separated alias list.

Inspect, rename, remove, and use:

```sh
tx config
tx ls
tx doctor
tx which ga
tx edit asul azul
tx remove oldalias
tx ga
```

The installer writes shell completion files for Bash, Fish, and Zsh. It also appends a small Bash source line to `~/.bashrc` when that file exists, so new Bash shells complete aliases automatically. For the current shell, run:

```sh
source ~/.local/share/bash-completion/completions/tx
```

Manual completion output is also available:

```sh
tx completion bash
tx completion zsh
tx completion fish
```

Config format:

```text
WORK=~/git
ga,gormes=$WORK/gormes/gormes-agent
```

Alias prefixes are accepted. Exact aliases win; otherwise the shortest matching alias wins, with alphabetical order used as a tie-breaker.

`tx ls` groups aliases by target directory to save vertical space. Running aliases are green; stopped or missing aliases are red. No status words are printed in the alias list. Colors are enabled by default for SSH terminals; use `TX_COLOR=auto` for TTY-only color, `TX_COLOR=never` to disable, or `NO_COLOR=1` to disable.
