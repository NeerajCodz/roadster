# Custom lane counts

The user requests selectable lane counts1–7 and confirmed these are total lanes across the road. Normal and Opposite support1–7. Two-way supports2–7, splitting odd totals into fewer oncoming lanes on the left and more same-direction lanes on the right. Preserve the existing three modes, difficulty rules, fleet and player model.

Extend run options with a validated lane count. Missing counts migrate to the old defaults: Normal5, Two-way4, Opposite3. Centre every road with3.6m lane spacing; even counts use half-integer IDs, odd counts use integer IDs. Starting positions, controls, traffic generation, road markings, edges, scenery, gantries and cameras must use the actual selected count. Cache layouts by mode and count. Keep outermost lanes visible on phone screens, including seven-lane roads.

Single-lane runs cannot leave an empty ground escape lane. They must instead produce spaced, readable flight encounters, with longer longitudinal gaps and opportunities to recharge. Two-lane traffic can also briefly occupy both lanes while opposing drivers pass, so flight can be required there too. Avoid undefined opening lanes, empty traffic, negative gantry dimensions, unannounced maneuvers and reward/ramp routes inside new obstacles. Continue to ground NPCs and use aerial barricades for air hazards.

The setup dialog exposes native1–7 lane controls, disables1 for Two-way and upgrades a one-lane selection to2 when changing into Two-way. Preview arrows, counts, descriptions and active labels reflect the selection. Remember the count across reload/retry and preserve immutable settings during a run.

Records are separate for every mode/count/difficulty combination (60 setups). Retain the original nine default record keys, migrate existing saves without losing scores, and validate malformed lane values. Build on shared configuration rather than separate game implementations. No new media or dependencies.

Verify counts, bounds, directions, openings, single-lane population/hazards, even/odd edge clamps,7-lane visibility, geometry/collider agreement, pause/retry, record migration, the full regression suite and desktop/phone browser flows.
