// Admin ID lari: .env da ADMIN_IDS=123,456 (bir nechta) yoki eski ADMIN_ID=123
const ADMIN_IDS = String(process.env.ADMIN_IDS || process.env.ADMIN_ID || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean);

const isAdminId = (id) => ADMIN_IDS.includes(Number(id));

module.exports = { ADMIN_IDS, isAdminId };
