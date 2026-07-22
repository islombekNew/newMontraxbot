// Bir martalik skript: lokal data/*.json fayllardagi mavjud ma'lumotlarni
// Neon Postgres'ga ko'chiradi. Xavfsiz — mavjud qatorlarni qayta yozmaydi (ON CONFLICT DO NOTHING).
//
// Ishlatish: node scripts/migrate-to-postgres.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { query, pool } = require('../src/pg');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    } catch {
        return null;
    }
}

async function migrateUsers(users) {
    if (!users || !users.length) return 0;
    let count = 0;
    for (const u of users) {
        const { rowCount } = await query(
            `INSERT INTO users (id, username, first_name, lang, referrals, referred_by, blocked, joined_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO NOTHING`,
            [u.id, u.username || '', u.firstName || '', u.lang || null, u.referrals || 0,
                u.referredBy || null, !!u.blocked, u.joinedAt || new Date().toISOString()]
        );
        count += rowCount;
    }
    return count;
}

async function migrateOrders(orders) {
    if (!orders || !orders.length) return 0;
    let count = 0;
    for (const o of orders) {
        const { rowCount } = await query(
            `INSERT INTO orders (id, user_id, username, service, description, budget, deadline, phone, status, rating, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO NOTHING`,
            [o.id, o.userId, o.username || '', o.service, o.description, o.budget, o.deadline, o.phone,
                o.status || 'new', o.rating || null, o.createdAt || new Date().toISOString()]
        );
        count += rowCount;
    }
    return count;
}

async function migratePayments(payments) {
    if (!payments || !payments.length) return 0;
    let count = 0;
    for (const p of payments) {
        const { rowCount } = await query(
            `INSERT INTO payments (id, user_id, username, type, item, amount, extra, photo, status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.userId, p.username || '', p.type, p.item, p.amount, p.extra || null, p.photo,
                p.status || 'pending', p.createdAt || new Date().toISOString()]
        );
        count += rowCount;
    }
    return count;
}

async function migrateSettings(settings) {
    if (!settings) return false;
    const { rows } = await query('SELECT value FROM settings WHERE key=$1', ['main']);
    // Postgres'da settings hali default bo'lsa (templates/portfolio/faq bo'sh) — lokaldan yangilaymiz
    const isDefault = rows.length && !rows[0].value.cardNumber;
    if (rows.length && !isDefault && rows[0].value.cardNumber !== '6262 5700 3598 5797') {
        console.log('  ⏭  Postgres\'da sozlamalar allaqachon o\'zgartirilgan — o\'tkazib yuborildi');
        return false;
    }
    delete settings.adminId; // eski, endi ADMIN_IDS .env orqali
    await db.updateSettings(settings);
    return true;
}

async function main() {
    console.log('🚀 Migratsiya boshlandi: lokal JSON → Neon Postgres\n');
    await db.init();
    console.log('✅ Sxema tayyor (jadvallar mavjud/yaratildi)\n');

    const users = readJson('users.json');
    const orders = readJson('orders.json');
    const payments = readJson('payments.json');
    const settings = readJson('settings.json');

    const uCount = await migrateUsers(users);
    console.log('👥 Users: ' + uCount + '/' + (users ? users.length : 0) + ' ko‘chirildi');

    const oCount = await migrateOrders(orders);
    console.log('📦 Orders: ' + oCount + '/' + (orders ? orders.length : 0) + ' ko‘chirildi');

    const pCount = await migratePayments(payments);
    console.log('💰 Payments: ' + pCount + '/' + (payments ? payments.length : 0) + ' ko‘chirildi');

    const sOk = await migrateSettings(settings);
    console.log('⚙️  Settings: ' + (sOk ? 'yangilandi' : 'o‘tkazib yuborildi'));

    console.log('\n✅ Migratsiya tugadi!');
    await pool.end();
}

main().catch((err) => {
    console.error('❌ Migratsiya xatosi:', err);
    process.exit(1);
});
