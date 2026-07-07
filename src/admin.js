const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t } = require('./i18n');
const { ADMIN_IDS, isAdminId } = require('./config');
const { TEMPLATES, getTpl, setTpl } = require('./templates');
const { ratingKeyboard } = require('./extras');

const isAdmin = (ctx) => ctx.from && isAdminId(ctx.from.id);
const fmt = (n) => Number(n).toLocaleString('uz-UZ');

const STATUS_UZ = {
    new: '🆕 Yangi',
    accepted: '✅ Qabul qilindi',
    in_progress: '⚙️ Jarayonda',
    done: '🎉 Bajarildi',
    rejected: '❌ Rad etildi',
    pending: '⏳ Kutilmoqda',
    approved: '✅ Tasdiqlandi',
};
// Nomalum statusda crash bo'lmasligi uchun
const stLabel = (s) => STATUS_UZ[s] || ('❓ ' + s);
// O'chirilgan xizmat kaliti uchun fallback
const svcLabel = (svc) => {
    const v = t('uz', 'menu_' + svc);
    return v === 'menu_' + svc ? svc : v;
};

/* ===== Panel sarlavhasi: bugungi statistika bilan ===== */
async function panelText() {
    const [users, orders] = await Promise.all([db.getUsers(), db.getOrders()]);
    const today = new Date().toISOString().slice(0, 10);
    const todayUsers = users.filter((u) => (u.joinedAt || '').startsWith(today)).length;
    const todayOrders = orders.filter((o) => (o.createdAt || '').startsWith(today)).length;
    const pending = orders.filter((o) => o.status === 'new').length;
    return (
        '👑 <b>EGA ADMIN PANEL</b>\n\n' +
        '📊 Bugungi: +' + todayUsers + ' foydalanuvchi, +' + todayOrders + ' buyurtma\n' +
        '📦 Kutilmoqda: ' + pending + ' buyurtma\n\n' +
        'Amalni tanlang'
    );
}

function panelKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📊 Statistika', 'adm:stats'),
            Markup.button.callback('👥 Foydalanuvchilar', 'adm:users'),
        ],
        [
            Markup.button.callback('📦 Buyurtmalar', 'adm:orders'),
            Markup.button.callback('💰 To‘lovlar', 'adm:pays'),
        ],
        [
            Markup.button.callback('📣 Broadcast', 'adm:broadcast'),
            Markup.button.callback('⚙️ Sozlamalar', 'adm:settings'),
        ],
        [
            Markup.button.callback('✉️ Bot xabarlari', 'adm:tpls'),
            Markup.button.callback('💵 Narxlar', 'adm:prices'),
        ],
        [
            Markup.button.callback('🖼 Portfolio', 'adm:port'),
            Markup.button.callback('❓ FAQ', 'adm:faqs'),
        ],
        [Markup.button.callback('← Bosh menyu', 'adm:home')],
    ]);
}

const SET_KEYS = {
    cardNumber: '💳 Karta raqami',
    telegram: '💬 Telegram kontakt',
    phone: '📱 Telefon',
    channel: '📢 Kanal (kontakt)',
};

function settingsKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('💳 Karta raqami', 'adm:set:cardNumber')],
        [
            Markup.button.callback('💬 Telegram', 'adm:set:telegram'),
            Markup.button.callback('📱 Telefon', 'adm:set:phone'),
        ],
        [Markup.button.callback('📢 Kanal (kontakt)', 'adm:set:channel')],
        [Markup.button.callback('🔒 Majburiy kanallar', 'adm:channels')],
        [Markup.button.callback('⬅️ Orqaga', 'adm:back')],
    ]);
}

/* ===== Narxlar bo'limi formatlari ===== */
const PRICE_CATS = {
    stars: {
        label: '⭐ Stars paketlari',
        help: 'Har qatorda: <code>yulduz narx</code>\nMasalan:\n<code>50 13000\n100 25000\n250 60000</code>',
    },
    premium: {
        label: '👑 Premium tariflari',
        help: 'Har qatorda: <code>oy narx</code>\nMasalan:\n<code>3 165000\n6 225000\n12 400000</code>',
    },
    gifts: {
        label: '🎁 Sovg‘alar',
        help: 'Har qatorda: <code>nom | narx</code>\nMasalan:\n<code>🧸 Ayiqcha | 20000\n🌹 Atirgul | 30000</code>',
    },
    services: {
        label: '🔧 Xizmat narxlari',
        help: 'Har qatorda: <code>kalit | narx matni</code>\nKalitlar: frontend, design, backend, mobile, uiux, smm\nMasalan:\n<code>frontend | 1 500 000 so‘m\nsmm | 1 000 000 so‘m/oy</code>',
    },
};

function parsePrices(cat, text, settings) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;

    if (cat === 'stars' || cat === 'premium') {
        const items = [];
        for (const line of lines) {
            const m = line.match(/^(\d+)\s+([\d\s]+)$/);
            if (!m) return null;
            const num = Number(m[1]);
            const price = Number(m[2].replace(/\s/g, ''));
            if (!num || !price) return null;
            items.push(cat === 'stars' ? { stars: num, price } : { months: num, price });
        }
        return cat === 'stars' ? { starsPackages: items } : { premiumPlans: items };
    }

    if (cat === 'gifts') {
        const items = [];
        for (const line of lines) {
            const [name, priceRaw] = line.split('|').map((x) => x.trim());
            const price = Number((priceRaw || '').replace(/\s/g, ''));
            if (!name || !price) return null;
            items.push({ name, price });
        }
        return { gifts: items };
    }

    if (cat === 'services') {
        const servicePrices = Object.assign({}, settings.servicePrices);
        for (const line of lines) {
            const [key, value] = line.split('|').map((x) => x.trim());
            if (!key || !value || servicePrices[key] === undefined) return null;
            servicePrices[key] = value;
        }
        return { servicePrices };
    }
    return null;
}

const SEG_LABELS = { all: '🌍 Hammaga', uz: '🇺🇿 O‘zbekcha', ru: '🇷🇺 Ruscha', en: '🇬🇧 Inglizcha' };

async function targetUsers(seg) {
    const users = await db.getUsers();
    return users.filter((u) => !u.blocked && (seg === 'all' || u.lang === seg));
}

function registerAdmin(bot, sendMainMenu) {
    bot.command('admin', async(ctx) => {
        if (!isAdmin(ctx)) return;
        state.clear(ctx.from.id);
        await ctx.reply(await panelText(), { parse_mode: 'HTML', ...panelKeyboard() });
    });

    bot.action('adm:back', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.clear(ctx.from.id);
        const text = await panelText();
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...panelKeyboard() })
            .catch(async() => ctx.reply(text, { parse_mode: 'HTML', ...panelKeyboard() }));
    });

    bot.action('adm:home', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.clear(ctx.from.id);
        await sendMainMenu(ctx, 'uz');
    });

    /* ===== Buyurtmalar ===== */
    bot.action('adm:orders', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const orders = await db.getOrders();
        if (!orders.length) return ctx.reply('📭 Buyurtmalar yo‘q.');
        const rows = orders.slice(-15).reverse().map((o) => [
            Markup.button.callback(
                stLabel(o.status).slice(0, 2) + ' #' + o.id + ' — ' + svcLabel(o.service),
                'adm:ordview:' + o.id
            ),
        ]);
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:back')]);
        await ctx.reply('📦 Buyurtmalar (oxirgi 15):', Markup.inlineKeyboard(rows));
    });

    bot.action(/^adm:ordview:(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const orders = await db.getOrders();
        const o = orders.find((x) => x.id === ctx.match[1]);
        if (!o) return ctx.reply('❌ Topilmadi.');
        await ctx.reply(
            '📦 <b>Buyurtma</b> <code>#' + o.id + '</code>\n\n' +
            '🔧 ' + svcLabel(o.service) + '\n' +
            '👤 ' + (o.username ? '@' + o.username : o.userId) + ' (<code>' + o.userId + '</code>)\n' +
            '📝 ' + o.description + '\n' +
            '💰 ' + o.budget + '\n⏳ ' + o.deadline + '\n📞 ' + o.phone + '\n' +
            '📌 Holat: ' + stLabel(o.status) +
            (o.rating ? '\n⭐ Baho: ' + '⭐'.repeat(o.rating) : ''), {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Qabul', 'adm:ord:accepted:' + o.id),
                        Markup.button.callback('⚙️ Jarayonda', 'adm:ord:in_progress:' + o.id),
                    ],
                    [
                        Markup.button.callback('🎉 Bajarildi', 'adm:ord:done:' + o.id),
                        Markup.button.callback('❌ Rad etish', 'adm:ord:rejected:' + o.id),
                    ],
                ]),
            }
        );
    });

    bot.action(/^adm:ord:(accepted|in_progress|done|rejected):(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const [, status, id] = ctx.match;
        const order = await db.setOrderStatus(id, status);
        if (!order) return ctx.answerCbQuery('❌ Topilmadi');
        await ctx.answerCbQuery('✅ ' + stLabel(status));
        const user = await db.getUser(order.userId);
        const lang = (user && user.lang) || 'uz';
        await ctx.telegram.sendMessage(
            order.userId,
            '📦 #' + order.id + ' — ' + t(lang, 'menu_' + order.service) + '\n' +
            '📌 ' + t(lang, 'status_' + status)
        ).catch(() => {});
        // Bajarilganda baho so'raymiz
        if (status === 'done') {
            await ctx.telegram.sendMessage(order.userId, t(lang, 'rate_ask'), ratingKeyboard(order.id))
                .catch(() => {});
        }
    });

    /* ===== To'lovlar ===== */
    bot.action('adm:pays', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const pays = await db.getPayments();
        if (!pays.length) return ctx.reply('📭 To‘lovlar yo‘q.');
        const lines = pays.slice(-20).reverse().map((p) =>
            stLabel(p.status).slice(0, 2) + ' ' + p.item + ' — ' + fmt(p.amount) +
            ' so‘m | <code>' + p.userId + '</code>'
        );
        const totalApproved = pays.filter((p) => p.status === 'approved')
            .reduce((sum, p) => sum + Number(p.amount), 0);
        await ctx.reply(
            '💰 <b>To‘lovlar</b> (oxirgi 20)\n' +
            '💵 Jami tasdiqlangan: ' + fmt(totalApproved) + ' so‘m\n\n' + lines.join('\n'), { parse_mode: 'HTML' }
        );
    });

    /* ===== Foydalanuvchilar ===== */
    bot.action('adm:users', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const users = await db.getUsers();
        const lines = users.slice(-30).map((u) =>
            '👤 <code>' + u.id + '</code> ' + (u.username ? '@' + u.username : u.firstName) +
            ' | ' + (u.lang || '—') + ' | ref: ' + (u.referrals || 0) +
            (u.blocked ? ' | 🚫' : '')
        );
        await ctx.reply(
            '👥 <b>Foydalanuvchilar</b> (oxirgi 30 / jami ' + users.length + ')\n\n' +
            (lines.join('\n') || 'Bo‘sh'), { parse_mode: 'HTML' }
        );
    });

    /* ===== Statistika ===== */
    bot.action('adm:stats', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const [users, orders, pays] = await Promise.all([db.getUsers(), db.getOrders(), db.getPayments()]);
        const byStatus = (st) => orders.filter((o) => o.status === st).length;
        const totalApproved = pays.filter((p) => p.status === 'approved')
            .reduce((sum, p) => sum + Number(p.amount), 0);
        const rated = orders.filter((o) => o.rating);
        const avgRating = rated.length
            ? (rated.reduce((s, o) => s + o.rating, 0) / rated.length).toFixed(1) + ' (' + rated.length + ' baho)'
            : '—';
        await ctx.reply(
            '📊 <b>Statistika</b>\n\n' +
            '👥 Foydalanuvchilar: ' + users.length +
            ' (🚫 bloklagan: ' + users.filter((u) => u.blocked).length + ')\n' +
            '🔗 Referal orqali: ' + users.filter((u) => u.referredBy).length + '\n\n' +
            '📦 Buyurtmalar: ' + orders.length + '\n' +
            '  🆕 Yangi: ' + byStatus('new') +
            ' | ⚙️ Jarayonda: ' + byStatus('in_progress') +
            ' | 🎉 Bajarildi: ' + byStatus('done') + '\n' +
            '⭐ O‘rtacha baho: ' + avgRating + '\n\n' +
            '💰 To‘lovlar: ' + pays.length + ' ta\n' +
            '💵 Jami daromad: ' + fmt(totalApproved) + ' so‘m', { parse_mode: 'HTML' }
        );
    });

    /* ===== Sozlamalar ===== */
    bot.action('adm:settings', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        await ctx.reply(
            '⚙️ <b>Sozlamalar</b>\n\n' +
            '💳 Karta: ' + s.cardNumber + '\n' +
            '💬 Telegram: ' + s.contact.telegram + '\n' +
            '📱 Telefon: ' + s.contact.phone + '\n' +
            '📢 Kontakt kanal: ' + s.contact.channel + '\n' +
            '🔒 Majburiy kanallar: ' + ((s.channels || []).map((c) => c.username).join(', ') || 'yo‘q') + '\n\n' +
            '💡 Bot xabarlari va narxlar alohida bo‘limlarda (/admin).', { parse_mode: 'HTML', ...settingsKeyboard() }
        );
    });

    bot.action(/^adm:set:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        if (!SET_KEYS[key]) return;
        state.set(ctx.from.id, { action: 'admin:set', key });
        await ctx.reply('✏️ Yangi qiymatni kiriting (' + SET_KEYS[key] + '):');
    });

    /* ===== Majburiy kanallar boshqaruvi ===== */
    bot.action('adm:channels', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        const channels = s.channels || [];
        const rows = channels.map((c) => [
            Markup.button.callback('❌ ' + (c.title || c.username), 'adm:delch:' + c.username),
        ]);
        rows.push([Markup.button.callback('➕ Kanal qo‘shish', 'adm:addch')]);
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:back')]);
        await ctx.reply(
            '🔒 <b>Majburiy kanallar</b>\n\n' +
            (channels.map((c) => '• ' + (c.title || '') + ' (' + c.username + ')').join('\n') || 'Bo‘sh') +
            '\n\n⚠️ Bot har bir kanalda ADMIN bo‘lishi shart!\n' +
            'O‘chirish uchun kanalni bosing:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    });

    // Username bo'yicha o'chirish (indeks bo'yicha emas — eski tugma xato kanalni o'chirardi)
    bot.action(/^adm:delch:(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const username = ctx.match[1];
        const s = await db.getSettings();
        const channels = (s.channels || []).filter((c) => c.username !== username);
        await db.updateSettings({ channels });
        await ctx.answerCbQuery('✅ O‘chirildi: ' + username);
        await ctx.deleteMessage().catch(() => {});
    });

    bot.action('adm:addch', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'admin:addchannel' });
        await ctx.reply(
            '➕ Kanal qo‘shish.\n\nFormat: <code>@username | Kanal nomi</code>\n' +
            'Masalan: <code>@MONTRAX_kanal | MONTRAX Kanal</code>\n\n' +
            'Faqat @username yozsangiz ham bo‘ladi.', { parse_mode: 'HTML' }
        );
    });

    /* ===== ✉️ Bot xabarlari (barcha tahrirlanadigan xabarlar) ===== */
    bot.action('adm:tpls', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const rows = [];
        for (const [key, def] of Object.entries(TEMPLATES)) {
            const set = await getTpl(key);
            rows.push([Markup.button.callback((set ? '✅ ' : '▫️ ') + def.label, 'adm:tpl:' + key)]);
        }
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:back')]);
        await ctx.reply(
            '✉️ <b>Bot xabarlari</b>\n\n' +
            'Istalgan xabarni o‘zingiznikiga almashtiring — matn, rasm yoki video.\n' +
            '💎 <b>Premium emojilar to‘liq ishlaydi</b>: xabaringiz userlarga FORWARD ' +
            'sifatida boradi, shuning uchun emojilar harakatli saqlanadi.\n\n' +
            '✅ — o‘zgartirilgan, ▫️ — default holatda:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    });

    bot.action(/^adm:tpl:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        const def = TEMPLATES[key];
        if (!def) return;
        const set = await getTpl(key);
        const rows = [[Markup.button.callback('✏️ Yangi xabar yuborish', 'adm:tplset:' + key)]];
        if (set) {
            rows.push([Markup.button.callback('👁 Hozirgisini ko‘rish', 'adm:tplview:' + key)]);
            rows.push([Markup.button.callback('🗑 Default holatga qaytarish', 'adm:tpldel:' + key)]);
        }
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:tpls')]);
        await ctx.reply(
            def.label + '\n\nHolat: ' + (set ? '✅ o‘zgartirilgan' : '▫️ default') +
            (def.dynamic ?
                '\n\nℹ️ Bu xabarda dinamik ma‘lumot bor (narx/havola/raqam) — sizning xabaringiz ' +
                'YUQORIDA banner sifatida chiqadi, ostidan esa kerakli ma‘lumot avtomatik keladi.' :
                '\n\nℹ️ Sizning xabaringiz default matn O‘RNIDA to‘liq chiqadi.'),
            Markup.inlineKeyboard(rows)
        );
    });

    bot.action(/^adm:tplset:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        if (!TEMPLATES[key]) return;
        state.set(ctx.from.id, { action: 'admin:setmsg', kind: key });
        await ctx.reply(
            '✏️ <b>' + TEMPLATES[key].label + '</b>\n\n' +
            'Xabaringizni shu yerga yuboring — matn, rasm yoki video bo‘lishi mumkin.\n' +
            '💎 <b>Premium emojilarni bemalol ishlating</b> — xabar userlarga ' +
            'FORWARD sifatida boradi, emojilar harakatli saqlanadi.\n' +
            '💡 Maslahat: xabarni avval kanalingizga joylab, kanaldan botga forward qiling — ' +
            'userlarga «Forwarded from MONTRAX Kanal» deb brendli ko‘rinadi.\n\n' +
            '⚠️ Muhim: yuborgan xabaringizni bu chatdan O‘CHIRMANG — bot uni forward qilib ishlatadi.\n' +
            'Default holatga qaytarish uchun: <code>default</code> deb yozing.', { parse_mode: 'HTML' }
        );
    });

    bot.action(/^adm:tplview:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const tpl = await getTpl(ctx.match[1]);
        if (!tpl) return ctx.reply('▫️ Bu xabar default holatda.');
        await ctx.telegram.forwardMessage(ctx.chat.id, tpl.chatId, tpl.messageId)
            .catch(() => ctx.reply('❌ Asl xabar topilmadi (o‘chirilgan bo‘lishi mumkin). Yangisini yuboring.'));
    });

    bot.action(/^adm:tpldel:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const key = ctx.match[1];
        await setTpl(key, null);
        await ctx.answerCbQuery('✅ Default holatga qaytarildi');
        await ctx.deleteMessage().catch(() => {});
    });

    /* ===== 💵 Narxlar ===== */
    bot.action('adm:prices', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const rows = Object.entries(PRICE_CATS).map(([key, c]) => [
            Markup.button.callback(c.label, 'adm:price:' + key),
        ]);
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:back')]);
        await ctx.reply('💵 <b>Narxlar</b>\n\nQaysi bo‘limni tahrirlaysiz?', {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(rows),
        });
    });

    bot.action(/^adm:price:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const cat = ctx.match[1];
        const conf = PRICE_CATS[cat];
        if (!conf) return;
        const s = await db.getSettings();
        let current = '';
        if (cat === 'stars') current = s.starsPackages.map((p) => p.stars + ' ' + p.price).join('\n');
        if (cat === 'premium') current = s.premiumPlans.map((p) => p.months + ' ' + p.price).join('\n');
        if (cat === 'gifts') current = s.gifts.map((g) => g.name + ' | ' + g.price).join('\n');
        if (cat === 'services') current = Object.entries(s.servicePrices).map(([k, v]) => k + ' | ' + v).join('\n');
        state.set(ctx.from.id, { action: 'admin:price', cat });
        await ctx.reply(
            conf.label + '\n\n📋 Hozirgi:\n<code>' + current + '</code>\n\n' +
            '✏️ Yangi ro‘yxatni to‘liq yuboring.\n' + conf.help, { parse_mode: 'HTML' }
        );
    });

    /* ===== 🖼 Portfolio boshqaruvi ===== */
    bot.action('adm:port', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        const items = s.portfolio || [];
        const rows = items.map((p, i) => [
            Markup.button.callback('❌ ' + (p.title || 'Ish #' + (i + 1)), 'adm:portdel:' + p.messageId),
        ]);
        rows.push([Markup.button.callback('➕ Ish qo‘shish', 'adm:portadd')]);
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:back')]);
        await ctx.reply(
            '🖼 <b>Portfolio</b> (' + items.length + ' ta ish)\n\n' +
            'Userlar "Ishlarimiz" tugmasini bosganda shu postlar forward qilinadi.\n' +
            'O‘chirish uchun ishni bosing:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    });

    bot.action(/^adm:portdel:(\d+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const msgId = Number(ctx.match[1]);
        const s = await db.getSettings();
        const portfolio = (s.portfolio || []).filter((p) => p.messageId !== msgId);
        await db.updateSettings({ portfolio });
        await ctx.answerCbQuery('✅ O‘chirildi');
        await ctx.deleteMessage().catch(() => {});
    });

    bot.action('adm:portadd', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'admin:addport' });
        await ctx.reply(
            '➕ Portfolio ishi qo‘shish.\n\n' +
            'Ish namunasini yuboring — rasm, video yoki matn.\n' +
            '💡 Kanalingizdagi tayyor postni forward qilsangiz ham bo‘ladi.\n' +
            '⚠️ Yuborgan xabarni bu chatdan o‘chirmang.'
        );
    });

    /* ===== ❓ FAQ boshqaruvi ===== */
    bot.action('adm:faqs', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        const faq = s.faq || [];
        const rows = faq.map((f, i) => [
            Markup.button.callback('❌ ' + f.q.slice(0, 40), 'adm:faqdel:' + i),
        ]);
        rows.push([Markup.button.callback('➕ Savol qo‘shish', 'adm:faqadd')]);
        rows.push([Markup.button.callback('⬅️ Orqaga', 'adm:back')]);
        await ctx.reply(
            '❓ <b>FAQ</b> (' + faq.length + ' ta savol)\n\n' +
            (faq.map((f, i) => (i + 1) + '. ' + f.q).join('\n') || 'Bo‘sh') +
            '\n\nO‘chirish uchun savolni bosing:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    });

    bot.action(/^adm:faqdel:(\d+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const i = Number(ctx.match[1]);
        const s = await db.getSettings();
        const faq = (s.faq || []).filter((_, idx) => idx !== i);
        await db.updateSettings({ faq });
        await ctx.answerCbQuery('✅ O‘chirildi');
        await ctx.deleteMessage().catch(() => {});
    });

    bot.action('adm:faqadd', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'admin:addfaq' });
        await ctx.reply(
            '➕ Savol qo‘shish.\n\nFormat: <code>Savol | Javob</code>\n' +
            'Masalan: <code>Sayt qancha vaqtda tayyor bo‘ladi? | Oddiy landing 3-7 kun, murakkab loyihalar 2-4 hafta.</code>', { parse_mode: 'HTML' }
        );
    });

    /* ===== 📣 Broadcast (segment + preview bilan) ===== */
    bot.action('adm:broadcast', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const users = await db.getUsers();
        const active = users.filter((u) => !u.blocked);
        const byLang = (l) => active.filter((u) => u.lang === l).length;
        await ctx.reply(
            '📣 <b>Broadcast</b>\n\nKimga yuboramiz?\n\n' +
            '🌍 Hammaga: ' + active.length + ' ta\n' +
            '🇺🇿: ' + byLang('uz') + ' | 🇷🇺: ' + byLang('ru') + ' | 🇬🇧: ' + byLang('en'), {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🌍 Hammaga', 'adm:bcseg:all')],
                    [
                        Markup.button.callback('🇺🇿', 'adm:bcseg:uz'),
                        Markup.button.callback('🇷🇺', 'adm:bcseg:ru'),
                        Markup.button.callback('🇬🇧', 'adm:bcseg:en'),
                    ],
                    [Markup.button.callback('⬅️ Orqaga', 'adm:back')],
                ]),
            }
        );
    });

    bot.action(/^adm:bcseg:(all|uz|ru|en)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const seg = ctx.match[1];
        state.set(ctx.from.id, { action: 'admin:broadcast', seg });
        await ctx.reply(
            '📣 ' + SEG_LABELS[seg] + ' uchun xabarni yuboring (matn/rasm/video).\n' +
            '💎 Premium emojili xabarni kanaldan FORWARD qilsangiz — emojilar userlarda ham harakatli ko‘rinadi.'
        );
    });

    // Tasdiqlash tugmalari
    bot.action('adm:bcgo', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const s = state.get(ctx.from.id);
        if (!s || s.action !== 'admin:bcconfirm') return ctx.answerCbQuery('❌ Eskirgan');
        await ctx.answerCbQuery('🚀 Boshlandi');
        await ctx.editMessageReplyMarkup().catch(() => {});
        await doBroadcast(ctx, s);
    });

    bot.action('adm:bcno', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        state.clear(ctx.from.id);
        await ctx.answerCbQuery('❌ Bekor qilindi');
        await ctx.editMessageText('❌ Broadcast bekor qilindi.').catch(() => {});
    });
}

/* ===== Matnli flow'lar ===== */
async function handleText(ctx, s) {
    const text = ctx.message.text ? ctx.message.text.trim() : '';

    if (s.action === 'admin:set') {
        if (s.key === 'cardNumber') {
            await db.updateSettings({ cardNumber: text });
        } else {
            const settings = await db.getSettings();
            settings.contact[s.key] = text;
            await db.updateSettings({ contact: settings.contact });
        }
        state.clear(ctx.from.id);
        return ctx.reply('✅ Saqlandi: ' + text);
    }

    if (s.action === 'admin:addchannel') {
        const [rawUser, rawTitle] = text.split('|').map((x) => x.trim());
        let username = rawUser || '';
        if (!username.startsWith('@')) username = '@' + username;
        const settings = await db.getSettings();
        const channels = (settings.channels || []).filter((c) => c.username !== username);
        channels.push({ username, title: rawTitle || username });
        await db.updateSettings({ channels });
        state.clear(ctx.from.id);
        return ctx.reply(
            '✅ Kanal qo‘shildi: ' + username +
            '\n\n⚠️ Botni shu kanalga ADMIN qilib qo‘shishni unutmang!'
        );
    }

    if (s.action === 'admin:setmsg') {
        if (text.toLowerCase() === 'default') {
            await setTpl(s.kind, null);
            state.clear(ctx.from.id);
            return ctx.reply('✅ Default xabarga qaytarildi.');
        }
        return captureMessage(ctx, s);
    }

    if (s.action === 'admin:price') {
        const settings = await db.getSettings();
        const patch = parsePrices(s.cat, text, settings);
        if (!patch) {
            return ctx.reply('❌ Format noto‘g‘ri. Ko‘rsatilgan namunaga qarab qayta yuboring.');
        }
        await db.updateSettings(patch);
        state.clear(ctx.from.id);
        return ctx.reply('✅ Narxlar yangilandi (' + PRICE_CATS[s.cat].label + ').');
    }

    if (s.action === 'admin:addfaq') {
        const [q, a] = text.split('|').map((x) => x.trim());
        if (!q || !a) return ctx.reply('❌ Format: Savol | Javob');
        const settings = await db.getSettings();
        const faq = (settings.faq || []).concat([{ q, a }]);
        await db.updateSettings({ faq });
        state.clear(ctx.from.id);
        return ctx.reply('✅ Savol qo‘shildi. Jami: ' + faq.length + ' ta');
    }

    if (s.action === 'admin:addport') return capturePortfolio(ctx);

    if (s.action === 'admin:broadcast') return previewBroadcast(ctx, s);
}

/* Admin yuborgan xabarni mockup sifatida saqlash (forward uchun) */
async function captureMessage(ctx, s) {
    const ref = { chatId: ctx.chat.id, messageId: ctx.message.message_id };
    await setTpl(s.kind, ref);
    state.clear(ctx.from.id);
    await ctx.reply(
        '✅ Saqlandi! Quyida foydalanuvchi ko‘radigan ko‘rinish ' +
        '(forward sifatida boradi — premium emojilar harakatli saqlanadi):'
    );
    await ctx.telegram.forwardMessage(ctx.chat.id, ref.chatId, ref.messageId).catch(() => {});
}

/* Portfolio ishi qo'shish */
async function capturePortfolio(ctx) {
    const settings = await db.getSettings();
    const title =
        (ctx.message.caption || ctx.message.text || '').split('\n')[0].slice(0, 40) ||
        'Ish #' + ((settings.portfolio || []).length + 1);
    const portfolio = (settings.portfolio || []).concat([{
        chatId: ctx.chat.id,
        messageId: ctx.message.message_id,
        title,
    }]);
    await db.updateSettings({ portfolio });
    state.clear(ctx.from.id);
    await ctx.reply('✅ Portfolioga qo‘shildi: ' + title + '\nJami: ' + portfolio.length + ' ta ish');
}

/* Broadcast preview: userlar ko'radigan ko'rinishda ko'rsatib, tasdiqlash so'raymiz */
async function previewBroadcast(ctx, s) {
    const ref = { chatId: ctx.chat.id, messageId: ctx.message.message_id };
    // Kanaldan forward qilingan xabar — forward rejimida yuboriladi
    // (premium emojilar harakatli qoladi va manba kanal ko'rinadi)
    const useForward = Boolean(ctx.message.forward_origin);
    const users = await targetUsers(s.seg);
    state.set(ctx.from.id, { action: 'admin:bcconfirm', seg: s.seg, ref, useForward });

    if (useForward) {
        await ctx.telegram.forwardMessage(ctx.chat.id, ref.chatId, ref.messageId).catch(() => {});
    } else {
        await ctx.telegram.copyMessage(ctx.chat.id, ref.chatId, ref.messageId).catch(() => {});
    }
    await ctx.reply(
        '👆 Xabar userlarga shunday ko‘rinadi.\n\n' +
        '🎯 Qabul qiluvchilar: ' + users.length + ' ta (' + SEG_LABELS[s.seg] + ')\n' +
        '📤 Rejim: ' + (useForward ? 'forward 💎 (premium emoji saqlanadi)' : 'copy'),
        Markup.inlineKeyboard([[
            Markup.button.callback('✅ Yuborish', 'adm:bcgo'),
            Markup.button.callback('❌ Bekor', 'adm:bcno'),
        ]])
    );
}

/* Broadcast yuborish: bloklagan userlar o'tkazib yuboriladi, 403 lar belgilanadi */
async function doBroadcast(ctx, s) {
    state.clear(ctx.from.id);
    const users = await targetUsers(s.seg);
    const statusMsg = await ctx.reply('⏳ Yuborilmoqda... (0/' + users.length + ')');

    let ok = 0, fail = 0;
    const blockedIds = [];
    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        try {
            if (s.useForward) {
                await ctx.telegram.forwardMessage(u.id, s.ref.chatId, s.ref.messageId);
            } else {
                await ctx.telegram.copyMessage(u.id, s.ref.chatId, s.ref.messageId);
            }
            ok++;
        } catch (err) {
            fail++;
            const code = err.response && err.response.error_code;
            if (code === 403) blockedIds.push(u.id); // botni bloklagan
        }
        if ((i + 1) % 25 === 0) {
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsg.message_id, null,
                '⏳ Yuborilmoqda... (' + (i + 1) + '/' + users.length + ')'
            ).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 50));
    }

    await db.markBlocked(blockedIds);
    await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        '📣 Tugadi!\n✅ Yuborildi: ' + ok + '\n❌ Xato: ' + fail +
        (blockedIds.length ? '\n🚫 Botni bloklaganlar: ' + blockedIds.length + ' (ro‘yxatdan chetlashtirildi)' : '')
    ).catch(() => {});
}

/* Media (rasm/video/stiker) — mockup, portfolio yoki broadcast */
async function handleMedia(ctx, s) {
    if (s.action === 'admin:setmsg') return captureMessage(ctx, s);
    if (s.action === 'admin:addport') return capturePortfolio(ctx);
    if (s.action === 'admin:broadcast') return previewBroadcast(ctx, s);
}

/* Kunlik hisobot (har kuni 21:00 da yuboriladi) */
async function sendDailyReport(telegram) {
    const [users, orders, pays] = await Promise.all([db.getUsers(), db.getOrders(), db.getPayments()]);
    const today = new Date().toISOString().slice(0, 10);
    const tUsers = users.filter((u) => (u.joinedAt || '').startsWith(today)).length;
    const tOrders = orders.filter((o) => (o.createdAt || '').startsWith(today)).length;
    const tPays = pays.filter((p) => (p.createdAt || '').startsWith(today));
    const tRevenue = tPays.filter((p) => p.status === 'approved')
        .reduce((sum, p) => sum + Number(p.amount), 0);
    const msg =
        '🌙 <b>KUNLIK HISOBOT</b> — ' + today + '\n\n' +
        '👥 Yangi userlar: +' + tUsers + '\n' +
        '📦 Yangi buyurtmalar: +' + tOrders + '\n' +
        '💸 To‘lovlar: ' + tPays.length + ' ta\n' +
        '💵 Bugungi tasdiqlangan daromad: ' + fmt(tRevenue) + ' so‘m\n\n' +
        '📊 Jami: ' + users.length + ' user, ' + orders.length + ' buyurtma';
    for (const adminId of ADMIN_IDS) {
        await telegram.sendMessage(adminId, msg, { parse_mode: 'HTML' }).catch(() => {});
    }
}

module.exports = { registerAdmin, handleText, handleMedia, isAdmin, sendDailyReport };
