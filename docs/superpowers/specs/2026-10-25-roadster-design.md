# Roaster Sim design

Rebuild the publicly playable Roadster Rush concept as an original browser game with better presentation and reusable licensed 3D assets. User requests the NeerajCodz/roadster-game repository, parallel work and conventional commits. No ChatGPT Sites.

## Approach

Use TypeScript, Vite and Three.js. A pure deterministic simulation owns gameplay, a renderer owns PBR visuals, and a DOM overlay provides accessible menus and HUD. This gives browser-native play with no game-engine installation. A heavy engine/WebGPU-only route would reduce device support; a 2D recreation would not meet the 3D brief. Implementation decisions are agent-selected defaults.

## Experience

A cinematic sunset garage menu shows an actual detailed concept car. Start a five-lane endless freeway run. Steer between lanes, accelerate, hop and hold flight with limited air, dive, barrel-roll around obstacles, collect bolts and pickups, build combos and survive increasing traffic. Add pause/resume, crash results/retry, a how-to-play panel, sound toggle, graphic quality, vehicle paint selection and persistent local best records. Keyboard and touch controls work. Pause when focus is lost.

## Visuals and assets

Dark graphite interface, warm ivory typography and acid yellow accents. Large editorial typography, restrained chrome, thin technical lines. Elevated sunset highway, distant city and mountains, moving traffic, physical materials, dynamic car shadow, glow, thruster particles and speed streaks. Use a credited CC BY 4.0 concept sports car GLB with a model fallback if loading fails. Bundle assets locally and preserve asset licenses.

## Validation

Deterministic gameplay tests cover input, flight/energy, pickups, collisions, invulnerability, pause and reset. Production build must pass. Browser QA covers load, start, steering, flight, pause, retry, menu panels, responsive layout and console errors. No accounts or backend required.

## Accepted session refinements

Use the original reference site's 29 publicly served media assets, copied at the user's request. Leave the user's separate tools/roadster model work untouched. Mechanics include signaled traffic lane changes, braking, aerial patterns, roof/big-air/roll chains, kilometre bonuses, collision-aligned visuals and canvas touch gestures. Model source can be replaced separately through GameRenderer.loadCar without changing simulation rules.

The game is branded Roaster Sim per the user's final naming instruction. The GitHub repository remains NeerajCodz/roadster-game. Local storage keeps its original key so existing records survive the rename.
