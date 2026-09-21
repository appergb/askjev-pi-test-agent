export class TaskStore {
  #tasks = [];

  create({ id, quantity }) {
    if (typeof id !== 'string' || id.length === 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new RangeError('invalid task');
    }
    const existing = this.#tasks.find((task) => task.id === id);
    if (existing && existing.quantity !== quantity) throw new RangeError('conflicting retry');
    if (existing) return { ...existing };
    const task = { id, quantity, status: 'pending' };
    this.#tasks.push(task);
    return { ...task };
  }

  list() {
    return this.#tasks.map((task) => ({ ...task }));
  }
}
