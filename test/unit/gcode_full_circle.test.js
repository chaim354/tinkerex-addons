// A full circle ends where it starts. The "no movement" shortcut for retracts and primes ran
// before the arc code, so `G2 X0 Y0 I-10 J0` drew nothing and its length was charged as a retract.
// Found by the capped review; pinned beside gcode.test.js rather than inside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGcode } from "../../addons/gcode/gcode_core.js";

const onCircle = (seg, cx, cy, r) => {
  for (const [x, y] of [[seg.x0, seg.y0], [seg.x1, seg.y1]]) {
    assert.ok(Math.abs(Math.hypot(x - cx, y - cy) - r) < 1e-6, `(${x}, ${y}) is not on the circle`);
  }
};

test("a G2 full circle with I/J draws a whole ring of chords", () => {
  const parsed = parseGcode("G21 G90\nG0 X0 Y0\nG2 X0 Y0 I-10 J0 F600\n");
  const segs = parsed.layers.flatMap((l) => l.segments).filter((s) => !s.rapid);
  assert.ok(segs.length >= 60, `expected a ring of chords, got ${segs.length}`);
  for (const s of segs) onCircle(s, -10, 0, 10);
  const last = segs[segs.length - 1];
  assert.ok(Math.abs(last.x1) < 1e-9 && Math.abs(last.y1) < 1e-9, "the ring closes on its start");
  // 2π·10 mm at 600 mm/min is 6.28 s — a retract would have been charged nothing at all.
  assert.ok(Math.abs(parsed.meta.timeSeconds - 2 * Math.PI) < 1e-6, `got ${parsed.meta.timeSeconds} s`);
});

test("an extruding full circle counts as extrusion, not as a prime", () => {
  const parsed = parseGcode("G21 G90 M82\nG0 X0 Y0\nG3 X0 Y0 I-10 J0 E5 F1200\n");
  const segs = parsed.layers.flatMap((l) => l.segments).filter((s) => s.extruding);
  assert.ok(segs.length >= 60, `expected extruding chords, got ${segs.length}`);
  assert.ok(parsed.bounds.extruding, "the circle sets extruding bounds");
  // Chord endpoints straddle the far side of the ring; the bound is within one chord of x = -20.
  assert.ok(parsed.bounds.extruding.min.x < -19.9, `the ring spans to x ≈ -20, got ${parsed.bounds.extruding.min.x}`);
});

test("a start==end arc with only R stays a no-op", () => {
  const parsed = parseGcode("G21 G90\nG0 X0 Y0\nG2 X0 Y0 R10\n");
  const segs = parsed.layers.flatMap((l) => l.segments).filter((s) => !s.rapid);
  assert.equal(segs.length, 0);
});
