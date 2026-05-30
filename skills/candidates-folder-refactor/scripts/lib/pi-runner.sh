#!/usr/bin/env bash
# Pi runner helpers for auto-folder-refactor
# Provides: run_pi_capture, run_pi_prompt

run_pi_capture() {
  local prompt=$1 mode=$2 output_file pid tail_pid status started now elapsed heartbeat timeout next_heartbeat bytes changed_summary last_line
  output_file="$(mktemp "${TMPDIR:-/tmp}/auto-folder-refactor-pi.XXXXXX")"
  heartbeat="${PI_AUTO_FOLDER_REFACTOR_HEARTBEAT_SECONDS:-30}"
  timeout="${PI_AUTO_FOLDER_REFACTOR_TIMEOUT_SECONDS:-0}"
  started="$(date +%s)"
  next_heartbeat="${heartbeat}"

  if [[ "${mode}" == "with-package" ]]; then
    "${pi_bin}" -p "${scope_args[@]}" "${package_args[@]}" "${extra_pi_args[@]}" "${prompt}" >"${output_file}" 2>&1 &
  else
    "${pi_bin}" -p "${scope_args[@]}" "${extra_pi_args[@]}" "${prompt}" >"${output_file}" 2>&1 &
  fi
  pid=$!
  tail -n +1 --pid="${pid}" -f "${output_file}" &
  tail_pid=$!
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
      recent_changes="$(git_scope_status | tail -5 | sed 's/^/ /' | tr '\n' ';' | cut -c 1-180)"
      if [[ -n "${last_line}" ]]; then
        info "${elapsed}s $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${yellow}" "${changed_summary}") ${dim}${last_line}${reset}"
      elif [[ "${changed_summary}" != "M:0 A:0 D:0 O:0" ]]; then
        info "${elapsed}s $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${yellow}" "${changed_summary}") ${dim}editing: ${recent_changes}${reset}"
      else
        info "${elapsed}s $(badge "${blue}" "pid ${pid}")${candidate_badge} $(badge "${yellow}" "${changed_summary}") ${dim}thinking/no stdout yet${reset}"
      fi
      next_heartbeat=$((next_heartbeat + heartbeat))
    fi
    if [[ "${timeout}" =~ ^[1-9][0-9]*$ ]] && (( elapsed >= timeout )); then
      warn "timeout ${timeout}s reached; killing $(badge "${blue}" "pid ${pid}")"
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
      wait "${tail_pid}" 2>/dev/null || true
      rm -f "${output_file}"
      return 124
    fi
  done

  set +e
  wait "${pid}"
  status=$?
  wait "${tail_pid}" 2>/dev/null || true
  rm -f "${output_file}"
  return "${status}"
}

run_pi_prompt() {
  local prompt=$1 output_file status
  output_file="$(mktemp "${TMPDIR:-/tmp}/auto-folder-refactor-pi.XXXXXX")"
  set +e
  run_pi_capture "${prompt}" with-package | tee "${output_file}"
  status=${PIPESTATUS[0]}
  if [[ ${status} -eq 0 ]]; then
    rm -f "${output_file}"
    return 0
  fi
  if [[ ${#package_args[@]} -gt 0 ]] && grep -Eq 'Tool "folder_refactor_(scan|audit|state)" conflicts' "${output_file}"; then
    warn "local folder-refactor extension already loaded by Pi; retrying without local resources"
    rm -f "${output_file}"
    run_pi_capture "${prompt}" without-package
    return $?
  fi
  rm -f "${output_file}"
  return "${status}"
}
