# Local media library

On a project's **Assets** page, expand **Local media library** to upload your own product photos, real footage and B-roll and reuse them across the project's shots.

## Usage

1. Click **Upload media**. Up to 12 files per upload, 80 MB each; MP4, WebM, MOV, M4V, JPG/JPEG, PNG and WebP are supported.
2. Upload progress and file checks are shown; you can cancel, or retry only the unfinished items. Re-uploading identical content reuses the existing file and keeps its edited name and tags.
3. Click **Name & tags** to organize media. Names and tags feed search and automatic shot matching; up to 12 tags of at most 32 characters each. Filter by image/video, sort by upload time or name; the list shows 12 items per page.
4. Select a shot and click **Use for this shot** to make the item the current version. Older candidates are kept and can be switched back in the quality desk; composition reads the selected version.
5. Click **Fill empty shots from local media** to match visuals from this project's media only — no model or online stock source is called. Shots with a selected finished asset, queued or generating tasks, and product-photo shots are skipped. Failed records and unselected history versions do not block the fill.

A single shot's **Upload / Replace media** also accepts the formats above and saves them into the local media library automatically. GIF, SVG and BMP still use the original single-shot image upload and are not added to the library.

## Storage and API

- Files live in `APP_DATA_DIR/uploads/<projectId>/materials/`; without a data directory the project's `data/` is used. Names and tags are stored in a `.oryn.json` metadata file in the same directory; the original media is never modified.
- New uploads stream into a temporary file, are size-limited by actual bytes, checked by media probing for format, dimensions and video duration, then saved under a content-hash name. Cancelled or failed requests clean up their temporary files.
- Older images and videos placed in the directory by hand stay readable and can be given names and tags; without metadata they are searched by original filename. Symlinks, temporary files and auto-extracted tail frames are not listed.
- `GET /api/project/<id>/materials` returns media and preview URLs; `PATCH` accepts `{ name, originalName, tags }`, where `name` is the stored filename returned by the API.
- For `POST`, send one file per request: `Content-Type: application/octet-stream`, `X-File-Name` set to the URL-encoded original filename, and the raw file bytes as the body. Success returns `materials` and `duplicate`.
- The legacy multipart `files` field is still supported (1–12 files, 80 MB total). If some files fail validation the response is HTTP 207 listing the saved `materials` and the failed `errors` separately; callers should check both before retrying.

Uploading, tagging and local-only filling never incur model costs. If media is missing or unsuitable, add more and reselect the shot.
