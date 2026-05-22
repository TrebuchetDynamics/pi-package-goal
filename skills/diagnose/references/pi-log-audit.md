# Pi loop log audits

Use this read-only helper when you need to check `.pi` folders and loop logs across a workspace such as `~/git/sages-openclaw`.

```bash
node skills/diagnose/scripts/pi-log-audit.mjs /home/xel/git/sages-openclaw
node skills/diagnose/scripts/pi-log-audit.mjs --attention-only /home/xel/git/sages-openclaw
```

If the root path is misspelled, the helper exits without scanning and prints a sibling suggestion such as `Did you mean: /home/xel/git/sages-openclaw`.

The helper scans for `.pi` directories while skipping `.git` and `node_modules`, then summarizes every `.pi/*/logs.jsonl` file it finds, including `development-loop`, `e2e-loop`, and custom loop names. It reports config files matching `*-loop.json`, including custom loop configs.

For each log it reports:

- parsed line count and `bad_json` count
- latest event, iteration, phase, decision, latest event `at=`, newest available `last_at=`, newest available `run_id=`, log file `mtime=`, last `iteration_result` delivery fields (`last_result_at=`, `last_decision=`, `last_commit=`, `last_push=`), `status=`, matching config state (`config=present|missing`), and `attention=yes|no`
- current `ISSUE` reason with `failure_at=` for the last failure event, including missing matching loop config such as `.pi/navivox-loop.json`, or `HISTORY` for a historical failure in a log that later finished cleanly
- common interruption text such as `WebSocket error`, `WebSocket closed 1000`, or `missing E2E_LOOP_DECISION final marker`

Use `--attention-only` when you only want logs that need action; it suppresses clean loop records, including completed logs with only historical failure context, and adds `filtered_out=` to the summary.

The final `SUMMARY` line totals logs by status (`needs_attention`, `blocked`, `running`, `queued`, `done`, and `unknown`), counts logs or config-only `.pi` folders with attention-worthy issues, totals malformed JSON lines, reports `logs_without_configs=`, and reports `.pi` folder coverage with `pi_dirs=`, `pi_dirs_without_logs=`, `pi_dirs_with_configs_without_logs=`, and `config_files=`.

The script does not edit files, resolve loops, commit, push, or delete `.pi` state. Use it to decide which loop needs continuation, compaction retry, or marker recovery.
