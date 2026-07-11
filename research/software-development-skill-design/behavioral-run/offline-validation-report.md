# Offline scorer validation receipt

## Scope

Validated only the behavioral patch scorer, safe patch application, and pair-completeness gate. This run made **no provider calls**, spent **US$0.00**, and makes **no behavioral-gain or routing claim**.

## Command

```sh
node research/software-development-skill-design/behavioral-run/validate-offline-scorer.mjs
```

## Results

Each known-good and known-bad case was independently applied to two fresh fixture copies. The script asserted deep equality of both score objects before recording the receipt.

| Fixture | Known good | Known bad | Repeat deterministic |
|---|---:|---:|---|
| skill authoring | 100 | 30 | yes |
| diagnosis | 100 | 30 | yes |
| bug harvest | 100 | 30 | yes |
| Ponytail cache | 100 | 30 | yes |
| review feedback | 100 | 10 | yes |
| existing-UI redesign | 100 | 10 | yes |

Fail-closed patch checks passed:

- invalid JSON rejected;
- parent traversal rejected;
- unexpected schema keys rejected;
- symlink target rejected;
- fixture and outside sentinel remained unchanged.

Pair-completeness checks passed:

- exactly 12 unique scored ON/OFF cells accepted;
- missing pair rejected;
- duplicate cell rejected;
- unknown cell rejected;
- malformed/unscored cell rejected.

Machine-readable receipt: `offline-validation-receipt.json`.

## Claim boundary

These results prove deterministic behavior for the supplied synthetic scorer inputs and fail-closed handling for the tested malformed/path/pair cases. They do not show that any skill improves model behavior, do not validate automatic routing, and do not replicate the cited preprints.
