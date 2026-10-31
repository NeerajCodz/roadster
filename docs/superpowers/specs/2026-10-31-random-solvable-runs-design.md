# Fresh, reachable random runs

Every normal start, restart and retry gets fresh browser entropy and a different seed from the preceding run. Explicit constructor seeds remain deterministic for tests and reproducing bugs. Randomize opening lanes/depths, NPC models/paint, ramp kind/order, encounter gaps and formation choices. Shuffled bags provide variety without a fixed repeating order.

Use a conservative route certificate before accepting any new ground body or NPC lane-change reservation. For distance ahead q and combined physical half-length h, reserve the contact interval [(q-h)/cMax, (q+h)/cMin], with c bounding the player's cruise-to-rocket speed and all NPC braking speeds. Include real body widths and the entire source-to-target lane sweep. Search connected safe time intervals from the player's actual position, with reaction and finite steering time; reject a placement if no complete route remains. Include ramps as forced launches when certifying a ground route. Elevated barricades leave this ground route clear.

One-lane roads use separated flight encounters. A tested 0.75 s lift clears the tallest/longest vehicle, then lands below sky barricades and gantries. Reserve the complete flight and recharge cycle, plus body lengths and reaction lead. Prevent overlapping encounter-time windows and provide air refills before encounters. Ramp takeoff and landing space must not be occupied by later spawns or maneuvers.

A solvable generated route means a player following its safe timing can progress; collisions remain possible after choosing an obstructed lane or wasting flight energy. Preserve difficulty scaling, two-way directions, realistic grounded NPCs, existing player models and showroom.

Independent modules implement entropy, shuffled arrangements, and the time-interval route graph. Integrate these into opening/wave/ambient generation and NPC maneuver checks. Verify random variety, deterministic explicit seeds, adversarial unreachable arrangements, physical route witnesses, many seeds/profiles, actual driving controls without artificial invincibility, full regression tests and a browser check. Commit conventional slices as work completes.
