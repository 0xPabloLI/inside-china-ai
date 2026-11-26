/**
 * CollisionGate fixture composition (#1561).
 *
 * Dedicated entry with its own registerRoot — Root.tsx is never touched.
 * Driven by __tests__/fixed-collision-render.test.mjs through the real
 * Remotion still runtime to prove `FixedCollisionAssert` fails closed:
 *
 *   pass    two `[data-collision-box]` elements side by side → clean render
 *   fail    the same boxes partially overlap → `[FixedCollisionError]` payload
 *
 * The scene is deliberately synthetic: the gate's verdict is geometry, not
 * header-specific, and this fixture keeps the failure independent of any
 * template's Fit ladder.
 */
import React from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import { FixedCollisionAssert } from "./components/fixed-collision-gate";

const Box: React.FC<{ id: string; left: number; top: number }> = ({ id, left, top }) => (
  <div
    data-collision-box={id}
    style={{
      position: "absolute",
      left,
      top,
      width: 200,
      height: 50,
      background: "#333",
    }}
  />
);

const FixtureScene: React.FC<{ overlap?: boolean }> = ({ overlap = false }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <FixedCollisionAssert sceneId="collision-fixture">
      <Box id="fixture.a" left={60} top={220} />
      <Box id="fixture.b" left={overlap ? 100 : 400} top={220} />
    </FixedCollisionAssert>
  </AbsoluteFill>
);

const CollisionGateFixtureRoot: React.FC = () => (
  <Composition
    id="CollisionGateFixture"
    component={FixtureScene as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={60}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ overlap: false }}
  />
);

registerRoot(CollisionGateFixtureRoot);
