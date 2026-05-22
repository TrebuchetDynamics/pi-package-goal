# Pi loop log audits

Use this read-only helper when you need to check `.pi` folders and loop logs across a workspace such as `~/git/sages-openclaw`.

```bash
node skills/diagnose/scripts/pi-log-audit.mjs /home/xel/git/sages-openclaw
node skills/diagnose/scripts/pi-log-audit.mjs --since=2h /home/xel/git/sages-openclaw
node skills/diagnose/scripts/pi-log-audit.mjs --attention-only --since=2h /home/xel/git/sages-openclaw
```

If the root path is misspelled, the helper exits without scanning and prints a sibling suggestion such as `Did you mean: /home/xel/git/sages-openclaw`.

The helper scans for `.pi` directories while skipping `.git` and `node_modules`, then summarizes every `.pi/*/logs.jsonl` file it finds, including `development-loop`, `e2e-loop`, and custom loop names. It reports config files matching `*-loop.json`, including custom loop configs. Add `--since=2h` or `--since=2026-05-22T02:30:00.000Z` to classify each log from timestamped records at or after the cutoff; records without parseable timestamps are excluded from the window and counted as `since_filtered=`. When `--attention-only` is combined with `--since`, logs with no in-window records, config-only `.pi` directories, and completed loops whose only issue is missing or malformed loop config are hidden so a recent audit is not dominated by stale loop hygiene.

For each log it reports:

- repo-relative `log_path=` and `config_path=` for the loop artifacts to inspect, parsed line count, optional `since_filtered=` count, and `bad_json` count
- latest event, iteration, phase, decision, latest event `at=`, newest available `last_at=`, newest available `run_id=`, log file `mtime=`, last `iteration_result` delivery fields (`last_result_at=`, `last_decision=`, `last_commit=`, `last_push=`), `status=`, matching config state (`config=present|missing`), matching config `adapter=`, and `attention=yes|no`
- current `ISSUE` reason with `failure_at=` for the last failure event, optional blocked-report `blocker=` and `blocker_kind=` classifier such as `git_push_fetch_first`, missing matching loop config such as `.pi/navivox-loop.json`, or malformed matching config JSON, plus `next_action=` guidance from logged `nextSteps` when present or a known blocker-kind fallback; historical failures in logs that later resumed, started a new compaction, or finished cleanly are reported as `HISTORY` without action guidance
- common interruption text such as `WebSocket error`, `WebSocket closed 1000`, or `missing E2E_LOOP_DECISION final marker`

Use `--attention-only` when you only want logs that need action; it suppresses clean loop records, including completed logs with only historical failure context, and adds `filtered_out=` to the summary.

The final `SUMMARY` line totals logs by status (`needs_attention`, `blocked`, `running`, `queued`, `done`, and `unknown`), reports `attention_logs=` for log files with `attention=yes`, reports actionable blocker-kind rollups with `blocker_kind_records=` and `top_blocker_kind=kind:count` when present, counts logs or config-only `.pi` folders with attention-worthy `issues=`, totals malformed log JSON lines, reports `logs_without_configs=` and `config_bad_json=`, and reports `.pi` folder coverage with `pi_dirs=`, `pi_dirs_without_logs=`, `pi_dirs_with_configs_without_logs=`, and `config_files=`.

The script does not edit files, resolve loops, commit, push, or delete `.pi` state. Use it to decide which loop needs continuation, compaction retry, or marker recovery.
