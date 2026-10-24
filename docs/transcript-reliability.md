# Edit by text: queue, proofreading and batch output

## Full workflow

1. In the clip workbench, select several candidates and rename each one. Up to 12; each uses the current draft's word deletions, silence removal and subtitle settings and keeps its own selected source range.
2. Click **Preview batch output**, check each item's revision number and actual duration, then confirm. All revisions are added to the local queue at once.
3. Revision cards show queued, rendering progress, done, failed or cancelled. Cancel tasks individually, or retry failed/cancelled revisions from their saved plan.
4. Refreshing or leaving the page does not affect the server-side queue. After a server restart, tasks that lost their heartbeat are recognized as interrupted on the next read (within about 45 seconds) and can be retried from the revision card. The task center also links to the matching media.

Each retry keeps the original revision number, plan, kept range and transcript snapshot, and writes to its own output file. Subtitles from history are never silently replaced by re-transcribed text, and an old task cannot overwrite a newer attempt. Cancelling stops the local FFmpeg process and cleans up that attempt's temporary files. Older revisions without a transcript snapshot can be loaded as a draft and previewed again.

Range reads of sources and renders support browser-aborted requests; switching videos releases the file stream to avoid double-close errors.

Edits start decoding near the target range instead of decoding the whole video before a late clip. Video, audio and subtitles are still rearranged from the same source time ranges. Local regression compares frame similarity, audio difference and duration between full and seek-based decoding.

## Long transcripts and caption proofreading

The text timeline shows at most 160 words per page and full-text search locates up to 1000 hits; page back and forth, jump to a search hit or to the current playback position. Paging and search never change the edit plan.

Expand **Caption proofreading**, enter the spoken text and its correct spelling, review the matches and replacement preview, then apply. Consecutive phrases spanning word IDs, repeated text within one word, and multiple corrections of the same phrase are supported. Up to 200 entries, each at most 100 consecutive word IDs and 240 characters, with no overlaps. Corrections go through undo/redo and the revision plan; the original transcript stays unchanged.

**Remove silence** lists every detected pause by default; listen to each one, tick the ranges to cut, and adjust the milliseconds kept on either side. Older plans without explicitly saved ranges still mean "cut all detected pauses"; new plans save `removedSilenceRanges` and `silencePaddingMs`, so listening, preview, render, retry and professional timeline exports use the same pause ranges.

SRT, VTT, burned-in subtitles and clip notes in professional timelines use the proofread text. When a phrase is cut or partly deleted, the whole correction is skipped so missing words are not added back into subtitles. The timestamp granularity from the model decides which text units can be edited independently; per-character times are never averaged artificially.

## API

- `POST /api/project/{projectId}/media/{mediaId}/batch`: `action` is `preview` or `apply`, with `batchId` (8–64 letters, digits or hyphens), `baseRevision` and `items: [{ label, plan }]`. Preview returns a `proposal` per item; apply uses the same `batchId`, and repeated requests return the existing tasks. Batches are created atomically; revision conflicts return 409, invalid plans or clips under 0.5 seconds return 422.
- `POST .../edit`: `{ action: "cancel" | "retry", editId }`. Only acts on revisions of the current project/media. Successful revisions cannot be retried directly; re-output creates a new revision.
- `GET .../edit` returns the latest progress, status and error; without `limit` it returns up to 500 words.
- `GET /api/project/{projectId}/media` returns revision status, progress, batch ID and result links without resending the internal transcript snapshot.

Optional plan fields:

```json
{
  "captionReplacements": [
    { "wordIds": ["w1", "w2"], "text": "travel mug" }
  ]
}
```

Selective silence removal plans can also include `removedSilenceRanges`, each range in source time (seconds) from the transcript document:

```json
{
  "removeSilence": true,
  "removedSilenceRanges": [{ "start": 12.4, "end": 13.8 }]
}
```

Use the real consecutive IDs returned by inspect. Proofreading only changes subtitles, never source times, word deletions or audio.

## Model catalogs

The Settings and Assets pages show each platform's image/video catalog status, last check time, model count and a refresh button. Failed requests, empty catalogs and fallback catalogs are shown separately; partial failures never replace the selected default model automatically. After the key or base URL changes, old requests cannot overwrite results for the new configuration.

A successful catalog only means the catalog is readable; it does not verify key permissions, balance or generation availability. Refreshing a catalog never triggers generation or calls a paid model. Error responses use fixed error codes and never return upstream URLs, keys or raw errors.
