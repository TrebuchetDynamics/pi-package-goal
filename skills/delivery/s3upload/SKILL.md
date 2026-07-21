---
name: s3upload
description: Upload, list, or delete files with s3upload and return expiring Azure links. Use for configured temporary Azure storage; not for S3 or cloud setup.
---

# s3upload

`/s3upload <request>` or `/skill:s3upload <request>` is approval for the requested upload, list, or deletion. Deletion requires the request to say `delete all`; never infer it.

## Operational basis

- Check `command -v s3upload` and `s3upload help`.
- Use a supplied path exactly.
- For “recent generated pic/image”, use the latest image path from the conversation; otherwise inspect recent `.png`, `.jpg`, `.jpeg`, `.gif`, and `.webp` files under the current directory and choose the clear newest candidate.
- Convert natural durations to Go duration syntax: `48 hours` → `48h`. Default: `24h`; lifecycle-managed containers reject link lifetimes longer than their deletion window.
- Never print config or upload obvious credential files such as `.env`, `appsettings.json`, tokens, or private keys.

If the file is ambiguous, ask which one. If `s3upload` or its config is missing, say so and link to [XelHaku/s3upload](https://github.com/XelHaku/s3upload); do not install or configure it automatically.

## Workflow

Verify the file is regular, then run one command:

```sh
s3upload "<file>"
s3upload --expires "<duration>" "<file>"
```

For “list uploads”, run `s3upload list`. For an explicit “delete all” request, run:

```sh
s3upload delete all
```

This immediately deletes every blob in the configured container; no other delete scope is supported. A container name in the request describes the expected configured container and is not a CLI argument.

The command uploads to the already-configured private Azure container. Deletion uses the container's configured Azure lifecycle policy, or exact Set Blob Expiry on hierarchical namespace-enabled accounts. If exact expiry is unsupported, the CLI removes the new blob and returns an error. It does not configure Azure or support Amazon S3. The returned SAS URL is a bearer link: return it only to the user and never commit or post it elsewhere.

## Output contract

For uploads, return the filename, size, link expiry, and reported deletion window first. Lifecycle deletion is approximate. The final line must contain only the raw URL: no Markdown link, parentheses, angle brackets, label, code fence, or text after it. For deletion, return the CLI's deleted count and container name.

## Examples

- `/s3upload upload recent pic generated for 48 hours` → find the clear latest generated image and upload it with `--expires 48h`.
- `/s3upload myapp.apk` → upload `myapp.apk` with the 24-hour default.
- `/s3upload delete all files in temporary-uploads` → run `s3upload delete all` once.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, verification, and safety defaults.
