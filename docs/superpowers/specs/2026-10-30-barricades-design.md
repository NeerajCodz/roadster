# Ground and flying barricades

Use the user's supplied photo as a shape and finish reference: two yellow boards with black diagonal hazard stripes, dark upright posts, visible bolts and wide rubber feet. Build the prop as real reusable Three.js geometry with generated paint textures, without copying the watermarked image into a game texture.

The ground version sits at y=0. The flying version retains that frame and adds exactly two downward boosters, with visible exhaust below the body. Booster exhaust is cosmetic and does not expand the damaging collision bounds. Both variants share a 3m wide, 1.7m high, 0.85m deep body with the simulation.

All NPC cars remain at road level. Existing airborne traffic waves become flying barricade waves at their current altitudes; keep open lanes, power-ups, ramps and bolt arcs. The player's car and flight controls remain as they are.

Implementation uses a standalone DOM-free geometry factory, separate ground/flying renderer templates and pooled clones. Animate only exhaust transforms; keep visible body and collision position aligned. Preserve existing player model work.

Verification covers generated NPC traffic staying on the road, airborne barricade collisions, shared mesh bounds, exactly two downward engines, clone-safe exhaust animation, full regression tests and production build. Inspect a browser preview if local browser control is available.
