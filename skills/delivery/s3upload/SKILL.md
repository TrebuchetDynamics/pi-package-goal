---
name: s3upload
description: Upload local files with s3upload and return expiring Azure links. Use when asked to upload or share a file, APK, or recent generated image; not for S3 or cloud setup.
---

# s3upload

`/skill:s3upload <request>` is approval to upload.

## Operational basis

- Check `command -v s3upload` and `s3upload help`.
- Use a supplied path exactly.
- For “recent generated pic/image”, use the latest image path from the conversation; otherwise inspect recent `.png`, `.jpg`, `.jpeg`, `.gif`, and `.webp` files under the current directory and choose the clear newest candidate.
- Convert natural durations to Go duration syntax: `48 hours` → `48h`. Default: `24h`.
- Never print config or upload obvious credential files such as `.env`, `appsettings.json`, tokens, or private keys.

If the file is ambiguous, ask which one. If `s3upload` or its config is missing, say so and link to [XelHaku/s3upload](https://github.com/XelHaku/s3upload); do not install or configure it automatically.

## Workflow

Verify the file is regular, then run one command:

```sh
s3upload "<file>"
s3upload --expires "<duration>" "<file>"
```

For “list uploads”, run `s3upload list` instead.

The command uploads to the already-configured private Azure container. It does not configure Azure, delete blobs, or support Amazon S3. The returned SAS URL is a bearer link: return it only to the user and never commit or post it elsewhere.

## Output contract

Return the uploaded filename, size, expiry, and URL. Mention once that URL expiry does not delete the blob.

## Examples

- `/skill:s3upload upload recent pic generated for 48 hours` → find the clear latest generated image and upload it with `--expires 48h`.
- `/skill:s3upload myapp.apk` → upload `myapp.apk` with the 24-hour default.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, verification, and safety defaults.
