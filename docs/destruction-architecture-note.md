# Destruction Architecture Note

This prototype now has a first structural graph layer for the house shell: each wall or roof block is registered as a structural node, and mortar/roof-seat bonds connect adjacent masonry. Collapse release uses connected support islands rather than only a per-column "brick below me is gone" heuristic.

## Current Root Causes Found

- Whole-column falls came from `releaseUnsupportedWallBlocks()` using direct vertical support and broad face heuristics. One missing lower block could detach a tall stack even if the stack should still transfer load sideways through nearby masonry.
- Floating roof and wall slab glitches came from fixed bodies being moved for visual effects. `applyWallBulge()` changes fixed-body translations to fake bending; earlier gravity sag did the same. This creates collider gaps instead of real joint stretch, rotation, compression, or fracture.
- FPS drops come from high body churn: broken blocks spawn independent brick bodies, roof fragments, secondary impact scans, and dynamic debris all wake at once. There is no pooled debris system, no narrow stress budget, and only coarse live-debris caps.
- The bulldozer is not a force-based vehicle. `createBulldozer()` creates kinematic-position bodies and `updateBulldozerControls()` drives them with `setNextKinematicTranslation()` / `setNextKinematicRotation()`. That is stable for a prototype, but walls cannot realistically push the dozer back.
- Secondary wall damage is speed/probe based rather than using Rapier contact impulse data, so it approximates impact energy instead of reading true collision impulse and contact normals.

## First Refactor Slice Implemented

- Added data-driven material profiles for brick masonry, mortar joints, roof panels, and bulldozer steel.
- Added structural nodes, bonds, deterministic bond randomness, bond damage buckets for tension/compression/shear, and support island solving.
- Wall impacts now damage local mortar bonds before block fracture.
- Broken or removed wall blocks sever their graph bonds.
- Unsupported release now uses graph islands, so side-supported masonry can survive local holes instead of collapsing as a full column.
- Debug output now exposes structural node/bond/island counts and reports the bulldozer motion model.

## Remaining Work

- Replace kinematic bulldozer movement with a dynamic force/torque vehicle or a constrained track controller.
- Move damage from probe speed to actual contact impulse/contact normal data.
- Replace fixed-body bulge translations with joint compliance, visual-only deformation, or dynamic sub-panel constraints.
- Add roof sub-panels and brittle roof splitting driven by roof-seat bond failure.
- Add pooling/settling LOD for debris and a per-frame fracture budget based on measured frame time.
- Add deterministic destruction tests that log bond failures, support islands, active body counts, and frame cost.
