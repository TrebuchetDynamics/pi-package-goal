# Pi loop log audits

Use this read-only helper when you need to check `.pi` folders and loop logs across a workspace such as `~/git/sages-openclaw`.

```bash
node skills/diagnose/scripts/pi-log-audit.mjs /home/xel/git/sages-openclaw
```

The helper scans for `.pi` directories while skipping `.git` and `node_modules`, then summarizes every `.pi/*/logs.jsonl` file it finds, including `development-loop`, `e2e-loop`, and custom loop names.

For each log it reports:

- parsed line count and `bad_json` count
- latest event, iteration, phase, and decision
- last failure or blocked event reason
- common interruption text such as `WebSocket error`, `WebSocket closed 1000`, or `missing E2E_LOOP_DECISION final marker`

The script does not edit files, resolve loops, commit, push, or delete `.pi` state. Use it to decide which loop needs continuation, compaction retry, or marker recovery.
