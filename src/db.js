const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULTS = {
    'users.json': [],
    'orders.json': [],
    'payments.json': [],
    // Volume birinchi marta bo'sh bo'lganda bot o'zi to'liq sozlamalarni yaratadi
    'settings.json': {
        adminId: 0,
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
            { name: '\ud83e\uddf8 Ayiqcha', price: 20000 },
            { name: '\ud83d\udc9d Yurak', price: 20000 },
            { name: '\ud83c\udf39 Atirgul', price: 30000 },
            { name: '\ud83c\udf82 Tort', price: 50000 },
            { name: '\ud83d\udc8e Olmos', price: 100000 },
        ],
        channels: [
            { username: '@sabr_hikoyasi', title: 'Sabr Hikoyasi' },
            { username: '@MONTRAX_kanal', title: 'MONTRAX Kanal' },
        ],
        welcomeMsg: null,
        subMsg: null,
    },
};

// Yozish navbati (race condition oldini olish)
const queues = new Map();

function enqueue(file, task) {
    const prev = queues.get(file) || Promise.resolve();
    const next = prev.then(task, task);
    queues.set(file, next.catch(() => {}));
    return next;
}

async function readFile(file) {
    try {
        return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') {
            const def = JSON.parse(JSON.stringify(DEFAULTS[file]));
            await writeFile(file, def);
            return def;
        }
        throw err;
    }
}

async function writeFile(file, data) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const fp = path.join(DATA_DIR, file);
    const tmp = fp + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, fp); // atomik
}

function updateFile(file, mutator) {
    return enqueue(file, async() => {
        const data = await readFile(file);
        const result = await mutator(data);
        await writeFile(file, data);
        return result;
    });
}

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ===== SETTINGS ===== */
const getSettings = () => readFile('settings.json');
const updateSettings = (patch) => updateFile('settings.json', (s) => Object.assign(s, patch));

/* ===== USERS ===== */
const getUsers = () => readFile('users.json');

async function getUser(id) {
    const users = await getUsers();
    return users.find((u) => u.id === Number(id)) || null;
}

// Yangi user bo'lsa { user, isNew: true } qaytaradi
function upsertUser(from) {
    return updateFile('users.json', (users) => {
        let user = users.find((u) => u.id === from.id);
        if (!user) {
            user = {
                id: from.id,
                username: from.username || '',
                firstName: from.first_name || '',
                lang: null, // birinchi /start da tanlanadi
                referrals: 0,
                referredBy: null,
                joinedAt: new Date().toISOString(),
            };
            users.push(user);
            return { user, isNew: true };
        }
        user.username = from.username || user.username;
        user.firstName = from.first_name || user.firstName;
        return { user, isNew: false };
    });
}

function setUserLang(id, lang) {
    return updateFile('users.json', (users) => {
        const u = users.find((x) => x.id === id);
        if (u) u.lang = lang;
        return u;
    });
}

// Referal: yangi userga referredBy yoziladi, taklif qilganning hisobi oshadi
function applyReferral(newUserId, referrerId) {
    return updateFile('users.json', (users) => {
        const newUser = users.find((u) => u.id === newUserId);
        const referrer = users.find((u) => u.id === referrerId);
        if (!newUser || !referrer || newUser.referredBy || newUserId === referrerId) return null;
        newUser.referredBy = referrerId;
        referrer.referrals = (referrer.referrals || 0) + 1;
        return referrer;
    });
}

/* ===== ORDERS (xizmat buyurtmalari) ===== */
const getOrders = () => readFile('orders.json');

async function getUserOrders(userId) {
    const orders = await getOrders();
    return orders.filter((o) => o.userId === userId);
}

function addOrder(order) {
    return updateFile('orders.json', (orders) => {
        order.id = genId();
        order.status = 'new';
        order.createdAt = new Date().toISOString();
        orders.push(order);
        return order;
    });
}

function setOrderStatus(id, status) {
    return updateFile('orders.json', (orders) => {
        const o = orders.find((x) => x.id === id);
        if (o) o.status = status;
        return o || null;
    });
}

/* ===== PAYMENTS (stars/premium/gift to'lovlari) ===== */
const getPayments = () => readFile('payments.json');

function addPayment(p) {
    return updateFile('payments.json', (arr) => {
        p.id = genId();
        p.status = 'pending';
        p.createdAt = new Date().toISOString();
        arr.push(p);
        return p;
    });
}

function setPaymentStatus(id, status) {
    return updateFile('payments.json', (arr) => {
        const p = arr.find((x) => x.id === id);
        if (p) p.status = status;
        return p || null;
    });
}

module.exports = {
    getSettings,
    updateSettings,
    getUsers,
    getUser,
    upsertUser,
    setUserLang,
    applyReferral,
    getOrders,
    getUserOrders,
    addOrder,
    setOrderStatus,
    getPayments,
    addPayment,
    setPaymentStatus,
    genId,
};