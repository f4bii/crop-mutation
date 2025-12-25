Excellent — this is a good place to lock things down.
Below you’ll get **(1) clean, implementation-ready pseudo-code for the simulated annealing loop** and **(2) an exact, ordered TODO list** you can hand directly to your “AI optimizer” module and implement step-by-step.

No ML, no hand-waving.

---

# 1️⃣ Simulated Annealing Loop — Pseudo-Code

This is written to **match your data structures** (`Grid`, `PlacedMutation`, unlocks, sizes, conditions).

---

## High-level function

```
function optimizeLayout(
  unlockedSlots,
  mutationsData,
  objectiveType,      // "MAX_MUTATIONS" | "MAX_PROFIT"
  maxIterations,
  startTemperature,
  coolingRate
):
```

---

## State representation

```
state:
  grid: Grid
  placedMutations: PlacedMutation[]
  crops: Map<Cell, Crop>
  score: number
```

---

## Initialization

```
state ← createEmptyState(unlockedSlots)

state ← greedySeed(state, mutationsData)

state.score ← evaluate(state, objectiveType)

bestState ← deepCopy(state)

temperature ← startTemperature
```

---

## Main annealing loop

```
for iteration = 1 → maxIterations:

  candidate ← deepCopy(state)

  moveType ← randomChoice([
    ADD_MUTATION,
    REMOVE_MUTATION,
    MOVE_MUTATION,
    SWAP_MUTATION
  ])

  if moveType == ADD_MUTATION:
    tryAddMutation(candidate)

  if moveType == REMOVE_MUTATION:
    tryRemoveMutation(candidate)

  if moveType == MOVE_MUTATION:
    tryMoveMutation(candidate)

  if moveType == SWAP_MUTATION:
    trySwapMutation(candidate)

  if not isValid(candidate):
    continue

  candidate.score ← evaluate(candidate, objectiveType)

  delta ← candidate.score - state.score

  if delta > 0:
    state ← candidate
  else:
    acceptanceProb ← exp(delta / temperature)
    if random() < acceptanceProb:
      state ← candidate

  if state.score > bestState.score:
    bestState ← deepCopy(state)

  temperature ← temperature * coolingRate

return bestState
```

---

## Acceptance logic (important)

```
accept if:
  improvement
  OR
  random() < exp((newScore - oldScore) / temperature)
```

This is what prevents getting stuck in adjacency dead-ends.

---

# 2️⃣ Move Operators (Pseudo-Code)

These are **domain-specific** — this is where your optimizer gets strong.

---

## ADD_MUTATION

```
function tryAddMutation(state):

  mutation ← randomMutationWeightedByTier()

  candidateCells ← shuffled(unlockedSlots)

  for cell in candidateCells:
    if canPlaceMutation(mutation, cell, state):
      placeMutation(mutation, cell, state)
      placeRequiredCrops(mutation, cell, state)
      return

  // fail silently
```

---

## REMOVE_MUTATION

```
function tryRemoveMutation(state):

  if state.placedMutations is empty:
    return

  mutation ← randomChoice(state.placedMutations)

  removeMutationAndAssociatedCrops(mutation, state)
```

---

## MOVE_MUTATION

```
function tryMoveMutation(state):

  if state.placedMutations is empty:
    return

  mutation ← randomChoice(state.placedMutations)
  oldPos ← mutation.position

  removeMutationAndAssociatedCrops(mutation, state)

  newCell ← randomUnlockedCell()

  if canPlaceMutation(mutation, newCell, state):
    placeMutation(mutation, newCell, state)
    placeRequiredCrops(mutation, newCell, state)
  else:
    // rollback
    placeMutation(mutation, oldPos, state)
```

---

## SWAP_MUTATION

```
function trySwapMutation(state):

  if state.placedMutations is empty:
    return

  old ← randomChoice(state.placedMutations)
  new ← randomMutationSameSize(old.size)

  pos ← old.position

  removeMutationAndAssociatedCrops(old, state)

  if canPlaceMutation(new, pos, state):
    placeMutation(new, pos, state)
    placeRequiredCrops(new, pos, state)
  else:
    placeMutation(old, pos, state)
```

---

# 3️⃣ Validity Checks (Hard Constraints)

```
function isValid(state):

  for each mutation in state:
    if overlapsAnotherMutation:
      return false

    if requiredCropsNotSatisfied:
      return false

    if needsIsolation and adjacentMutationExists:
      return false

    if groundTypeMismatch:
      return false

    if adjacent_crops == 0 and adjacentCropExists:
      return false

  return true
```

Hard constraints must **never** be violated.

---

# 4️⃣ Scoring Functions

### MAX_MUTATIONS

```
score = Σ (1 + tier * 0.25 + area * 0.1)
```

---

### MAX_PROFIT

```
score =
  Σ baseDrops
+ Σ effectBonuses
- Σ penalties
```

Precompute effect weights once.

---

# 5️⃣ Exact TODO List for Your “AI Optimizer” Module

You can literally paste this into an issue tracker.

---

## Phase 1 — Core Geometry (REQUIRED)

* [ ] Parse mutation sizes into (w,h)
* [ ] Precompute footprint offsets per mutation
* [ ] Precompute adjacency ring per mutation
* [ ] Implement `canPlaceMutation()`
* [ ] Implement grid overlap checks
* [ ] Implement ground requirement checks

---

## Phase 2 — Crop Satisfaction Solver

* [ ] Extract required crops from `conditions`
* [ ] Ignore `special` rules initially
* [ ] Implement shared crop pooling
* [ ] Enforce `adjacent_crops === 0`
* [ ] Track which crops satisfy which mutations
* [ ] Track crop reuse legality

---

## Phase 3 — State Management

* [ ] Define `OptimizerState`
* [ ] Implement deep clone utilities
* [ ] Implement mutation placement/removal
* [ ] Implement crop placement/removal
* [ ] Implement rollback logic

---

## Phase 4 — Annealing Engine

* [ ] Implement temperature schedule
* [ ] Implement acceptance probability
* [ ] Implement ADD / REMOVE / MOVE / SWAP moves
* [ ] Implement greedy seeding
* [ ] Implement best-state tracking

---

## Phase 5 — Scoring

* [ ] Implement MAX_MUTATIONS score
* [ ] Implement MAX_PROFIT score
* [ ] Map mutation `effects` → numeric bonuses
* [ ] Handle negative effects properly

---

## Phase 6 — Unlock Progression

* [ ] Enforce unlockedSlots hard constraint
* [ ] Add warm-start from previous layout
* [ ] Add early exit for small grids

---

## Phase 7 — Special Rules (Late)

* [ ] Implement `special` conditions
* [ ] Godseed effect coverage logic
* [ ] Effect spread propagation
* [ ] Visual debug overlays

---

## Phase 8 — Performance & UX

* [ ] Memoize placement validity
* [ ] Limit move attempts per iteration
* [ ] Expose iteration count to UI
* [ ] Allow “good / best” toggle

---

# Final takeaway

You are building:

* A **real optimization engine**
* Not an ML model
* With **guaranteed correctness**
* And future scalability

If you want next, I can:

* Translate this pseudo-code directly into **TypeScript**
* Design the **effect weighting table**
* Add **Godseed-specific pruning**
* Or help you visualize the annealing process

Just tell me the next step.
