#!/usr/bin/env bash
# Pi runner helpers for autofolderrefactor
# Provides: run_pi_capture, run_pi_prompt

run_pi_capture() {
  local prompt=$1 mode=$2 output_file pid tail_pid status started now elapsed heartbeat timeout next_heartbeat bytes changed_summary last_line
  local verbosity show_pi_output heartbeat_on_change last_changed_summary recent_changes candidate_tag candidate_badge change_limit change_count no_change_timeout
  local restore_errexit=0
  [[ $- == *e* ]] && restore_errexit=1
  output_file="$(mktemp "${TMPDIR:-/tmp}/autofolderrefactor-pi.XXXXXX")"
  heartbeat="${PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_SECONDS:-30}"
  if [[ ! "${heartbeat}" =~ ^[1-9][0-9]*$ ]]; then
    warn "invalid PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_SECONDS=${heartbeat}; using 30"
    heartbeat=30
  fi
  timeout="${PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS:-0}"
  verbosity="${PI_AUTO_FOLDER_REFACTOR_VERBOSITY:-compact}"
  show_pi_output="${PI_AUTO_FOLDER_REFACTOR_SHOW_PI_OUTPUT:-errors}"
  if [[ "${verbosity}" == "debug" ]]; then
    show_pi_output="${PI_AUTO_FOLDER_REFACTOR_SHOW_PI_OUTPUT:-all}"
  fi
  heartbeat_on_change="${PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_ON_CHANGE:-1}"
  no_change_timeout="${PI_AUTO_FOLDER_REFACTOR_NO_CHANGE_TIMEOUT_SECONDS:-0}"
  if [[ ! "${no_change_timeout}" =~ ^[0-9]+$ ]]; then
    no_change_timeout=0
  fi
  change_limit="${PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_FILES:-6}"
  if [[ ! "${change_limit}" =~ ^[1-9][0-9]*$ ]]; then
    change_limit=6
  fi
  last_changed_summary=""
  started="$(date +%s)"
  next_heartbeat="${heartbeat}"

  if [[ "${mode}" == "with-package" ]]; then
    "${pi_bin}" -p "${scope_args[@]}" "${package_args[@]}" "${extra_pi_args[@]}" "${prompt}" >"${output_file}" 2>&1 &
  else
    "${pi_bin}" -p "${scope_args[@]}" "${extra_pi_args[@]}" "${prompt}" >"${output_file}" 2>&1 &
  fi
  pid=$!
  tail_pid=""
  if [[ "${show_pi_output}" == "all" ]]; then
    tail -n +1 --pid="${pid}" -f "${output_file}" &
    tail_pid=$!
  fi
  candidate_tag="${PI_AUTO_FOLDER_REFACTOR_CURRENT_CANDIDATE:-}"
  candidate_badge=""
  if [[ -n "${candidate_tag}" ]]; then
    candidate_badge=" $(badge "${green}" "${candidate_tag}")"
  fi
  info "pi running $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${dim}" "heartbeat ${heartbeat}s")"

  while kill -0 "${pid}" 2>/dev/null; do
    sleep 2
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    now="$(date +%s)"
    elapsed=$((now - started))
    candidate_tag="${PI_AUTO_FOLDER_REFACTOR_CURRENT_CANDIDATE:-}"
    candidate_badge=""
    if [[ -n "${candidate_tag}" ]]; then
      candidate_badge=" $(badge "${green}" "${candidate_tag}")"
    fi
    if [[ "${heartbeat}" =~ ^[1-9][0-9]*$ ]] && (( elapsed >= next_heartbeat )); then
      bytes="$(wc -c <"${output_file}" 2>/dev/null || printf '0')"
      changed_summary="$(git_scope_status | awk '
        BEGIN { modified=0; added=0; deleted=0; other=0 }
        /^ M|^M |^MM/ { modified++ ; next }
        /^A |^\?\?/ { added++ ; next }
        /^ D|^D / { deleted++ ; next }
        { other++ }
        END { printf "M:%d A:%d D:%d O:%d", modified, added, deleted, other }
      ')"
      last_line="$(tail -n 1 "${output_file}" 2>/dev/null | tr -d '\r' | cut -c 1-100 || true)"
      change_count="$(git_scope_status | wc -l | tr -d ' ')"
      recent_changes="$(git_scope_status | head -"${change_limit}" | sed 's/^/    /')"
      if [[ "${heartbeat_on_change}" == "1" && "${changed_summary}" == "${last_changed_summary}" && "${verbosity}" != "debug" ]]; then
        next_heartbeat=$((next_heartbeat + heartbeat))
        continue
      fi
      last_changed_summary="${changed_summary}"
      if [[ "${changed_summary}" != "M:0 A:0 D:0 O:0" ]]; then
        info "${elapsed}s $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${yellow}" "${changed_summary}") ${dim}editing ${change_count} file(s); showing ${change_limit}${reset}"
        if [[ -n "${recent_changes}" ]]; then
          printf '%s%s%s\n' "${dim}" "${recent_changes}" "${reset}" >&2
        fi
      elif (( no_change_timeout > 0 && elapsed >= no_change_timeout )); then
        warn "no-change timeout ${no_change_timeout}s reached; killing $(badge "${blue}" "pid ${pid}")"
        kill "${pid}" 2>/dev/null || true
        wait "${pid}" 2>/dev/null || true
        if [[ -n "${tail_pid}" ]]; then wait "${tail_pid}" 2>/dev/null || true; fi
        if [[ "${show_pi_output}" == "errors" ]]; then cat "${output_file}"; fi
        rm -f "${output_file}"
        (( restore_errexit )) && set -e
        return 124
      elif [[ -n "${last_line}" && "${show_pi_output}" == "all" ]]; then
        info "${elapsed}s $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${yellow}" "${changed_summary}") ${dim}${last_line}${reset}"
      else
        info "${elapsed}s $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${yellow}" "${changed_summary}") ${dim}thinking${reset}"
      fi
      next_heartbeat=$((next_heartbeat + heartbeat))
    fi
    if [[ "${timeout}" =~ ^[1-9][0-9]*$ ]] && (( elapsed >= timeout )); then
      warn "timeout ${timeout}s reached; killing $(badge "${blue}" "pid ${pid}")"
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
      if [[ -n "${tail_pid}" ]]; then wait "${tail_pid}" 2>/dev/null || true; fi
      if [[ "${show_pi_output}" == "errors" ]]; then cat "${output_file}"; fi
      rm -f "${output_file}"
      (( restore_errexit )) && set -e
      return 124
    fi
  done

  set +e
  wait "${pid}"
  status=$?
  if [[ -n "${tail_pid}" ]]; then wait "${tail_pid}" 2>/dev/null || true; fi
  if [[ "${status}" != "0" && "${show_pi_output}" == "errors" ]]; then cat "${output_file}"; fi
  rm -f "${output_file}"
  (( restore_errexit )) && set -e
  return "${status}"
}

run_pi_prompt() {
  local prompt=$1 output_file status
  local restore_errexit=0
  [[ $- == *e* ]] && restore_errexit=1
  output_file="$(mktemp "${TMPDIR:-/tmp}/autofolderrefactor-pi.XXXXXX")"
  set +e
  run_pi_capture "${prompt}" with-package | tee "${output_file}"
  status=${PIPESTATUS[0]}
  if [[ ${status} -eq 0 ]]; then
    rm -f "${output_file}"
    (( restore_errexit )) && set -e
    return 0
  fi
  if [[ ${#package_args[@]} -gt 0 ]] && grep -Eq 'Tool "folder_refactor_(scan|audit|state)" conflicts' "${output_file}"; then
    warn "local folder-refactor extension already loaded by Pi; retrying without local resources"
    rm -f "${output_file}"
    run_pi_capture "${prompt}" without-package
    status=$?
    (( restore_errexit )) && set -e
    return "${status}"
  fi
  rm -f "${output_file}"
  (( restore_errexit )) && set -e
  return "${status}"
}
