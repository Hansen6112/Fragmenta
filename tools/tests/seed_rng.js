// Phase 1 close-out handoff §2: every ledger's own Math.random() calls
// (both a scenario's own unforced setup and whatever the real engine
// code under test rolls internally) were previously genuinely
// nondeterministic -- true, unseeded Math.random() inside the real
// browser page. A scenario that happened not to force every roll
// (injury_ledger.js's own INJ-15 is exactly this: an unforced ally
// attack that can occasionally land a kill, ending the fight a
// different way than the scenario means to test) could fail roughly
// once every several runs with NO way to reproduce the exact sequence
// that caused it after the fact.
//
// seedPageRandom(page) installs a seeded PRNG (mulberry32 -- same
// algorithm the scratchpad Layer 2 harnesses already use for their own
// seeded trials, via page.addInitScript so it replaces window.Math.random
// before ANY of index.html's own <script> tags run, which is what makes
// every later unforced Math.random() call in the real engine draw from
// this same reproducible sequence instead of a fresh unseeded one. A
// scenario's own explicit `const orig = Math.random; Math.random = () =>
// 0.02; ...; Math.random = orig;` pattern is unaffected either way --
// `orig` just captures the seeded function instead of the native one.
//
// Usage, right after `page = await browser.newPage()` and BEFORE
// `page.goto(...)` (an init script only applies to navigations that
// happen after it's added):
//
//   const { seedPageRandom } = require('./seed_rng');
//   const seed = await seedPageRandom(page);
//   console.log(`seed: ${seed}`);   // ALWAYS printed, pass or fail --
//                                   // the point is reproducing a FAILURE
//                                   // after the fact, and a run that
//                                   // passes today could be the one
//                                   // that's asked about tomorrow.
//
// To reproduce a specific run exactly: TEST_SEED=<the printed number>
// node tools/tests/<file>.js -- same seed, same full sequence of random
// draws, byte-for-byte (confirmed: see tools/tests/README.md's own new
// "Reproducing a failure" section for the verification this claim rests
// on, not just asserted here).
function pickSeed() {
  if (process.env.TEST_SEED != null && process.env.TEST_SEED !== "") {
    const n = Number(process.env.TEST_SEED);
    if (Number.isFinite(n)) return n >>> 0;
  }
  // >>> 0 keeps it a positive 32-bit int, mulberry32's own expected input
  // range -- Date.now() alone can exceed that.
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
}

async function seedPageRandom(page) {
  const seed = pickSeed();
  await page.addInitScript((s) => {
    function mulberry32(seed) {
      return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    window.Math.random = mulberry32(s);
  }, seed);
  return seed;
}

module.exports = { seedPageRandom, pickSeed };
