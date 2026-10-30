# Road Modes Implementation Plan

> Execute shared configuration and simulation inline while independent agents implement UI/records, road rendering and behavioral regression tests. Use failing tests before implementation and conventional commit slices.

**Goal:** Three distinct road modes and real Easy/Medium/Hard gameplay, selectable and remembered.
**Architecture:** Immutable run-settings, shared road/gantry geometry, direction-aware NPC movement and bounded traffic profiles, menu-only setup with isolated records.
**Tech Stack:** Existing TypeScript, Three.js, Vite and Node test runner.
**Spec:** ../specs/2026-10-30-road-modes-design.md

## Constraints and review focus

Preserve player models/showroom and existing mechanics. No dependencies or downloaded assets. Keep NPCs grounded and flying barricades unchanged. Correct even-lane alignment, head-on closure, local turn signals, no divider crossing, narrow-road gantry gaps, pause/retry configuration and saved record migration are priority review cases. Use the existing checkout to retain the running development server.

### Shared configuration and simulation (root)

- [x] Test configuration validation and profiles; implement `run-settings.ts`.
- [x] Add immutable options, menu configuration and mode-aware opening/lane clamps.
- [x] Implement signed traffic travel, constrained lane changes and dynamic escape checks.
- [x] Apply all difficulty parameters to speed, traffic, hazards, energy and scoring.
- [x] Run new behavior regressions and existing simulation tests; fix material findings.

### Road rendering (parallel)

- [x] Add tested road geometry and shared mode-dependent gantry widths.
- [x] Cache road/scenery variants and render correct oncoming headings, steering and signals.

### Menu and records (parallel)

- [x] Test saved record sanitization/migration and isolation of the nine combinations.
- [x] Build responsive setup dialog, persist selected configuration, label active runs and preserve retry semantics.

### Delivery

- [x] Integrate independent changes and review all direction/layout/difficulty boundaries. Review fixed a shadowed direction variable in lane eligibility, permitted a genuine stopped NPC speed of zero, completed mode-specific scenery/gantry wiring, and scaled the HUD speed meter to the active difficulty.
- [x] Run full tests, TypeScript/build/assets/formatting and browser/HTTP checks: 141 tests pass, plus desktop and phone-layout browser checks.
- [x] Document verification and prepare conventional commit slices for push to the configured origin.
