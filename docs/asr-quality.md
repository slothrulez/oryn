# Local transcription quality benchmark

Tiny, Base and Small use local weights that output word-level timestamps. Plain weights without attention output cannot support word-level cut editing and have been removed from the selectable list. Existing complete transcripts and edit revisions stay readable; unfinished transcripts from an old model restart with the current selection.

Tiny is the default, Base is the balanced tier, and Small is an experimental tier that needs more memory. Weights download from public model repositories and recognition runs on this machine; no paid transcription call is involved. Account for the first download and cache size; switching models releases the previous inference session.

## Repeatable benchmark

Prepare a JSON file with only local audio paths and human reference text, each item shorter than 120 seconds:

```json
[{ "id": "product-01", "audio": "product.wav", "reference": "This travel mug never leaks, even in your bag.", "language": "en" }]
```

```sh
node scripts/benchmark-local-asr.mjs --manifest samples.json --model tiny --output tiny-report.json --allow-download
node scripts/benchmark-local-asr.mjs --manifest samples.json --model base --output base-report.json --allow-download
node scripts/benchmark-local-asr.mjs --manifest samples.json --model small --output small-report.json --allow-download
```

Pass `--allow-download` only when the first download is allowed; without it only the cache is used. Use `--cache` to choose the model cache directory. Each model runs in its own process and the report lists character error rate (CER), recognized text per item, the share of valid timestamps, load/inference time, real-time factor and peak process memory. Audio is never uploaded.

CER only normalizes full-width characters, case, punctuation and whitespace; it keeps differences in number formatting. CER does not replace human checks of meaning and timing: for example "ninety-nine" versus "99" still counts as a character difference. The valid-timestamp share only checks values, order and bounds — it is not a word-alignment accuracy score.

## 2026-09-05 local check

macOS arm64, Node CPU q8, the same 8.94-second synthesized product voiceover:

| Model | Raw CER | Inference time | Real-time factor | Peak process memory | Valid timestamps |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tiny timestamped | 27.0% | 0.70 s | 0.078 | 760 MB | 100% |
| Base timestamped | 37.8% | 0.99 s | 0.111 | 1056 MB | 100% |
| Small timestamped | 37.8% | 1.83 s | 0.205 | 1947 MB | 100% |

In human review Base and Small produced identical output on this sample, including number-format conversions; Tiny misrecognized content words, so this raw CER table does not mean Tiny is more accurate. The sample is only a compatibility smoke test; it does not represent real noise, accents, product terms or long audio, and is not used to switch the default model automatically.

The browser separately completed import, chunked extraction, transcription and timeline save for the same audio with Tiny on WebGPU (encoder fp32 / decoder q4). CPU q8 timings and text do not equal browser WebGPU/WASM results.
