# Controlled framing and multi-platform export

One finished video can be exported as separate 9:16 versions for TikTok Shop, Instagram Reels and YouTube Shorts. Everything runs locally — no model or API key needed — and the original render is kept.

## In the web app

1. Open the project's **Export** page and pick a render version under **Multi-platform export**. The preview and every platform output in this batch use that version.
2. Choose a framing mode: **Blurred background** keeps the full frame over a blurred fill; **Letterbox** keeps the original frame with bars; **Fill & crop** fills the target frame with adjustable horizontal and vertical position.
3. Play the source to the spot you want to check and click **Use playback position**, or type a time in seconds; choose a preview platform and click **Preview framing**. The preview is a real single frame from the export engine and shows the actual sample time.
4. Tick the target platforms and click **Export selected**. Platforms are processed in turn and can be downloaded as soon as they finish; failures can be retried individually.

Crop position is the offset of the overflowing part: 0 is left/top, 0.5 is centered, 1 is right/bottom. Directions that do not overflow the target frame never move. The crop is fixed for the whole video and does not follow people; burned-in subtitles and overlays may also be cropped, so check several points in time or choose a mode that keeps the full frame.

Processing can be cancelled; finished files stay downloadable. Failures or cancellations never publish partial files. Changing the version or framing clears old previews and download links so results from old parameters are not mistaken for current ones; finished files on disk are kept.

## CLI

```bash
# Pin the version and preview a right-side crop at 3s; preview in the JSON is a JPEG data URL
node bin/oryn.mjs export --project PROJECT_ID --composition COMPOSITION_ID \
  --platform tiktok --framing crop --position-x 1 --position-y 0.5 \
  --preview --time 3 --json

# Export the full video with the same version and framing
node bin/oryn.mjs export --project PROJECT_ID --composition COMPOSITION_ID \
  --platform tiktok --framing crop --position-x 1 --position-y 0.5 --json
```

`--framing` accepts `blur` (default), `fit` and `crop`. Coordinates range 0–1. Without `--composition` the backend picks the latest successful render and returns the actual `compositionId`; automation exporting several platforms in a row should reuse that ID.

## MCP / API

`oryn_export_platform` and `POST /api/project/:id/export-platform` share parameters:

```json
{
  "platform": "reels",
  "compositionId": "COMPOSITION_ID",
  "framing": { "mode": "crop", "positionX": 0.5, "positionY": 0.3 },
  "preview": true,
  "previewTime": 3
}
```

MCP additionally takes `projectId` and returns the preview as native image content. The API preview returns `preview` (JPEG data URL), `previewTime`, `duration`, `size`, `compositionId` and the normalized `framing`; no image file is written. Preview times beyond the video length clamp to near the end.

Omit `preview` or set it to `false` to export the full video; the response has the download `url`, framing, source version and the measured bitrate `report`. `report.withinCap` only means it fits the current encoding budget — it cannot guarantee the platform will not re-encode. Older calls without framing parameters still use the blurred background.

Exports share the concurrency limit with other local composition tasks, use their own temporary files, and only expose the full file after output dimensions and duration are verified. Audio is mapped optionally from the source, and source metadata is preserved in the output.
