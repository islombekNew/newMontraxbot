// Doimiy holat (multi-step flow'lar uchun): xotirada Map + data/state.json.
// Bot restart bo'lsa ham yarim qolgan buyurtma/to'lov jarayonlari tiklanadi.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'state.json');
const store = new Map();

// Ishga tushganda saqlangan holatni tiklash
try {
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const [k, v] of Object.entries(saved)) store.set(Number(k), v);
} catch { /* fayl hali yo'q — bo'sh boshlaymiz */ }

// Holat obyektlari joyida (s.action = '...') ham o'zgartiriladi, shuning uchun
// set/clear dan tashqari har 3 soniyada ham o'zgarish bo'lsa diskka yozamiz
let lastSaved = '';
function persist() {
  const obj = {};
  for (const [k, v] of store) obj[k] = v;
  const json = JSON.stringify(obj);
  if (json === lastSaved) return;
  lastSaved = json;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, json, 'utf8');
  } catch (err) {
    console.error('state saqlashda xato:', err.message);
  }
}
setInterval(persist, 3000).unref();

module.exports = {
  get: (id) => store.get(id),
  set: (id, value) => { store.set(id, value); persist(); },
  clear: (id) => { if (store.delete(id)) persist(); },
};
