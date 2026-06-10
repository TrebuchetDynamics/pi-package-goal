#!/usr/bin/env sh
set -eu

# Install autofolderrefactor — convenience wrapper for autofolderrefactor
#
# Usage:
#   sh install-autofolderrefactor.sh
#
# Installs to ~/.local/bin/autofolderrefactor by default and copies the runtime
# scripts to ~/.local/share/autofolderrefactor so the installed command does not
# depend on this checkout remaining in place.
# Override with: AUTO_FOLDER_REFACTOR_BIN_DIR=/usr/local/bin sh install-autofolderrefactor.sh

script_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
scripts_dir="${script_dir}/skills/engineering/candidates-folder-refactor/scripts"
src="${scripts_dir}/autofolderrefactor"

: "${HOME:?HOME is required}"

BIN_DIR="${AUTO_FOLDER_REFACTOR_BIN_DIR:-${HOME}/.local/bin}"
BIN_NAME="${AUTO_FOLDER_REFACTOR_BIN_NAME:-autofolderrefactor}"
APP_DIR="${AUTO_FOLDER_REFACTOR_INSTALL_DIR:-${HOME}/.local/share/autofolderrefactor}"
INSTALL_BACKUP="${AUTO_FOLDER_REFACTOR_INSTALL_BACKUP:-1}"

timestamp="$(date +%Y%m%d%H%M%S)"
dest="${BIN_DIR}/${BIN_NAME}"

if [ ! -f "$src" ]; then
  printf 'install-autofolderrefactor: source not found: %s\n' "$src" >&2
  exit 1
fi

mkdir -p "${BIN_DIR}" "$(dirname "${APP_DIR}")"

if [ "${INSTALL_BACKUP}" != "0" ] && [ -e "${dest}" ]; then
  cp -p "${dest}" "${dest}.bak.${timestamp}"
  printf 'backup: %s -> %s\n' "${dest}" "${dest}.bak.${timestamp}"
fi
if [ "${INSTALL_BACKUP}" != "0" ] && [ -e "${APP_DIR}" ]; then
  rm -rf "${APP_DIR}.bak.${timestamp}"
  cp -R "${APP_DIR}" "${APP_DIR}.bak.${timestamp}"
  printf 'backup: %s -> %s\n' "${APP_DIR}" "${APP_DIR}.bak.${timestamp}"
fi

tmp_app="${APP_DIR}.tmp.$$"
rm -rf "${tmp_app}"
mkdir -p "${tmp_app}"
cp -R "${scripts_dir}"/. "${tmp_app}/"
chmod +x "${tmp_app}/autofolderrefactor"
rm -rf "${APP_DIR}"
mv "${tmp_app}" "${APP_DIR}"

tmp="${dest}.tmp.$$"
cat > "${tmp}" <<EOF
#!/usr/bin/env sh
exec "${APP_DIR}/autofolderrefactor" "\$@"
EOF
install -m 0755 "${tmp}" "${dest}"
rm -f "${tmp}"
printf 'installed: %s\n' "${dest}"
printf '  target: %s\n' "${APP_DIR}/autofolderrefactor"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *)
    printf 'note: add %s to PATH to run %s directly.\n' "${BIN_DIR}" "${BIN_NAME}"
    ;;
esac

printf '\nexample: %s 10\n' "${BIN_NAME}"
printf 'example: %s 10 internal\n' "${BIN_NAME}"
printf 'example: %s ignore\n' "${BIN_NAME}"
