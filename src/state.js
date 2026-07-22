// Doimiy holat (multi-step flow'lar uchun): xotirada Map + Neon Postgres (bot_state).
// get/set/clear SINXRON qoladi (hech bir handler faylini o'zgartirish shart emas),
// yozish orqa fonda DB'ga ham boradi — Railway qayta deploy qilsa ham holat yo'qolmaydi.
const { query } = require('./pg');

const store = new Map();

async function load() {
    try {
        const { rows } = await query('SELECT user_id, data FROM bot_state');
        for (const r of rows) store.set(Number(r.user_id), r.data);
        console.log('✅ Holat tiklandi:', rows.length, 'ta user');
    } catch (err) {
        console.error('❌ Holatni yuklashda xato:', err.message);
    }
}

function persist(id, value) {
    query(
        'INSERT INTO bot_state (user_id, data, updated_at) VALUES ($1, $2, now()) ' +
        'ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
        [id, value]
    ).catch((err) => console.error('state saqlashda xato:', err.message));
}

function remove(id) {
    query('DELETE FROM bot_state WHERE user_id=$1', [id])
        .catch((err) => console.error('state o‘chirishda xato:', err.message));
}

module.exports = {
    load,
    get: (id) => store.get(id),
    set: (id, value) => { store.set(id, value); persist(id, value); },
    clear: (id) => { if (store.delete(id)) remove(id); },
};
