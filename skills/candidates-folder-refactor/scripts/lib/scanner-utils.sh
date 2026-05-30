#!/usr/bin/env bash
# Scanner interaction helpers for auto-folder-refactor
# Provides: latest_log_for_root, establish_refactorignore, print_candidate_table,
#           untried_candidate_count_from_log, candidate_from_log, run_drill_down

# Requires globals: run_root, resolved_scan_root, scanner, scan_root
# Uses globals: drilldown_max_subdirs

latest_log_for_root() {
  node -e 'const path=require("node:path"); console.log(path.join(process.argv[1], ".pi", "candidates-folder-refactor", "latest.json"));' "${resolved_scan_root}"
}

establish_refactorignore() {
  section "establish .refactorignore"
  kv "scan" "${scan_root}"
  kv "scope" "${run_root}"
  info "scanning all folders for generated/artifact/vendor trees"
  node "${scanner}" "${resolved_scan_root}" --top 1 --suggestions all >/dev/null
  local latest_log ignore_file added
  latest_log="$(latest_log_for_root)"
  ignore_file="${run_root}/.refactorignore"
  added="$(C_BOLD="${bold}" C_DIM="${dim}" C_GREEN="${green}" C_YELLOW="${yellow}" C_CYAN="${cyan}" C_RESET="${reset}" node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const ignoreFile = process.argv[2];
    const runRoot = process.argv[3];
    const scanRoot = process.argv[4];
    const existing = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/).map((line) => line.trim()) : [];
    const existingSet = new Set(existing.filter((line) => line && !line.startsWith("#")));
    const suggestions = mergeSuggestions(report.refactorIgnoreSuggestions || [], filesystemIgnoreSuggestions(runRoot, scanRoot));
    const missing = suggestions.map((item) => item.pattern).filter((pattern) => !existingSet.has(pattern));
    if (missing.length) {
      if (fs.existsSync(ignoreFile)) {
        const cleaned = fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "# no smart suggestions found yet");
        fs.writeFileSync(ignoreFile, `${cleaned.join("\n").replace(/\n*$/, "")}\n`);
      }
      const hasAutoHeader = fs.existsSync(ignoreFile) && fs.readFileSync(ignoreFile, "utf8").includes("# auto-folder-refactor smart ignores");
      const header = hasAutoHeader ? "" : "# auto-folder-refactor smart ignores\n";
      const prefix = fs.existsSync(ignoreFile) && fs.readFileSync(ignoreFile, "utf8").trim() ? "\n" : "";
      fs.appendFileSync(ignoreFile, `${prefix}${header}${missing.join("\n")}\n`);
    } else if (!fs.existsSync(ignoreFile)) {
      fs.writeFileSync(ignoreFile, "# auto-folder-refactor smart ignores\n# no smart suggestions found yet\n");
    }
    const c = {
      bold: process.env.C_BOLD || "",
      dim: process.env.C_DIM || "",
      green: process.env.C_GREEN || "",
      yellow: process.env.C_YELLOW || "",
      cyan: process.env.C_CYAN || "",
      reset: process.env.C_RESET || "",
    };
    const counts = { added: 0, kept: 0 };
    const ignoreExists = fs.existsSync(ignoreFile);
    const currentLines = ignoreExists ? fs.readFileSync(ignoreFile, "utf8").split(/\r?\n/).filter((line) => line.trim()) : [];
    const currentPatterns = currentLines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    console.log(`${c.bold}${c.cyan}.refactorignore${c.reset} ${c.dim}${ignoreFile}${c.reset}`);
    for (const item of suggestions) {
      const status = missing.includes(item.pattern) ? "added" : "kept";
      counts[status] += 1;
      const color = status === "added" ? c.green : c.dim;
      console.log(`${color}${status}${c.reset} ${String(item.confidence).padStart(2)} ${item.pattern}`);
    }
    if (!suggestions.length) console.log(`${c.dim}no new smart suggestions${c.reset}`);
    if (currentLines.length) {
      console.log(`${c.dim}current file (${currentPatterns.length} active, ${currentLines.length} nonblank):${c.reset}`);
      for (const line of currentLines.slice(0, 60)) {
        const trimmed = line.trim();
        const prefix = trimmed.startsWith("#") ? "" : "- ";
        console.log(`${c.dim}${prefix}${trimmed}${c.reset}`);
      }
      if (currentLines.length > 60) console.log(`${c.dim}… ${currentLines.length - 60} more lines${c.reset}`);
    } else if (ignoreExists) {
      console.log(`${c.dim}current file exists but has no entries${c.reset}`);
    } else {
      console.log(`${c.dim}current file created empty${c.reset}`);
    }
    console.log(`${c.green}+${counts.added}${c.reset} ${c.dim}kept ${counts.kept}${c.reset}`);

    function mergeSuggestions(...groups) {
      const byPattern = new Map();
      for (const item of groups.flat()) {
        const prior = byPattern.get(item.pattern);
        if (!prior || item.confidence > prior.confidence) byPattern.set(item.pattern, item);
      }
      return [...byPattern.values()].sort((a, b) => b.confidence - a.confidence || a.pattern.localeCompare(b.pattern));
    }

    function filesystemIgnoreSuggestions(root, scan) {
      const exactNames = new Map([
        [".dart_tool", [10, "Dart/Flutter tool cache"]],
        ["build", [10, "build output"]],
        ["coverage", [9, "coverage output"]],
        ["test-results", [9, "test result artifacts"]],
        ["playwright-report", [9, "Playwright report artifacts"]],
        [".gradle", [9, "Gradle cache"]],
        [".kotlin", [8, "Kotlin build cache"]],
        ["artifacts", [8, "artifact output folder"]],
        ["logs", [8, "log output folder"]],
        ["screenshots", [7, "screenshot artifacts"]],
        ["tmp", [7, "temporary files"]],
        ["temp", [7, "temporary files"]],
      ]);
      const found = [];
      const start = fs.existsSync(scan) ? scan : root;
      walk(start, 0);
      return found;

      function walk(dir, depth) {
        if (depth > 4) return;
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if ([".git", "node_modules", ".pi", ".understand-anything"].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const hit = exactNames.get(entry.name.toLowerCase());
          if (hit) {
            const rel = path.relative(root, full).split(path.sep).join("/");
            if (rel && !rel.startsWith("../")) found.push({ path: rel, pattern: `${rel}/`, confidence: hit[0], reason: hit[1], files: 0, extensions: [] });
            continue;
          }
          walk(full, depth + 1);
        }
      }
    }
  ' "${latest_log}" "${ignore_file}" "${run_root}" "${resolved_scan_root}")"
  if [[ -n "${added}" ]]; then
    printf '%s\n' "${added}" >&2
  else
    warn "no smart ignore suggestions found"
  fi
  success ".refactorignore ready: ${ignore_file}"
}

print_candidate_table() {
  C_BOLD="${bold}" C_DIM="${dim}" C_GREEN="${green}" C_YELLOW="${yellow}" C_CYAN="${cyan}" C_MAGENTA="${magenta}" C_RESET="${reset}" node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const skipped = new Set((process.argv[2] || "").split("\n").filter(Boolean));
    const c = {
      bold: process.env.C_BOLD || "",
      dim: process.env.C_DIM || "",
      green: process.env.C_GREEN || "",
      yellow: process.env.C_YELLOW || "",
      cyan: process.env.C_CYAN || "",
      magenta: process.env.C_MAGENTA || "",
      reset: process.env.C_RESET || "",
    };
    const suggestedIgnores = new Set((report.refactorIgnoreSuggestions || []).map((item) => item.path));
    const rows = report.candidates || [];
    const widths = { n: 3, path: 34, score: 7, files: 6, churn: 6, dup: 6, sub: 5, roles: 5 };
    const trunc = (value, width) => {
      const text = String(value);
      return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width);
    };
    const line = `${c.dim}${"─".repeat(112)}${c.reset}`;
    console.error(`${c.bold}${c.cyan}┌ Candidates${c.reset} ${c.dim}${report.target} · ${rows.length} shown${c.reset}`);
    console.error(`${c.dim}│ generated ${report.generatedAt || "unknown"}${c.reset}`);
    console.error(line);
    console.error(`${c.dim} #  ${"path".padEnd(widths.path)} ${"score".padStart(widths.score)} ${"files".padStart(widths.files)} ${"churn".padStart(widths.churn)} ${"dups".padStart(widths.dup)} ${"sub".padStart(widths.sub)} ${"role".padStart(widths.roles)}  extensions${c.reset}`);
    console.error(line);
    for (const [index, item] of rows.entries()) {
      const wasSkipped = skipped.has(item.relative);
      const skippedMark = wasSkipped ? `${c.yellow} skipped${c.reset}` : "";
      const rankColor = index === 0 ? c.green : index < 5 ? c.cyan : c.dim;
      const rank = String(index + 1).padStart(2);
      const path = trunc(item.relative, widths.path);
      const exts = (item.extensions || []).join(" ") || "none";
      console.error(`${rankColor}${rank}.${c.reset} ${wasSkipped ? c.dim : c.bold}${path}${c.reset} ${String(item.score.toFixed ? item.score.toFixed(1) : item.score).padStart(widths.score)} ${String(item.files).padStart(widths.files)} ${String(item.churn).padStart(widths.churn)} ${String(item.duplicates).padStart(widths.dup)} ${String(item.subdirs).padStart(widths.sub)} ${String(item.roles).padStart(widths.roles)}  ${c.dim}${exts}${c.reset}${skippedMark}`);
    }
    console.error(line);
    const best = rows.find((item) => !skipped.has(item.relative));
    if (best) console.error(`${c.green}next:${c.reset} ${c.bold}${best.relative}${c.reset} ${c.dim}(score ${best.score})${c.reset}`);
    if (suggestedIgnores.size) {
      console.error(`${c.yellow}refactorignore:${c.reset} ${suggestedIgnores.size} artifact/generated-looking folder(s) omitted from candidates`);
      for (const item of (report.refactorIgnoreSuggestions || []).slice(0, 5)) console.error(`${c.dim}  - ${item.pattern} — confidence ${item.confidence}; ${item.reason}${c.reset}`);
    }
    console.error(`${c.dim}log:  ${process.argv[1]}${c.reset}`);
  ' "$1" "$2"
}

untried_candidate_count_from_log() {
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const skipped = new Set((process.argv[2] || "").split("\n").filter(Boolean));
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const candidates = report.candidates || [];
    process.stdout.write(String(candidates.filter((item) => item && item.relative && !skipped.has(item.relative)).length));
  ' "$1" "$2"
}

candidate_from_log() {
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const file = process.argv[1];
    const runRoot = path.resolve(process.argv[2]);
    const skipped = new Set((process.argv[3] || "").split("\n").filter(Boolean));
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const ignored = (report.refactorIgnoreSuggestions || []).map((item) => item.path.split(/[\\/]/).join("/"));
    const candidates = report.candidates || [];
    const isIgnored = (relative) => ignored.some((path) => {
      const normalized = relative.split(/[\\/]/).join("/");
      return normalized === path || normalized.startsWith(`${path}/`);
    });
    const picked = candidates.find((item) => item && item.relative && !skipped.has(item.relative) && !isIgnored(item.relative));
    const candidate = picked && picked.relative;
    if (!candidate) process.exit(3);
    const absolute = path.resolve(runRoot, candidate);
    const real = fs.realpathSync.native(absolute);
    const rel = path.relative(runRoot, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      console.error(`candidate escapes pwd: ${candidate}`);
      process.exit(4);
    }
    process.stdout.write(rel || ".");
  ' "$1" "${run_root}" "$2"
}

# Drill down: if candidate has too many subdirs, pick a manageable sub-candidate.
# Skips sub-candidates already in the skipped array.
run_drill_down() {
  local candidate=$1
  shift
  local skipped_sub=("$@")
  local candidate_abs="${run_root}/${candidate}"

  if [[ ! -d "${candidate_abs}" ]]; then
    echo "${candidate}"
    return 0
  fi

  local subdir_count
  subdir_count="$(find "${candidate_abs}" -maxdepth 1 -type d 2>/dev/null | wc -l)"
  subdir_count=$((subdir_count - 1))

  if (( subdir_count <= drilldown_max_subdirs )); then
    echo "${candidate}"
    return 0
  fi

  info "candidate ${candidate} has ${subdir_count} subdirs > ${drilldown_max_subdirs}; drilling down"
  node "${scanner}" "${candidate_abs}" --top 5 >/dev/null 2>&1
  local sub_log="${candidate_abs}/.pi/candidates-folder-refactor/latest.json"

  if [[ ! -f "${sub_log}" ]]; then
    warn "drill-down: no scanner output; using original candidate"
    echo "${candidate}"
    return 0
  fi

  # Build a set of already-tried sub-candidate basenames (last path component)
  local tried
  tried="$(printf '%s\n' "${skipped_sub[@]}" | while read line; do basename "$line" 2>/dev/null; done)"

  local sub_candidate
  sub_candidate="$(node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const candidates = report.candidates || [];
    const maxFiles = parseInt(process.argv[2] || "50", 10);
    const tried = (process.argv[3] || "").split("\n").filter(Boolean);
    const triedSet = new Set(tried);
    const best = candidates.find((item) => {
      if (!item || !item.relative) return false;
      const base = item.relative.split("/").pop();
      return item.files > 0 && item.files <= maxFiles && item.subdirs <= 5 && !triedSet.has(base);
    });
    process.stdout.write(best ? best.relative : "");
  ' "${sub_log}" "50" "${tried}")"

  if [[ -z "${sub_candidate}" ]]; then
    warn "drill-down: no untried manageable sub-candidate (≤50 files, ≤5 subdirs); using original"
    echo "${candidate}"
    return 0
  fi

  info "drilled down: ${candidate} → ${sub_candidate}"
  echo "${sub_candidate}"
}
