#!/usr/bin/env bash
# Scanner interaction helpers for autofolderrefactor
# Provides: latest_log_for_root, establish_refactorignore, print_candidate_table,
#           untried_candidate_count_from_log, candidate_from_log,
#           candidate_root_files_from_log, candidate_total_files_from_log,
#           root_heavy_retry_candidate_from_log, run_drill_down

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
      const hasAutoHeader = fs.existsSync(ignoreFile) && fs.readFileSync(ignoreFile, "utf8").includes("# autofolderrefactor smart ignores");
      const header = hasAutoHeader ? "" : "# autofolderrefactor smart ignores\n";
      const prefix = fs.existsSync(ignoreFile) && fs.readFileSync(ignoreFile, "utf8").trim() ? "\n" : "";
      fs.appendFileSync(ignoreFile, `${prefix}${header}${missing.join("\n")}\n`);
    } else if (!fs.existsSync(ignoreFile)) {
      fs.writeFileSync(ignoreFile, "# autofolderrefactor smart ignores\n# no smart suggestions found yet\n");
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
        ["__pycache__", [10, "Python bytecode cache"]],
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
    const rowLimit = Math.max(1, Number(process.env.PI_AUTO_FOLDER_REFACTOR_TABLE_ROWS || 10) || 10);
    const showSuggestions = process.env.PI_AUTO_FOLDER_REFACTOR_SHOW_SUGGESTIONS === "1";
    const allCandidates = report.candidates || [];
    const showSkipped = process.env.PI_AUTO_FOLDER_REFACTOR_SHOW_SKIPPED === "1";
    const openCandidates = allCandidates.filter((item) => !skipped.has(item.relative));
    const displayCandidates = showSkipped ? allCandidates : openCandidates;
    const hiddenSkipped = allCandidates.length - openCandidates.length;
    const showingSkippedFallback = !showSkipped && displayCandidates.length === 0 && hiddenSkipped > 0;
    const rows = (showingSkippedFallback ? allCandidates : displayCandidates).slice(0, rowLimit);
    const totalRows = showingSkippedFallback ? allCandidates.length : displayCandidates.length;
    const widths = { n: 3, path: 34, debt: 7, root: 6, total: 6, status: 10 };
    const trunc = (value, width) => {
      const text = String(value);
      return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width);
    };
    const line = `${c.dim}${"─".repeat(112)}${c.reset}`;
    const shownLabel = showingSkippedFallback ? "skipped shown because no open candidates remain" : "open shown";
    console.error(`${c.bold}${c.cyan}┌ Candidates${c.reset} ${c.dim}${report.target} · ${rows.length}/${totalRows} ${shownLabel}${hiddenSkipped && !showingSkippedFallback ? ` · ${hiddenSkipped} skipped hidden` : ""}${c.reset}`);
    console.error(`${c.dim}│ generated ${report.generatedAt || "unknown"}${c.reset}`);
    console.error(line);
    console.error(`${c.dim} #  ${"path".padEnd(widths.path)} ${"debt".padStart(widths.debt)} ${"root".padStart(widths.root)} ${"total".padStart(widths.total)} ${"status".padEnd(widths.status)} extensions${c.reset}`);
    console.error(line);
    for (const [index, item] of rows.entries()) {
      const wasSkipped = skipped.has(item.relative);
      const skippedMark = wasSkipped ? `${c.yellow} skipped${c.reset}` : "";
      const rankColor = index === 0 ? c.green : index < 5 ? c.cyan : c.dim;
      const rank = String(index + 1).padStart(2);
      const path = trunc(item.relative, widths.path);
      const exts = (item.extensions || []).join(" ") || "none";
      const status = wasSkipped ? "skipped" : "open";
      console.error(`${rankColor}${rank}.${c.reset} ${wasSkipped ? c.dim : c.bold}${path}${c.reset} ${String(item.score.toFixed ? item.score.toFixed(1) : item.score).padStart(widths.debt)} ${String(item.direct ?? 0).padStart(widths.root)} ${String(item.files ?? 0).padStart(widths.total)} ${status.padEnd(widths.status)} ${c.dim}${exts}${c.reset}`);
    }
    console.error(line);
    if (hiddenSkipped && !showSkipped && !showingSkippedFallback) console.error(`${c.dim}skipped candidates hidden; set PI_AUTO_FOLDER_REFACTOR_SHOW_SKIPPED=1 to include them in the table${c.reset}`);
    if (showingSkippedFallback) console.error(`${c.yellow}all candidates are currently skipped/cooling down; showing skipped rows so root-heavy retry decisions are visible${c.reset}`);
    const maxFiles = Math.max(1, Number(process.env.PI_AUTO_FOLDER_REFACTOR_PICK_MAX_FILES || 80) || 80);
    const maxRoot = Math.max(1, Number(process.env.PI_AUTO_FOLDER_REFACTOR_PICK_MAX_ROOT_FILES || 40) || 40);
    const depthOf = (item) => {
      const relative = String(item.relative || "").split(/[\\/]/).filter(Boolean);
      return relative.length === 1 && relative[0] === "." ? 0 : relative.length;
    };
    const byRootPriority = (a, b) => depthOf(a) - depthOf(b) || (b.direct || 0) - (a.direct || 0) || (b.score || 0) - (a.score || 0) || (b.files || 0) - (a.files || 0) || a.relative.localeCompare(b.relative);
    const rootCandidate = allCandidates.filter((item) => item && item.relative && (item.direct || 0) > 0).sort(byRootPriority)[0];
    const rootPriority = allCandidates.filter((item) => item && item.relative && !skipped.has(item.relative) && (item.direct || 0) > 0).sort(byRootPriority)[0];
    const manageable = allCandidates.filter((item) => item && item.relative && !skipped.has(item.relative) && (item.direct || 0) > 0 && (item.direct || 0) <= maxRoot && (item.files || 0) <= maxFiles)
      .sort((a, b) => depthOf(a) - depthOf(b) || (b.direct || 0) - (a.direct || 0) || (a.files || 0) - (b.files || 0) || (b.score || 0) - (a.score || 0) || a.relative.localeCompare(b.relative))[0];
    const debtBest = rows.find((item) => !skipped.has(item.relative));
    if (debtBest) console.error(`${c.green}top open debt:${c.reset} ${c.bold}${debtBest.relative}${c.reset} ${c.dim}(score ${debtBest.score})${c.reset}`);
    if (rootCandidate && skipped.has(rootCandidate.relative)) console.error(`${c.yellow}root priority:${c.reset} ${c.bold}${rootCandidate.relative}${c.reset} ${c.dim}(not currently open; cooldown roots may be retried, blocked/done/exhausted roots will not; depth ${depthOf(rootCandidate)}, root ${rootCandidate.direct}, total ${rootCandidate.files})${c.reset}`);
    if (rootPriority && (!debtBest || rootPriority.relative !== debtBest.relative)) console.error(`${c.green}picker:${c.reset} ${c.bold}${rootPriority.relative}${c.reset} ${c.dim}(root-first: depth ${depthOf(rootPriority)}, root ${rootPriority.direct}, total ${rootPriority.files})${c.reset}`);
    if (manageable && rootPriority && manageable.relative !== rootPriority.relative) console.error(`${c.dim}manageable fallback: ${manageable.relative} (root ${manageable.direct}, total ${manageable.files}; limits root≤${maxRoot}, files≤${maxFiles})${c.reset}`);
    if (suggestedIgnores.size) {
      console.error(`${c.yellow}refactorignore:${c.reset} ${suggestedIgnores.size} artifact/generated-looking folder(s) omitted from candidates${showSuggestions ? "" : " (set PI_AUTO_FOLDER_REFACTOR_SHOW_SUGGESTIONS=1 to list)"}`);
      if (showSuggestions) for (const item of (report.refactorIgnoreSuggestions || []).slice(0, 5)) console.error(`${c.dim}  - ${item.pattern} — confidence ${item.confidence}; ${item.reason}${c.reset}`);
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

candidate_root_files_from_log() {
  candidate_metric_from_log "$1" "$2" direct
}

candidate_total_files_from_log() {
  candidate_metric_from_log "$1" "$2" files
}

candidate_metric_from_log() {
  node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const candidate = process.argv[2];
    const key = process.argv[3];
    const item = (report.candidates || []).find((entry) => entry && entry.relative === candidate);
    process.stdout.write(String(item?.[key] || 0));
  ' "$1" "$2" "$3"
}

root_heavy_retry_candidate_from_log() {
  node -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const skipped = new Set((process.argv[2] || "").split("\n").filter(Boolean));
    const threshold = Math.max(0, Number(process.argv[3]) || 0);
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const depthOf = (item) => {
      const relative = String(item.relative || "").split(/[\\/]/).filter(Boolean);
      return relative.length === 1 && relative[0] === "." ? 0 : relative.length;
    };
    const candidate = (report.candidates || [])
      .filter((item) => item && item.relative && skipped.has(item.relative) && (item.direct || 0) >= threshold)
      .sort((a, b) => depthOf(a) - depthOf(b) || (b.direct || 0) - (a.direct || 0) || (b.score || 0) - (a.score || 0) || a.relative.localeCompare(b.relative))[0];
    if (!candidate) process.exit(3);
    process.stdout.write(candidate.relative);
  ' "$1" "$2" "$3"
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
    const eligible = candidates.filter((item) => item && item.relative && !skipped.has(item.relative) && !isIgnored(item.relative));
    const depthOf = (item) => {
      const relative = String(item.relative || "").split(/[\\/]/).filter(Boolean);
      return relative.length === 1 && relative[0] === "." ? 0 : relative.length;
    };
    const byRootPriority = (a, b) => depthOf(a) - depthOf(b) || (b.direct || 0) - (a.direct || 0) || (b.score || 0) - (a.score || 0) || (b.files || 0) - (a.files || 0) || a.relative.localeCompare(b.relative);
    const picked = [...eligible].filter((item) => (item.direct || 0) > 0).sort(byRootPriority)[0] || eligible[0];
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
  local current="${candidate}"
  local depth=0 max_depth max_files tried candidate_abs subdir_count total_files sub_log sub_candidate sub_candidate_json sub_reason
  max_depth="${PI_AUTO_FOLDER_REFACTOR_DRILLDOWN_DEPTH:-3}"
  max_files="${PI_AUTO_FOLDER_REFACTOR_DRILLDOWN_MAX_FILES:-30}"
  [[ "${max_depth}" =~ ^[1-9][0-9]*$ ]] || max_depth=3
  [[ "${max_files}" =~ ^[1-9][0-9]*$ ]] || max_files=30
  tried="$(printf '%s\n' "${skipped_sub[@]}")"

  while (( depth < max_depth )); do
    candidate_abs="${run_root}/${current}"
    if [[ ! -d "${candidate_abs}" ]]; then
      echo "${current}"
      return 0
    fi

    subdir_count="$(find "${candidate_abs}" -maxdepth 1 -type d 2>/dev/null | wc -l)"
    subdir_count=$((subdir_count - 1))
    total_files="$(find "${candidate_abs}" -type f 2>/dev/null | wc -l)"

    if (( total_files <= max_files )); then
      echo "${current}"
      return 0
    fi
    if (( subdir_count == 0 )); then
      echo "${current}"
      return 0
    fi

    info "candidate ${current} has ${total_files} files/${subdir_count} subdirs; drilling down for ≤${max_files} files and ≤${drilldown_max_subdirs} subdirs"
    node "${scanner}" "${candidate_abs}" --top 10 >/dev/null 2>&1
    sub_log="${candidate_abs}/.pi/candidates-folder-refactor/latest.json"

    if [[ ! -f "${sub_log}" ]]; then
      warn "drill-down: no scanner output; using ${current}"
      echo "${current}"
      return 0
    fi

    sub_candidate_json="$(node -e '
      const fs = require("node:fs");
      const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const candidates = report.candidates || [];
      const maxFiles = parseInt(process.argv[2] || "30", 10);
      const maxSubdirs = parseInt(process.argv[3] || "5", 10);
      const tried = (process.argv[4] || "").split("\n").filter(Boolean).map((value) => value.split(/[\\/]/).join("/"));
      const triedSet = new Set(tried);
      const normalized = (item) => item.relative.split(/[\\/]/).join("/");
      const untried = candidates.filter((item) => item && item.relative && item.files > 0 && !triedSet.has(normalized(item)));
      const best = untried.find((item) => item.files <= maxFiles && item.subdirs <= maxSubdirs)
        || untried.find((item) => item.subdirs <= maxSubdirs)
        || untried[0];
      if (!best) process.exit(3);
      const fits = best.files <= maxFiles && best.subdirs <= maxSubdirs;
      const reason = fits ? `fits limits files ${best.files}≤${maxFiles}, subdirs ${best.subdirs}≤${maxSubdirs}` : `best remaining child files ${best.files}, subdirs ${best.subdirs}`;
      process.stdout.write(JSON.stringify({ relative: best.relative, reason, files: best.files, direct: best.direct, subdirs: best.subdirs, score: best.score }));
    ' "${sub_log}" "${max_files}" "${drilldown_max_subdirs}" "${tried}" || true)"
    sub_candidate="$(node -e 'const item=JSON.parse(process.argv[1]||"{}"); process.stdout.write(item.relative||"");' "${sub_candidate_json}" 2>/dev/null || true)"
    sub_reason="$(node -e 'const item=JSON.parse(process.argv[1]||"{}"); process.stdout.write(item.reason||"");' "${sub_candidate_json}" 2>/dev/null || true)"

    if [[ -z "${sub_candidate}" || "${sub_candidate}" == "${current}" ]]; then
      warn "drill-down: no untried smaller sub-candidate; using ${current}"
      echo "${current}"
      return 0
    fi

    info "drilled down: ${current} → ${sub_candidate}${sub_reason:+ (${sub_reason})}"
    current="${sub_candidate}"
    depth=$((depth + 1))
  done

  echo "${current}"
}
