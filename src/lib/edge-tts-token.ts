/**
 * Sec-MS-GEC "v2" token for the Edge Read Aloud service (paired with Sec-MS-GEC-Version "2-…").
 * The service stopped accepting the plain SHA-256 v1 token; v2 is `${cs64}-${sha256}` where both
 * halves come from a keyed SHA-256 variant. Ported from edge-tts 7.3.1 (LGPL-3.0,
 * https://github.com/rany2/edge-tts, edge_tts/drm.py). BigInt keeps the arithmetic identical to
 * the Python reference; this runs at most once per 5-minute window, so speed is irrelevant.
 */
// ES2017 target: no bigint literals.
const B = BigInt;
const M = B(0xffffffff);
const WIN_EPOCH = 11644473600;

const SHA256_INITIAL = [B(0x6a09e667), B(0xbb67ae85), B(0x3c6ef372), B(0xa54ff53a), B(0x510e527f), B(0x9b05688c), B(0x1f83d9ab), B(0x5be0cd19)];
const SHA256_STATE = [B(0xfd9fbea2), B(0x91243ce7), B(0xbe499094), B(0xcd2e1e0a), B(0x6c006f49), B(0x04bd35ab), B(0xfeb0a7e4), B(0x03effbd2)];
const SHA256_SCHEDULE = [
  B(0xeb24bf9e), B(0x1558691f), B(0xa0c09ee2), B(0x0cfa32ba), B(0xa622ee8c), B(0xd1dd9491), B(0xc0dd25a0),
  B(0xf9e70ab6), B(0xf0c31573), B(0x7058ce4e), B(0x7188e606), B(0x00e5ab33), B(0xd258b060), B(0x72766564),
];
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
].map(B);
const SHA256_ADJUSTMENT = B(0xc9dc06a7);
const K_BLOCK = [...K.slice(0, 14), SHA256_ADJUSTMENT, ...K.slice(15)];
const SIGMA0_ADJUSTMENT = B(0x059c0b80);
const SIGMA1_ADJUSTMENT = B(0x000b92c0);

const CS64_COEFFICIENTS: [bigint, bigint][] = [
  [B(0xe82e91b1), B(0xb32700d0)], [B(0x44de24c6), B(0x88dff51d)], [B(0x3beb65bc), B(0x29514038)],
  [B(0xc89c5933), B(0xb328cbdf)], [B(0x8d1ec211), B(0xd405b4d5)], [B(0x314ef5d5), B(0x26e55f3c)],
  [B(0xe92491b1), B(0x607801c6)], [B(0xf0a5b9d5), B(0x82b2c1fb)], [B(0x06064cf3), B(0xfa51a3da)],
  [B(0xda79fa60), B(0x207cc464)], [B(0xbed20560), B(0x3c3c74f3)], [B(0x89f9c9f8), B(0xd2d14b61)],
  [B(0x35fa38c6), B(0xbb04a2c1)], [B(0xcb49e3c6), B(0xc5626167)],
];
const CS64_FACTOR = B(0x82893933);
const CS64_ADJUSTMENT0 = B(0xf2f90b1a);
const CS64_ADJUSTMENT1 = B(0x0b1a0000);

const rotr = (v: bigint, n: bigint) => ((v >> n) | (v << (B(32) - n))) & M;
const rol16 = (v: bigint) => rotr(v & M, B(16));
const sigma0 = (v: bigint) => (rotr(v, B(7)) ^ rotr(v, B(18)) ^ (v >> B(3))) & M;
const sigma1 = (v: bigint) => (rotr(v, B(17)) ^ rotr(v, B(19)) ^ (v >> B(10))) & M;

function rounds(state: bigint[], w: bigint[], firstRound = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const k = firstRound === 14 ? K_BLOCK : K;
  for (let i = firstRound; i < 64; i++) {
    const s1 = rotr(e, B(6)) ^ rotr(e, B(11)) ^ rotr(e, B(25));
    const t1 = h + s1 + (g ^ (e & (f ^ g))) + k[i] + w[i];
    const s0 = rotr(a, B(2)) ^ rotr(a, B(13)) ^ rotr(a, B(22));
    const t2 = s0 + ((a & b) | (c & (a | b)));
    [a, b, c, d, e, f, g, h] = [(t1 + t2) & M, a, b, c, (d + t1) & M, e, f, g];
  }
  return [a, b, c, d, e, f, g, h];
}

function expand(w: bigint[], first = 16): void {
  for (let i = first; i < 64; i++) w.push((sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16]) & M);
}

const be = (bytes: Uint8Array) => bytes.reduce((acc, x) => (acc << B(8)) | B(x), B(0));

function shaInit(data: Uint8Array): bigint[] {
  const w: bigint[] = [...Array(14).fill(B(0)), be(data.subarray(0, 3)), be(data.subarray(3, 7))];
  for (let i = 16; i < 30; i++) {
    let v = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) v += i === 16 ? sigma1(w[i - 2]) ^ SIGMA1_ADJUSTMENT : sigma1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? sigma0(w[i - 15]) ^ SIGMA0_ADJUSTMENT : sigma0(w[i - 15]);
    w.push(v & M);
  }
  w.push((sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + SHA256_ADJUSTMENT - K[14]) & M);
  expand(w, 31);
  const working = rounds(SHA256_STATE, w, 14);
  return SHA256_INITIAL.map((x, i) => (x + working[i]) & M);
}

function shaDigest(data: Uint8Array): Uint8Array {
  if (data.length < 7) throw new Error("Token salt must contain at least seven bytes");
  const length = 57 + data.length;
  const zeros = (((55 - length) % 64) + 64) % 64;
  const padded = Buffer.concat([Buffer.from(data.subarray(7)), Buffer.from([0x80]), Buffer.alloc(zeros), Buffer.alloc(8)]);
  padded.writeBigUInt64BE(B(length * 8), padded.length - 8);
  let state = shaInit(data);
  for (let off = 0; off < padded.length; off += 64) {
    const w: bigint[] = [];
    for (let j = 0; j < 16; j++) w.push(B(padded.readUInt32BE(off + j * 4)));
    expand(w);
    const working = rounds(state, w);
    state = state.map((x, i) => (x + working[i]) & M);
  }
  const out = Buffer.alloc(32);
  state.forEach((x, i) => out.writeUInt32BE(Number(x), i * 4));
  return out;
}

function wordsLe4Even(data: Uint8Array): bigint[] {
  const buf = Buffer.concat([Buffer.from(data), Buffer.alloc((4 - (data.length % 4)) % 4)]);
  const words: bigint[] = [];
  for (let i = 0; i < buf.length; i += 4) words.push(B(buf.readUInt32LE(i)));
  if (words.length % 2) words.push(B(0));
  return words;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [bigint, bigint] {
  const d = Buffer.from(digest);
  const keyA = B(d.readUInt32LE(0)) | B(1);
  const keyB = B(d.readUInt32LE(4)) | B(1);
  const factors = [(keyA * CS64_FACTOR) & M, (keyB * CS64_FACTOR) & M];
  const terms = CS64_COEFFICIENTS.map(([coef], i) => (coef * factors[i % 2]) & M);
  const offsets = CS64_COEFFICIENTS.map(([, off]) => off);
  wordsLe4Even(Buffer.concat([Buffer.from([0]), Buffer.from(data)])).forEach((word, i) => {
    let term = word * (i % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (i % 2 === 0 ? B(0xef0569fb) : B(0xc31713db));
    if (i === 0) {
      term += CS64_ADJUSTMENT0 * factors[0];
      offset += CS64_ADJUSTMENT1;
    }
    terms.push(term & M);
    offsets.push(offset & M);
  });
  let swapAcc = B(0), swapLast = B(0), state = B(0), acc = B(0);
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offsets[i] + x) & M);
    let q = (t * B(0x76f50f34)) & M;
    swapAcc += (rol16(q) * B(0xc3efea97) + q) & M;
    t = rol16((offsets[i + 1] + y) & M);
    q = (t * B(0x1881ce3c)) & M;
    swapLast = (rol16(q) * B(0x35bd1ec9) + q) & M;
    swapAcc = (swapAcc + swapLast) & M;

    state = (state * keyA + x) & M;
    state = (rol16(state) * B(0xcf98b111)) & M;
    state = (rol16(state) * B(0x87085b9f)) & M;
    state = (rol16(state) * B(0x12ceb96d)) & M;
    state = (rol16(state) * B(0x257e1d83)) & M;
    acc += state;
    t = (state * keyB + y) & M;
    t = (rol16(t) * B(0xa27416f5)) & M;
    t = (rol16(t) * B(0xd38396ff)) & M;
    state = (rol16((rol16(t) * B(0x7c932b89)) & M) * B(0xbfa49f69)) & M;
    acc = (acc + state) & M;
  }
  return [swapLast ^ state, swapAcc ^ acc];
}

const hexUpper = (b: Uint8Array) => Buffer.from(b).toString("hex").toUpperCase();

/** Sec-MS-GEC v2 for a unix timestamp (seconds), rounded down to the 5-minute window. */
export function secMsGecV2(trustedClientToken: string, unixSeconds = Date.now() / 1000): string {
  let ticks = unixSeconds + WIN_EPOCH;
  ticks -= ticks % 300;
  const data = new TextEncoder().encode(`${B(Math.round(ticks)) * B(10_000_000)}${trustedClientToken}`);
  const digest = shaDigest(data);
  const [lo, hi] = cs64Digest(data, digest);
  const cs = Buffer.alloc(8);
  cs.writeUInt32LE(Number(lo), 0);
  cs.writeUInt32LE(Number(hi), 4);
  return `${hexUpper(cs)}-${hexUpper(digest)}`;
}
