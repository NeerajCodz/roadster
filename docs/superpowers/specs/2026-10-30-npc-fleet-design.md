# Realistic NPC fleet

Expand traffic to 24 distinct vehicle types, covering everyday passenger cars, utility vehicles, commercial trucks, buses and emergency/service vehicles. Use actual three-dimensional silhouettes with sloped glazing, shaped body panels, grilles, bumpers, mirrors, lamps, tyres, wheel faces and plates. Include recognisable service liveries and several subdued real-world paint colours. Preserve the player's models and showroom.

A shared vehicle catalogue declares stable numeric variants, dimensions, wheel layout, cruising speed and spawn weight. Keep the existing first nine variant IDs compatible. Render heavy vehicles at realistic dimensions rather than shrinking buses and carriers into small cars; physics and lane spacing use the same catalogue. All NPCs stay at y=0. Flying barricades remain the only airborne NPC hazards.

Increase population progressively with staggered traffic, queues and mixed vehicle speeds. Protect the opening, reward/ramp routes and at least one ground escape lane. Prevent overlapping spawns, unsafe cut-ins and unbounded entity counts. Traffic must still signal before changing lanes and brake when following.

Use reusable Three.js geometry with static meshes combined by material, and separately animated wheel roots. Cache geometry by type and paint templates by appearance; cap dormant clone pools to keep memory predictable. Add a fleet inspection page and verify silhouette/detail, body bounds, wheel contact, brake/indicator behavior, grounding, density, gaps, deterministic retry, tests and production build.
