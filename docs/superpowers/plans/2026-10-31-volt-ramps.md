# Volt Ramps Implementation Plan

**Goal:** Three sculpted Volt launch ramps with matching launch and trick behavior.
**Architecture:** Shared pure surface layout, batched Three.js models, physical ramp contact and deferred airborne roll, kind-aware renderer pools, model inspector.
**Spec:** ../specs/2026-10-31-volt-ramps-design.md

- [x] Write failing surface/model/physics/presentation tests.
- [x] Implement shared sampler and curved Volt models.
- [x] Implement deck following, launch and deferred left/right rolls; preserve ground-roll rejection.
- [x] Integrate renderer templates, animation and inspection page.
- [x] Inspect all three models and live ramp behavior; fix material findings.
- [x] Run full verification, document and prepare conventional commit slices for push.

Parallel implementation tasks were unavailable, so implementation continued inline. Independent final review identified a raised-side entry teleport; a failing regression reproduced it, the contact check was corrected, and a follow-up review confirmed the fix.
