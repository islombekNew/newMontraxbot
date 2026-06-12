// In-memory holat (multi-step flow'lar uchun)
const store = new Map();
module.exports = {
  get: (id) => store.get(id),
  set: (id, value) => store.set(id, value),
  clear: (id) => store.delete(id),
};
