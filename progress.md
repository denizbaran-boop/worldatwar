Original prompt: Build the first playable MVP foundation of a web strategy game called "World at War" using Next.js App Router + TypeScript + Tailwind + Zustand with local-only game logic.

- Initialized empty workspace assessment.
- Decided to scaffold full project structure from scratch.

- Added full Next.js + TS + Tailwind scaffold files and game routes.
- Implemented game domain logic in `src/lib/game/*` (map generation, adjacency, exploration, economy, training, attack resolution, ranking).
- Implemented Zustand game store with turn gating, attack flow, logs, and game-over at 30 turns.
- Implemented MVP UI components (world map, hex grid, action panel, player sidebar, logs, battle modal, game over modal).
- Exposed `window.render_game_to_text` and `window.advanceTime` compatibility hooks for automated web-game testing.

- Installed dependencies and validated with `npm run typecheck`, `npm run lint`, and `npm run build`.
- Fixed Next.js App Router typing change for `/game` by moving query parsing to server page wrapper + client game component.
- Ran Playwright client loop (local copy of skill script due module resolution from shared skill path).
- Found runtime loop error from unstable Zustand selectors; fixed by using `useShallow` in object selectors.
- Re-ran Playwright verification: in-game screen renders correctly, `state-*.json` outputs valid game state, and no `errors-*.json` files were produced in latest run.

- Refactored UX flow to three routes: `/` (landing), `/setup` (play options + setup), `/game` (active match).
- Added new menu components for landing hero, play options, and setup panel.
- Extended Zustand store with `setup` state (`playerCount`, `localPlayerColor`, `matchInitialized`) plus `setSetup` and `startLocalMatch`.
- `/game` now guards against direct access before match initialization and shows a clean fallback card.
- Verified with `npm run typecheck`, `npm run lint`, and `npm run build` (all passing).
- Ran Playwright screenshot checks for `/`, `/setup`, setup transition, and `/game` guard state; fixed a setup-page Zustand selector loop using `useShallow`.

- Added new gameplay state models in `types.ts`: `tile.hasGoldMine`, `tile.fortification`, `tile.unitCounts`, `player.tankReserve`, and `player.unlockedTechs`.
- Added economy/combat/tech constants in `constants.ts`: mine chance/income, tech costs, tank costs/power, and fortification defense bonus.
- Refactored map/action/battle domain logic:
  - Explore now has 10% per-tile Gold Mine discovery with state persistence.
  - Turn transition now grants +20 gold per mine to the incoming active player.
  - Added tech unlock spending logic and tank production at capital.
  - Added fortification flow (+200 defense) with ownership validation.
  - Added tank-aware combat calculations and fortification/capital defense integration.
  - Capturing a tile removes fortification consistently (documented inline).
  - Tile ownership transfer preserves mine state via tile ownership and transfers mine control automatically.
- Refactored Zustand store to integrate new systems:
  - New action mode: `fortify`.
  - New store actions: `unlockTech`, `buildTank`, `toggleFortifyTile`, `confirmFortifySelection`.
  - Added mine income processing + log events during `endTurn`.
  - Added new log events for mine discovery, tech unlock, fortification, and tank production.
- UI updates:
  - Reworked `HexTile` visuals with a minimalist faceless green infantry icon + tank icon and clear mine/fortification markers.
  - Updated map inspector to show infantry/tanks, mine, and fortification values.
  - Added `TechTreePanel` with unlock cards, locked/unlocked states, and gold-based affordance.
  - Enhanced `ActionPanel` with Build Tank and Fortify controls.
  - Updated `PlayerSidebar` to show tank reserve and per-turn mine income.
- Updated `render_game_to_text` payload with tank reserves, unlocked techs, and enriched tile unit/mine/fortification data.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Ran Playwright client script (skill workflow) for `/setup` and `/game` route guards and inspected screenshots:
  - `output/web-game-tech-setup/shot-0.png`
  - `output/web-game-tech-game/shot-0.png`
- Limitation: the provided Playwright client supports only one selector click and canvas-oriented action bursts, so it could not fully drive the two-step setup flow to in-game map interaction in one run.

TODO for next agent:
- Add explicit test hooks/selectors for menu flow (`/setup` options -> config -> start match) to allow full automated in-game regression capture with the existing client.
- Add a dedicated in-game interaction test burst that exercises mine discovery, tech unlock, fortify, and tank production end-to-end.

- Added AI opponent system with modular heuristic engine in `src/lib/game/ai.ts`.
  - Implemented: `runAITurn`, `evaluateMove`, `chooseBestAction`, `performAIAttack`, `performAIExplore`.
  - Difficulty profiles: easy / normal / hard.
  - Added AI action delays + log feedback (`AI thinking...`, action logs).
- Added setup game mode controls in setup UI:
  - `Player vs Player`
  - `Player vs AI`
  - AI difficulty selector (when PvAI).
- Extended store setup/game state for AI:
  - `setup.gameMode`, `setup.aiDifficulty`
  - `aiPlayerIds`, `aiTurnInProgress`
  - `runAITurn` action for automatic AI turns.
- Wired automatic AI turns from `GamePageClient` effect.
- Added AI labels in player sidebar rows.
- Implemented requested combat/movement updates:
  - Ranged tank shots: tanks stay in source tile; each tank deals 50 damage to target infantry.
  - Tank/infantry stacking prevented for movement destination constraints.
  - Removed Move Army button and shifted to drag-and-drop transfer with post-drop amount prompt.
- Validation: `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

- Refactor in progress: migrated core game model from stacked armies to unit entities.
- Added new game modules:
  - `src/lib/game/unitSystem.ts` (unit stats, move range, cost, icons)
  - `src/lib/game/fogOfWar.ts` (per-player discovery and adjacent reveal)
  - `src/lib/game/combatSystem.ts` (unit-vs-unit compatibility + simple resolve)
  - `src/lib/game/techTree.ts` (radial tech node definitions + prerequisite checks)
- Replaced old tile/unit models in `types.ts`, `map.ts`, `actions.ts`, and `gameStore.ts`:
  - removed old Explore/Fortify/stacked-army/battle-modal data flow
  - added per-tile single-unit occupancy, `hasMovedThisTurn`, movement-based exploration, production, and tech unlocks.
- Reworked map rendering components to the new model:
  - `GameBoard`, `WorldMap`, `HexTile`, plus new `TileRenderer` and `UnitRenderer`
  - undiscovered tiles now render with fog visuals; no numeric army labels.
- Added radial `TechTreeModal` and rewired `GamePageClient` to use it.
- Validation after refactor:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm run build` passed.
- Playwright client runs completed:
  - `output/web-game-unit-game/shot-0.png` + `state-0.json`
  - `output/web-game-unit-setup/shot-0.png`
- Visual inspection completed for latest screenshots (setup and game guard screens).
- Limitation remains with current Playwright client: it requires action payloads tied to canvas input and supports only a single selector click, so full setup->start-match->in-game map automation remains constrained.

- Added village + mine economy refactor:
  - New modules: `villageSystem.ts`, `economySystem.ts`, `gameState.ts`.
  - Villages are generated at match start with ownership + controlled territory tracking.
  - Neutral village discovery now auto-claims village and applies 1-tile territory control.
  - Village discovery reveals up to 2-tile radius for discovering player.
  - Capturing a village tile transfers entire village-controlled territory immediately.
  - Gold mines generated separately from villages and grant +20/turn when controlled.
- Updated turn economy to use village (+30) and mine (+20) incomes via `economySystem`.
- Updated unit/combat model:
  - Units now persist health in state.
  - Deterministic damage combat (`defender.health -= attacker.damage`) with destroy-on-zero.
  - Ground units cannot attack aircraft; aircraft can attack ground.
- Updated visuals:
  - Added village and mine tile indicators.
  - Added per-unit health bars/text for damaged-unit readability.
  - Removed heavy unit backdrop style from center icon rendering.
- Added Finish Game flow in action panel (reset state + route to `/`).
- Validation: `npm run typecheck`, `npm run lint`, `npm run build` passed.
- Playwright artifacts (current client limitations remain for full setup->in-game automation):
  - `output/web-game-village-game/shot-0.png`
  - `output/web-game-village-game/state-0.json`
  - `output/web-game-village-setup/shot-0.png`

- Implemented map size presets (small/medium/large) end-to-end:
  - Added `MapSize` type and setup state/config wiring.
  - Added map size selection UI in setup screen.
  - Added `MAP_SIZE_PRESETS` in constants and connected preset dimensions/resource density to map generation.
  - Updated initial state generation to use per-size cols/rows, village counts, mine counts, and capital distance.
- Improved fog discovery correctness for variable map sizes:
  - Added `discoverTileAndNeighborsOnMap` and updated discovery calls to avoid out-of-map fog reveal artifacts.
- Reworked AI turn behavior for stronger economy + pressure:
  - AI now unlocks affordable techs each turn (difficulty-limited cadence).
  - AI now produces units aggressively based on difficulty, map scale, gold, and army target size.
  - AI spawn tile choice now prioritizes frontline pressure plus owned villages/mines/capital reinforcement.
  - AI now performs multiple unit actions per turn instead of a single move.
  - Hard AI profile now has highest production/tech cadence and lower visible-action delay.
- Added AI visibility-safe action reporting:
  - `attemptUnitAction` now supports visibility-aware logging for AI actions.
  - Hidden-area AI movement/combat no longer prints revealing tile-level logs.
  - AI production logging now hides exact reinforcement location if outside player vision.
  - AI turn appends generic hidden-activity report when actions occur beyond reconnaissance.
- Tech tree modal layout overhaul:
  - Converted modal to fixed-height desktop-friendly shell with sticky top bar.
  - Added scrollable graph viewport with drag-to-pan support.
  - Moved node list to independently scrollable side pane.
  - Increased graph canvas to prevent bottom-node clipping and keep full tree reachable.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Playwright client runs completed with project-local script:
  - `output/web-game-update-setup/shot-0.png` (setup panel visible with new map size selector)
  - `output/web-game-update-game/shot-0.png` + `state-0.json` (no-active-match guard)
- Limitation: with current client capabilities and current menu flow, automated traversal from `/setup` options -> config -> start match -> in-game interactions remains constrained in a single run.

TODO for next agent:
- Add deterministic setup test hooks (or route/query-driven setup step override) to enable full automation into an active match.
- Add an automated in-game Playwright scenario that opens tech tree, verifies internal graph scrolling/panning, and validates hidden AI activity/log behavior while fogged.

- Applied gameplay rule update pass:
  - Removed max-turn win condition (no turn-cap based game over).
  - Victory condition now resolves when one commander controls all capitals.
  - Starting gold reduced to 10.
  - Removed initial automatic village claims so no player starts with active mines via pre-claimed territory.
  - Tank rebalance: 10 HP, 5 damage, movement range 1.
  - Replaced tank icon from wheel to vehicle emoji in both unit system and tech tree.
  - Enforced fog-constrained movement/attacks: units cannot target or traverse undiscovered terrain.
  - Updated AI move chooser to only consider discovered targets under the new movement constraint.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed (after cleaning `.next` + `.next-dev` due stale manifest artifact).

- Implemented fog-of-war reliability pass to prevent unit/AI fog trapping:
  - Added new fog helpers in `fogOfWar.ts`:
    - `revealAroundUnit(...)`
    - `revealAroundUnitsForPlayer(...)`
    - `revealAroundAllUnits(...)`
  - Unit-centered reveal radius (default 1) now enforces discovery of unit tile + adjacent tiles.
- Wired unit-centered reveal across required state transitions in store:
  - initial match state creation (`createMatchState`)
  - after unit movement / action resolution
  - after village-capture-driven visibility changes
  - after unit production/spawn
  - on turn transition (`endTurn`), ensuring next-turn visibility consistency
- Movement/fog interaction rules adjusted:
  - Removed fog-based movement blocking checks that prevented moving through/into hidden areas.
  - Keeps movement range/combat occupancy rules intact while allowing natural exploration.
- AI visibility consistency improvements:
  - AI decisions still use discovered-space inputs, but with guaranteed per-unit reveal updates each turn/action, preventing AI inactivity due to stale hidden neighbors.
- Map zoom UX upgrade in `WorldMap.tsx`:
  - Added mouse-wheel zoom on map viewport (not page scroll).
  - Prevents page scrolling while zooming over map area.
  - Implemented cursor-centered zoom math for natural strategy-style feel.
  - Increased zoom range to min `0.45` and max `4.0` (400%).
  - Kept drag-pan compatibility and smooth transform transitions.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Playwright client runs completed and artifacts inspected:
  - `output/web-game-fog-setup/shot-0.png`
  - `output/web-game-fog-game/shot-0.png`
  - `output/web-game-fog-game/state-0.json`
- Limitation remains: current scripted flow still cannot fully automate setup->start-match->in-game interaction in one run with this client.

- AI production reliability fix:
  - Added unit-budget-aware AI tech unlocking so AI does not spend itself below minimum train cost when it still needs army count.
  - Added stronger warrior production fallback behavior once warrior is unlocked/affordable.
  - Refactored AI production into reusable phase and added a second production pass after movement (important when early turn spawn tiles are occupied and become free after movement).
  - This reduces turns where AI appears unable to train any entity.
- Validation: `npm run typecheck` and `npm run lint` passed.

- Mitigated recurring dev-time `ChunkLoadError`/`[object Event]` unhandled rejection risk by removing destructive cache deletion from `npm run dev`.

- Tech tree visual redesign in progress:
  - Replaced radial circle-node graph metadata with fixed hex-grid positioning (`gridX/gridY`) for a more reference-style branch layout.
  - Added shared `unitAssets.ts` so the tech tree can reuse the same real unit art shown on the map.
  - Reworked `TechTreeModal` to render photo-backed hex research nodes with status coloring, central hub styling, and brighter branch connectors.
  - Found dev-runtime hydration failure unrelated to the modal: custom `distDir: ".next-dev"` was serving page HTML while `_next` JS/CSS assets 404ed, preventing button interactions in browser tests.
  - Switched Next config back to the default dist directory to restore interactive browser verification.
  - Tightened graph spacing and initial centering so the main branch is visible immediately when the modal opens.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Required Playwright client run completed:
  - `output/web-game-tech-tree-client/shot-0.png`
- Full in-game browser verification completed with direct Playwright flow:
  - `output/web-game-tech-tree-modal/shot-0.png`
  - `output/web-game-tech-tree-modal/state-0.json`
  - No `errors-0.json` was produced.
  - `package.json` dev script changed from removing `.next/.next-dev` on each start to plain `NEXT_DISABLE_WEBPACK_CACHE=1 next dev`.

- Implemented unit animation pass for movement and combat:
  - Added tunable animation constants in `src/lib/game/animationConfig.ts`.
  - Added `src/lib/game/unitActionPreview.ts` to preview move/attack intent, derive multi-tile move paths, and keep animation orchestration separate from store rules.
  - Added store-level queued action + interaction lock in `src/store/gameStore.ts` so tile clicks and action-panel commands can animate first and commit once at the correct time.
  - Reworked `src/components/game/GameBoard.tsx` to:
    - animate step-by-step movement with per-tile interpolation
    - hide the static unit while a move ghost traverses the path
    - play attacker recoil, projectile FX, target hit flash, and death ghost timing
    - delay the real `attemptUnitAction` commit until the movement/impact timing point
  - Extended `UnitRenderer`/`HexTile` to support transient transform/flash/ghost states without changing the base rendering system.
  - Added attack impact timing metadata to `AttackAnimationLayer.tsx`.
  - Wired UI safety into `ActionPanel`, `CityProductionPanel`, `TechTreeModal`, and `GamePageClient` so end-turn / tech / production / text-state reporting respect the animation lock.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- Required web-game client run completed with local copy of the skill script:
  - `output/web-game-anim-client/shot-0.png`
  - `output/web-game-anim-client/shot-1.png`
  - `output/web-game-anim-client/shot-2.png`
- Full in-game Playwright verification completed after the animation lock/timing fixes:
  - movement sequence captures:
    - `output/web-game-unit-animations/shot-move-turn-1-issued.png`
    - `output/web-game-unit-animations/shot-move-turn-1-settled.png`
    - additional turn captures through `shot-move-turn-7-settled.png`
  - attack sequence captures:
    - `output/web-game-unit-animations/shot-attack-issued.png`
    - `output/web-game-unit-animations/shot-after-attack.png`
  - `output/web-game-unit-animations/shot-attack-issued.json` shows `actionAnimationBusy: true` before the hit is committed
  - `output/web-game-unit-animations/shot-after-attack.json` shows the target at `1 HP` and the attacker flagged as having attacked after the animation window
  - no `errors.json` was produced in the final run.

- Added diplomacy status + reinforcement log sidebar support:
  - Added `lastCombatTurnByPair` to store state so faction relationships can derive `WAR` for three turns after combat unless a peace treaty overrides it.
  - Added a dedicated `diplomacyLog` feed for reinforcement activity instead of relying on transient screen notifications.
  - Updated combat resolution to stamp the combat turn for the acting/defending faction pair.
  - Updated reinforcement request / accept / reject / donation flows for both human and AI paths to append diplomacy-log entries.
  - Restricted reinforcement popup notifications so they only appear when the human player is directly involved.
  - Extended `PlayerSidebar` with bottom sections for:
    - diplomacy status rows (`⚔`, `☮`, `○`)
    - reinforcement log entries
  - Extended `render_game_to_text` with diplomacy log and combat-pair timing for easier automated verification.

Validation:
- `npm run typecheck` passed.
- `npm run lint` passed.
- Required web-game client run completed:
  - `output/web-game-diplomacy-client/shot-0.png`
- Full in-game browser verification completed:
  - `output/web-game-diplomacy-status/shot-0-start.png` + `shot-0-start-panel.json` confirms initial neutral row (`blue○red`) and reinforcement log placeholder
  - `output/web-game-diplomacy-status/shot-1-war.png` + `shot-1-war-panel.json` confirms the row switches to war (`blue⚔red`) after an attack
  - `output/web-game-diplomacy-status/shot-2-neutral.png` + `shot-2-neutral-panel.json` confirms the row returns to neutral (`blue○red`) after three no-combat turns
  - no `errors.json` was produced in the final diplomacy verification run.
- Validation: `npm run typecheck` and `npm run lint` passed.

- Diplomacy AI peace overhaul in progress:
  - Added `src/lib/game/diplomacy.ts` with reusable peace willingness scoring, proposal/acceptance probabilities, cooldown helpers, trust memory, and personality-based modifiers.
  - Extended peace state in `gameStore.ts` to track pair memories, cooldowns, betrayal decay, structured AI peace debug entries, and reason-carrying peace offers/results.
  - Rewired human peace sends, AI treaty acceptance, peace breaking, and AI proactive peace offers to use the shared scoring system instead of the old binary check.
  - Updated the in-game peace modal to show the AI's generated treaty reason and sidebar treaty controls to respect diplomacy cooldowns.
  - Validation completed: `npm run typecheck`, `npm run lint`, and `npm run build` all passed.
  - Browser verification completed against `http://127.0.0.1:3001` with Playwright:
    - `output/web-game-diplomacy-check/shot-0.png`
    - `output/web-game-diplomacy-check/state-0.json`
    - No `errors-0.json` was produced.

- AI strategic activity overhaul in progress:
  - Rebuilt `src/lib/game/ai.ts` around strategic modes, expansion-pressure analysis, desired-army sizing, reinforcement-request evaluation, and peace-break scoring.
  - Extended `gameStore.ts` with persistent `aiActivityByPlayer` tracking so AI reacts to multi-turn stagnation, low army size, boxed-in states, and missed exploration/production opportunities.
  - Reworked the AI turn loop order to keep acting during peace: diplomacy -> incoming reinforcement resolution -> help requests -> tech -> aggressive production -> optional strategic peace break -> movement/exploration -> healing -> follow-up production.
  - AI can now request reinforcements from peace partners, including the human player, using the existing delayed request flow.
  - Validation completed: `npm run typecheck`, `npm run lint`, and `npm run build` all passed.
  - Browser verification completed against `http://127.0.0.1:3001` with Playwright:
    - `output/web-game-ai-strategy-check/shot-0.png`
    - `output/web-game-ai-strategy-check/state-0.json`
    - No `errors-0.json` was produced.
