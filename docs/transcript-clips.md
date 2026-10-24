# Clip workbench

Turn a long transcribed recording into short clips you can preview and edit. Clip search runs locally on the existing word-level transcript — no new model or API key needed.

## In the web app

1. Open the project's **Assets → Edit video by text**, import the source and finish local transcription.
2. In the **Clip workbench**, enter a keyword from what was said, or leave it empty to see suggestions; choose a 15 / 30 / 60 / 90 second target length.
3. Review the real spoken text, the source time range and the sentence-end/pause rationale, then click **Preview source** to listen. Playback pauses automatically at the end of the clip.
4. Click **Keep only this clip**, or expand **Set time range manually** and enter start/end seconds. Existing word deletions inside the range are kept; you can still remove silences, undo, redo or clear the range limit.
5. Click **Preview edit**, check duration, subtitles and the deletion summary, then render a new edit revision. The source and older revisions are kept.

Target lengths may adjust to nearby sentence boundaries. Keywords match the spoken text literally with case and full-width normalization; suggestions come from word timings, sentence ends and pause rules — find a spot first, then listen. With no match, shorten the keyword or set the range manually.

## CLI

```sh
node bin/oryn.mjs clips --project PROJECT_ID --media MEDIA_ID --query "never leaks" --seconds 30 --limit 6
```

Returns `latestRevision` and `candidates`. Each candidate has `text`, `sourceRange`, `duration`, `firstWordId`, `lastWordId`, `reasons` and `plan`. `speechRatio` is the share of the range covered by word timings. Candidate queries are read-only — nothing is rendered and no revision is created.

Save the chosen candidate's `plan` and the query's `latestRevision` as an edit-plan file:

```json
{
  "baseRevision": 0,
  "plan": {
    "version": 1,
    "removedWordIds": [],
    "removeSilence": false,
    "silencePaddingMs": 120,
    "wordPaddingMs": 25,
    "burnSubtitles": true,
    "sourceRange": { "start": 12.5, "end": 39.2 }
  }
}
```

Replace the example seconds with the candidate's real range and `baseRevision` with the query result.

```sh
# Preview: check the returned diff and estimated duration
node bin/oryn.mjs transcript-edit --project PROJECT_ID --media MEDIA_ID --plan clip.json --operation clip-edit-001
# Once confirmed, submit the new revision with the same plan and operation
node bin/oryn.mjs transcript-edit --project PROJECT_ID --media MEDIA_ID --plan clip.json --operation clip-edit-001 --apply
```

## MCP / API

`oryn_find_clips` takes `projectId`, `mediaId` and optional `query`, `targetSeconds`, `limit`. Pass the chosen `plan` to `oryn_transcript_edit` to preview; use `latestRevision` as `baseRevision`. To keep the current draft's word deletions, inspect first to get the full plan and only replace its `sourceRange`.

HTTP query: `GET /api/project/{projectId}/media/{mediaId}/clips?query=...&targetSeconds=30&limit=6`. Keywords up to 160 characters, target length 5–120 seconds, count 1–12; an unfinished transcript returns 409 and invalid parameters return 400.

`sourceRange` uses source seconds: the overall range is applied first, then word deletion and silence removal. Older plans without this field keep using the full source. Invalid, inverted, non-finite or out-of-bounds ranges return 422. Stale revisions still return 409 and repeated operations keep the existing idempotent handling.

The in-browser preview, new revision renders, SRT / VTT subtitles and OTIO / EDL / CSV timelines all share the kept range. Subtitles are re-timed from the output start, while timelines still point to the real position in the source.

For multi-select batch output, caption phrase correction, task cancellation and recovery, see [Queue and proofreading](transcript-reliability.md).
