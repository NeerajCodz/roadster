# Volt launch ramps

Replace the flat launch board with three curved 3D ramps based on the user's reference: Straight, Left Roll and Right Roll. Use charcoal metal, titanium supports and Volt lime lighting, without the reference's pink colour. Keep the player's models intact.

Each model has a concave rising deck, banked lip for roll variants, ribs/panel seams, open truss supports, fixings, an entry plate, edge lights and readable directional geometry. Left and right mirror one another. A shared 8 m surface sampler drives geometry and physical deck following. Keep the width inside a 3.6 m lane.

Grounded cars ride the deck, following pitch and bank, then leave the lip with upward velocity. Roll ramps begin one free automatic barrel roll after the car is airborne and its rear clears the lip; they do not shift lanes or spend air. Straight ramps launch without automatic rotation. Q/E remains unavailable while supported on a ramp. Leaving early through flight or steering cancels the automatic trick. Pause and retry preserve/reset all ramp state correctly.

Generated ramps cycle deterministically through all three kinds with a straight opening. Renderer templates/pools include the kind in their keys and animate using simulation time. A development inspector shows all models for visual QA. No downloaded assets or dependencies.

Verify curvature, bounds, mirror handedness, Volt materials and clone-safe animation; deck contact, launch, airborne-only rolls, one-shot scoring, side/overhead passes, early exit and lifecycle behavior; seeded generation, full regression tests, build/assets and available browser checks. Commit and push conventional slices.
