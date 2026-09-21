# TaskStore contract

This is a small in-memory task registry. It exports TaskStore from store.mjs.

- R1: `create({ id, quantity })` accepts a nonempty string ID and an integer quantity from 1 through 10 inclusive. Invalid inputs throw RangeError without changing the store.
- R2: A new valid task is appended once and returned as `{ id, quantity, status: 'pending' }`. `list()` returns tasks in insertion order.
- R3: Repeating create with the same ID and quantity is idempotent: return the existing task and leave exactly one stored task for that ID.
- R4: Repeating an ID with a different valid quantity throws RangeError and leaves the existing task unchanged.
- R5: `list()` returns detached task objects. Mutating a listed object must not mutate the stored task.

Tests use fresh TaskStore instances. No network, filesystem or external services are needed by the application itself.
