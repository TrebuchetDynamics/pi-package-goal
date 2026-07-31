#!/usr/bin/env sh
set -eu

# Install OmniRoute, start its local daemon, and configure its automatic free route in Pi.
# Use --config-only for an existing local or remote OmniRoute server.

: "${HOME:?HOME is required}"

base_url="${OMNIROUTE_PI_BASE_URL:-http://127.0.0.1:20128/v1}"
model="${OMNIROUTE_PI_MODEL:-auto/coding:free}"
api_key="${OMNIROUTE_PI_API_KEY:-omniroute-local}"
max_heavy="${OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT:-2}"
config_only=0

usage() {
  cat <<'EOF'
Usage: sh install-omniroute-pi.sh [options]

Install OmniRoute, run it as a daemon, and configure Pi to use OmniRoute.

Options:
  --config-only    Skip package installation and daemon startup
  --base-url URL   OmniRoute OpenAI-compatible base URL
  --model ID       OmniRoute route (default: auto/coding:free)
  -h, --help       Show this help

Environment:
  OMNIROUTE_PI_API_KEY                 Endpoint key; local installs default to omniroute-local
  OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT   Concurrent large chats (default: 2)
  PI_CODING_AGENT_DIR                  Pi config directory (default: ~/.pi/agent)
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --config-only)
      config_only=1
      ;;
    --base-url)
      [ "$#" -ge 2 ] || { printf '%s\n' 'install-omniroute-pi: --base-url needs a value' >&2; exit 2; }
      base_url="$2"
      shift
      ;;
    --model)
      [ "$#" -ge 2 ] || { printf '%s\n' 'install-omniroute-pi: --model needs a value' >&2; exit 2; }
      model="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'install-omniroute-pi: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

case "$base_url" in
  http://*|https://*) ;;
  *) printf 'install-omniroute-pi: invalid base URL: %s\n' "$base_url" >&2; exit 2 ;;
esac
[ -n "$model" ] || { printf '%s\n' 'install-omniroute-pi: model cannot be empty' >&2; exit 2; }
case "$max_heavy" in
  ''|*[!0-9]*|0) printf '%s\n' 'install-omniroute-pi: OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT must be a positive integer' >&2; exit 2 ;;
esac

command -v node >/dev/null 2>&1 || {
  printf '%s\n' 'install-omniroute-pi: Node.js 22+ is required' >&2
  exit 1
}
node -e 'const major=Number(process.versions.node.split(".")[0]); process.exit(major >= 22 ? 0 : 1)' || {
  printf '%s\n' 'install-omniroute-pi: Node.js 22+ is required' >&2
  exit 1
}

catalog_url="${base_url%/}/models"
server_ready() {
  CATALOG_URL="$catalog_url" OMNIROUTE_KEY="$api_key" node <<'NODE' >/dev/null 2>&1
const response = await fetch(process.env.CATALOG_URL, {
  headers: { Authorization: `Bearer ${process.env.OMNIROUTE_KEY}` },
  signal: AbortSignal.timeout(2000),
});
process.exit(response.ok ? 0 : 1);
NODE
}
catalog_ready() {
  CATALOG_URL="$catalog_url" OMNIROUTE_KEY="$api_key" OMNIROUTE_MODEL="$model" node <<'NODE' >/dev/null 2>&1
const response = await fetch(process.env.CATALOG_URL, {
  headers: { Authorization: `Bearer ${process.env.OMNIROUTE_KEY}` },
  signal: AbortSignal.timeout(2000),
});
if (!response.ok) process.exit(1);
const payload = await response.json();
process.exit(payload.data?.some((entry) => entry.id === process.env.OMNIROUTE_MODEL) ? 0 : 1);
NODE
}

if [ "$config_only" = "0" ]; then
  command -v npm >/dev/null 2>&1 || {
    printf '%s\n' 'install-omniroute-pi: npm is required' >&2
    exit 1
  }

  if ! command -v pi >/dev/null 2>&1; then
    npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  fi
  if ! command -v omniroute >/dev/null 2>&1; then
    npm install -g omniroute
  fi

  if ! server_ready; then
    OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT="$max_heavy" omniroute serve --daemon --no-open
    attempts=0
    until server_ready; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 30 ]; then
        printf 'install-omniroute-pi: OmniRoute did not become ready at %s\n' "$catalog_url" >&2
        exit 1
      fi
      sleep 1
    done
  fi
fi

if ! catalog_ready; then
  printf 'install-omniroute-pi: route %s is unavailable at %s\n' "$model" "$catalog_url" >&2
  exit 1
fi

agent_dir="${PI_CODING_AGENT_DIR:-${HOME}/.pi/agent}"
models_file="${agent_dir}/models.json"
mkdir -p "$agent_dir"

PI_MODELS_FILE="$models_file" OMNIROUTE_BASE_URL="$base_url" OMNIROUTE_KEY="$api_key" OMNIROUTE_MODEL="$model" node <<'NODE'
import fs from "node:fs";
import path from "node:path";

const file = process.env.PI_MODELS_FILE;
const catalogResponse = await fetch(`${process.env.OMNIROUTE_BASE_URL.replace(/\/$/, "")}/models`, {
  headers: { Authorization: `Bearer ${process.env.OMNIROUTE_KEY}` },
});
if (!catalogResponse.ok) throw new Error(`OmniRoute catalog returned HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
const metadata = catalog.data?.find((entry) => entry.id === process.env.OMNIROUTE_MODEL);
if (!metadata) throw new Error(`OmniRoute model not found: ${process.env.OMNIROUTE_MODEL}`);
const supportsImages = metadata.capabilities?.vision || metadata.input_modalities?.includes("image");

const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
let config = { providers: {} };
if (before.trim()) config = JSON.parse(before);
if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error(`${file} must contain a JSON object`);
if (!config.providers || typeof config.providers !== "object" || Array.isArray(config.providers)) config.providers = {};

config.providers.omniroute = {
  baseUrl: process.env.OMNIROUTE_BASE_URL,
  api: "openai-completions",
  apiKey: process.env.OMNIROUTE_KEY,
  models: [{
    id: process.env.OMNIROUTE_MODEL,
    name: `OmniRoute ${metadata.name ?? process.env.OMNIROUTE_MODEL}`,
    reasoning: Boolean(metadata.capabilities?.reasoning || metadata.capabilities?.thinking),
    input: supportsImages ? ["text", "image"] : ["text"],
    contextWindow: metadata.context_length ?? 128000,
    // Automatic combos advertise aggregate limits; keep requests below common provider ceilings.
    maxTokens: Math.min(metadata.max_output_tokens ?? 16384, 16384),
  }],
};

const after = `${JSON.stringify(config, null, 2)}\n`;
if (before !== after) {
  if (before) {
    const backup = `${file}.bak.${Date.now()}`;
    fs.copyFileSync(file, backup);
    fs.chmodSync(backup, 0o600);
  }
  const temporary = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, after, { mode: 0o600 });
  fs.renameSync(temporary, file);
  console.log(`configured: ${file}`);
} else {
  console.log(`already configured: ${file}`);
}
fs.chmodSync(file, 0o600);

const settingsFile = path.join(path.dirname(file), "settings.json");
const settingsBefore = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, "utf8") : "";
let settings = {};
if (settingsBefore.trim()) settings = JSON.parse(settingsBefore);
if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error(`${settingsFile} must contain a JSON object`);
settings.defaultProvider = "omniroute";
settings.defaultModel = process.env.OMNIROUTE_MODEL;
const settingsAfter = `${JSON.stringify(settings, null, 2)}\n`;
if (settingsBefore !== settingsAfter) {
  if (settingsBefore) {
    const backup = `${settingsFile}.bak.${Date.now()}`;
    fs.copyFileSync(settingsFile, backup);
    fs.chmodSync(backup, 0o600);
  }
  const temporary = `${settingsFile}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, settingsAfter, { mode: 0o600 });
  fs.renameSync(temporary, settingsFile);
  console.log(`configured: ${settingsFile}`);
}
fs.chmodSync(settingsFile, 0o600);
NODE

if command -v pi >/dev/null 2>&1; then
  pi --no-extensions --no-skills --no-prompt-templates --list-models omniroute >/dev/null
fi

printf '\nOmniRoute is ready for Pi.\n'
printf 'Run: pi --provider omniroute --model %s\n' "$model"
printf 'Dashboard: %s\n' "${base_url%/v1}"
