// Ma'lumotlar qatlami — Neon PostgreSQL orqali.
// Railway kabi platformalarda lokal fayl tizimi har deploy'da tozalanishi mumkin,
// shuning uchun hamma narsa (users/orders/payments/settings) tashqi DB'da saqlanadi.
const { pool, query } = require('./pg');

const DEFAULT_SETTINGS = {
    cardNumber: '6262 5700 3598 5797',
    contact: {
        telegram: '@Montrax_offical',
        phone: '+998 88 216 28 82',
        channel: '@MONTRAX_kanal',
    },
    servicePrices: {
        frontend: "1 500 000 so'm",
        design: "150 000 so'm",
        backend: "2 000 000 so'm",
        mobile: "4 000 000 so'm",
        uiux: "800 000 so'm",
        smm: "1 000 000 so'm/oy",
    },
    starsPackages: [
        { stars: 50, price: 13000 },
        { stars: 100, price: 25000 },
        { stars: 250, price: 60000 },
        { stars: 500, price: 118000 },
        { stars: 1000, price: 230000 },
    ],
    premiumPlans: [
        { months: 3, price: 165000 },
        { months: 6, price: 225000 },
        { months: 12, price: 400000 },
    ],
    gifts: [
        { name: '🧸 Ayiqcha', price: 20000 },
        { name: '💝 Yurak', price: 20000 },
        { name: '🌹 Atirgul', price: 30000 },
        { name: '🎂 Tort', price: 50000 },
        { name: '💎 Olmos', price: 100000 },
    ],
    channels: [
        { username: '@sabr_hikoyasi', title: 'Sabr Hikoyasi' },
        { username: '@MONTRAX_kanal', title: 'MONTRAX Kanal' },
    ],
    welcomeMsg: null,
    subMsg: null,
    templates: {},
    portfolio: [],
    faq: [],
};

/* ===== Sxema (idempotent — har ishga tushganda tekshiriladi) ===== */
async function init() {
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            username TEXT DEFAULT '',
            first_name TEXT DEFAULT '',
            lang TEXT,
            referrals INT DEFAULT 0,
            referred_by BIGINT,
            blocked BOOLEAN DEFAULT FALSE,
            joined_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            username TEXT DEFAULT '',
            service TEXT,
            description TEXT,
            budget TEXT,
            deadline TEXT,
            phone TEXT,
            status TEXT DEFAULT 'new',
            rating INT,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id);
        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            username TEXT DEFAULT '',
            type TEXT,
            item TEXT,
            amount BIGINT,
            extra JSONB,
            photo TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id);
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bot_state (
            user_id BIGINT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    `);

    const { rows } = await query('SELECT 1 FROM settings WHERE key=$1', ['main']);
    if (!rows.length) {
        await query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['main', DEFAULT_SETTINGS]);
    }
}

// Eski settings qatorida yangi maydonlar bo'lmasa — default bilan to'ldirish
function ensureSettingsShape(s) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (s[key] === undefined) s[key] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key]));
    }
    return s;
}

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ===== SETTINGS ===== */
let settingsCache = null;

async function getSettings() {
    if (settingsCache) return settingsCache;
    const { rows } = await query('SELECT value FROM settings WHERE key=$1', ['main']);
    settingsCache = rows.length ? ensureSettingsShape(rows[0].value) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return settingsCache;
}

async function updateSettings(patch) {
    const s = await getSettings();
    Object.assign(s, patch);
    await query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['main', s]
    );
    settingsCache = s;
    return s;
}

/* ===== USERS ===== */
function rowToUser(r) {
    return {
        id: Number(r.id),
        username: r.username || '',
        firstName: r.first_name || '',
        lang: r.lang || null,
        referrals: r.referrals || 0,
        referredBy: r.referred_by ? Number(r.referred_by) : null,
        blocked: !!r.blocked,
        joinedAt: r.joined_at ? new Date(r.joined_at).toISOString() : null,
    };
}

async function getUsers() {
    const { rows } = await query('SELECT * FROM users ORDER BY joined_at');
    return rows.map(rowToUser);
}

// Xotira keshi: upsertUser har update'da chaqiriladi — o'zgarmagan bo'lsa DB'ga bormaymiz
const userCache = new Map();

async function getUser(id) {
    const nid = Number(id);
    if (userCache.has(nid)) return userCache.get(nid);
    const { rows } = await query('SELECT * FROM users WHERE id=$1', [nid]);
    if (!rows.length) return null;
    const user = rowToUser(rows[0]);
    userCache.set(nid, user);
    return user;
}

async function upsertUser(from) {
    const id = from.id;
    const cached = userCache.get(id);
    const username = from.username || (cached && cached.username) || '';
    const firstName = from.first_name || (cached && cached.firstName) || '';

    if (cached && cached.username === username && cached.firstName === firstName && !cached.blocked) {
        return { user: cached, isNew: false };
    }

    // (xmax = 0) — Postgres'da shu so'rov ichida yangi qator kiritilganini aniqlash usuli
    const { rows } = await query(
        `INSERT INTO users (id, username, first_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             first_name = EXCLUDED.first_name,
             blocked = FALSE
         RETURNING *, (xmax = 0) AS inserted`,
        [id, username, firstName]
    );
    const row = rows[0];
    const user = rowToUser(row);
    userCache.set(id, user);
    return { user, isNew: row.inserted };
}

async function setUserLang(id, lang) {
    await query('UPDATE users SET lang=$1 WHERE id=$2', [lang, id]);
    const cached = userCache.get(Number(id));
    if (cached) cached.lang = lang;
}

// Broadcast'da botni bloklagan (403) userlarni belgilash
async function markBlocked(ids) {
    if (!ids || !ids.length) return;
    await query('UPDATE users SET blocked=TRUE WHERE id = ANY($1::bigint[])', [ids]);
    for (const id of ids) {
        const cached = userCache.get(Number(id));
        if (cached) cached.blocked = true;
    }
}

// Referal: yangi userga referredBy yoziladi, taklif qilganning hisobi oshadi (transaksiya bilan)
async function applyReferral(newUserId, referrerId) {
    if (Number(newUserId) === Number(referrerId)) return null;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: cur } = await client.query(
            'SELECT referred_by FROM users WHERE id=$1 FOR UPDATE', [newUserId]
        );
        if (!cur.length || cur[0].referred_by) {
            await client.query('ROLLBACK');
            return null;
        }
        const { rows: refRows } = await client.query(
            'UPDATE users SET referrals = referrals + 1 WHERE id=$1 RETURNING *', [referrerId]
        );
        if (!refRows.length) {
            await client.query('ROLLBACK');
            return null;
        }
        await client.query('UPDATE users SET referred_by=$1 WHERE id=$2', [referrerId, newUserId]);
        await client.query('COMMIT');
        const referrer = rowToUser(refRows[0]);
        userCache.set(Number(referrerId), referrer);
        userCache.delete(Number(newUserId));
        return referrer;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/* ===== ORDERS (xizmat buyurtmalari) ===== */
function rowToOrder(r) {
    return {
        id: r.id,
        userId: Number(r.user_id),
        username: r.username || '',
        service: r.service,
        description: r.description,
        budget: r.budget,
        deadline: r.deadline,
        phone: r.phone,
        status: r.status,
        rating: r.rating || undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    };
}

async function getOrders() {
    const { rows } = await query('SELECT * FROM orders ORDER BY created_at');
    return rows.map(rowToOrder);
}

async function getUserOrders(userId) {
    const { rows } = await query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at', [userId]);
    return rows.map(rowToOrder);
}

async function addOrder(order) {
    const id = genId();
    const { rows } = await query(
        `INSERT INTO orders (id, user_id, username, service, description, budget, deadline, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, order.userId, order.username || '', order.service, order.description, order.budget, order.deadline, order.phone]
    );
    return rowToOrder(rows[0]);
}

async function setOrderStatus(id, status) {
    const { rows } = await query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    return rows.length ? rowToOrder(rows[0]) : null;
}

async function setOrderRating(id, rating) {
    const { rows } = await query('UPDATE orders SET rating=$1 WHERE id=$2 RETURNING *', [rating, id]);
    return rows.length ? rowToOrder(rows[0]) : null;
}

/* ===== PAYMENTS (stars/premium/gift to'lovlari) ===== */
function rowToPayment(r) {
    return {
        id: r.id,
        userId: Number(r.user_id),
        username: r.username || '',
        type: r.type,
        item: r.item,
        amount: Number(r.amount),
        extra: r.extra || null,
        photo: r.photo,
        status: r.status,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    };
}

async function getPayments() {
    const { rows } = await query('SELECT * FROM payments ORDER BY created_at');
    return rows.map(rowToPayment);
}

async function addPayment(p) {
    const id = genId();
    const { rows } = await query(
        `INSERT INTO payments (id, user_id, username, type, item, amount, extra, photo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, p.userId, p.username || '', p.type, p.item, p.amount, p.extra || null, p.photo]
    );
    return rowToPayment(rows[0]);
}

async function setPaymentStatus(id, status) {
    const { rows } = await query('UPDATE payments SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    return rows.length ? rowToPayment(rows[0]) : null;
}

module.exports = {
    init,
    getSettings,
    updateSettings,
    getUsers,
    getUser,
    upsertUser,
    setUserLang,
    markBlocked,
    applyReferral,
    getOrders,
    getUserOrders,
    addOrder,
    setOrderStatus,
    setOrderRating,
    getPayments,
    addPayment,
    setPaymentStatus,
    genId,
};
