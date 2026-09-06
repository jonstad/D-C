# Class subclasses (not used — kept as a placeholder)

The original plan sketched one JS subclass per class (Warrior.js, Thief.js,
etc.). In scaffolding phase 1 that turned out to be unnecessary: every
class-specific difference (stats, growth rates, starting gear, ability
list) is fully data-driven through `js/data/classes.js`, and the shared
`Character` class in `js/entities/Character.js` applies that data
generically.

Keep it this way unless a class needs genuinely different *behavior*
(not just different numbers) — e.g. if the Thief's Steal ability needs
bespoke logic beyond what a generic "ability effect function" in
`abilities.js` (phase 5) can express. At that point, a thin subclass
here that overrides one method is reasonable; a full parallel class
hierarchy for four classes that only differ in data would not be.
