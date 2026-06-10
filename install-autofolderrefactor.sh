#!/usr/bin/env sh
set -eu

# Install autofolderrefactor — convenience wrapper for autofolderrefactor
#
# Usage:
#   sh install-autofolderrefactor.sh
#
# Installs to ~/.local/bin/autofolderrefactor by default.
# Override with: AUTO_FOLDER_REFACTOR_BIN_DIR=/usr/local/bin sh install-autofolderrefactor.sh

script_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
src="${script_dir}/skills/engineering/candidates-folder-refactor/scripts/autofolderrefactor"

: "${HOME:?HOME is required}"

BIN_DIR="${AUTO_FOLDER_REFACTOR_BIN_DIR:-${HOME}/.local/bin}"
BIN_NAME="${AUTO_FOLDER_REFACTOR_BIN_NAME:-autofolderrefactor}"
INSTALL_BACKUP="${AUTO_FOLDER_REFACTOR_INSTALL_BACKUP:-1}"

timestamp="$(date +%Y%m%d%H%M%S)"
dest="${BIN_DIR}/${BIN_NAME}"

if [ ! -f "$src" ]; then
  printf 'install-autofolderrefactor: source not found: %s\n' "$src" >&2
  exit 1
fi

mkdir -p "${BIN_DIR}"

if [ "${INSTALL_BACKUP}" != "0" ] && [ -e "${dest}" ]; then
  cp -p "${dest}" "${dest}.bak.${timestamp}"
  printf 'backup: %s -> %s\n' "${dest}" "${dest}.bak.${timestamp}"
fi

# Write a small exec wrapper so the script follows wherever the repo moves
tmp="${dest}.tmp.$$"
cat > "${tmp}" <<EOF
#!/usr/bin/env sh
exec "${src}" "\$@"
EOF
install -m 0755 "${tmp}" "${dest}"
rm -f "${tmp}"
printf 'installed: %s\n' "${dest}"
printf '  target: %s\n' "${src}"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "${BIN_DIR}" "${BIN_NAME}"
    ;;
esac

printf '\nexample: %s 10\n' "${BIN_NAME}"
printf 'example: %s 10 internal\n' "${BIN_NAME}"
printf 'example: %s ignore\n' "${BIN_NAME}"
