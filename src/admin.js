const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t } = require('./i18n');

const isAdmin = (ctx) => ctx.from && ctx.from.id === Number(process.env.ADMIN_ID);
const fmt = (n) => Number(n).toLocaleString('uz-UZ');

const STATUS_UZ = {
    new: '\ud83c\udd95 Yangi',
    accepted: '\u2705 Qabul qilindi',
    in_progress: '\u2699\ufe0f Jarayonda',
    done: '\ud83c\udf89 Bajarildi',
    rejected: '\u274c Rad etildi',
    pending: '\u23f3 Kutilmoqda',
    approved: '\u2705 Tasdiqlandi',
};

/* ===== Panel sarlavhasi: bugungi statistika bilan (rasmdagidek) ===== */
async function panelText() {
    const [users, orders] = await Promise.all([db.getUsers(), db.getOrders()]);
    const today = new Date().toISOString().slice(0, 10);
    const todayUsers = users.filter((u) => (u.joinedAt || '').startsWith(today)).length;
    const todayOrders = orders.filter((o) => (o.createdAt || '').startsWith(today)).length;
    const pending = orders.filter((o) => o.status === 'new').length;
    return (
        '\ud83d\udc51 <b>EGA ADMIN PANEL</b>\n\n' +
        '\ud83d\udcca Bugungi: +' + todayUsers + ' foydalanuvchi, +' + todayOrders + ' buyurtma\n' +
        '\ud83d\udce6 Kutilmoqda: ' + pending + ' buyurtma\n\n' +
        'Amalni tanlang'
    );
}

function panelKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('\ud83d\udcca Statistika', 'adm:stats'),
            Markup.button.callback('\ud83d\udc65 Foydalanuvchilar', 'adm:users'),
        ],
        [
            Markup.button.callback('\ud83d\udce6 Buyurtmalar', 'adm:orders'),
            Markup.button.callback('\ud83d\udcb0 To\u2018lovlar', 'adm:pays'),
        ],
        [
            Markup.button.callback('\ud83d\udce3 Broadcast', 'adm:broadcast'),
            Markup.button.callback('\u2699\ufe0f Sozlamalar', 'adm:settings'),
        ],
        [Markup.button.callback('\u2190 Bosh menyu', 'adm:home')],
    ]);
}

const SET_KEYS = {
    cardNumber: '\ud83d\udcb3 Karta raqami',
    telegram: '\ud83d\udcac Telegram kontakt',
    phone: '\ud83d\udcf1 Telefon',
    channel: '\ud83d\udce2 Kanal (kontakt)',
};

function settingsKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('\ud83d\udcb3 Karta raqami', 'adm:set:cardNumber')],
        [
            Markup.button.callback('\ud83d\udcac Telegram', 'adm:set:telegram'),
            Markup.button.callback('\ud83d\udcf1 Telefon', 'adm:set:phone'),
        ],
        [Markup.button.callback('\ud83d\udce2 Majburiy kanallar', 'adm:channels')],
        [Markup.button.callback('\ud83d\udc4b Xush kelibsiz xabari', 'adm:msg:welcome')],
        [Markup.button.callback('\u26a0\ufe0f Obuna xabari', 'adm:msg:sub')],
        [Markup.button.callback('\u2b05\ufe0f Orqaga', 'adm:back')],
    ]);
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
        if (!orders.length) return ctx.reply('\ud83d\udced Buyurtmalar yo\u2018q.');
        const rows = orders.slice(-15).reverse().map((o) => [
            Markup.button.callback(
                STATUS_UZ[o.status].slice(0, 2) + ' #' + o.id + ' \u2014 ' + t('uz', 'menu_' + o.service),
                'adm:ordview:' + o.id
            ),
        ]);
        rows.push([Markup.button.callback('\u2b05\ufe0f Orqaga', 'adm:back')]);
        await ctx.reply('\ud83d\udce6 Buyurtmalar (oxirgi 15):', Markup.inlineKeyboard(rows));
    });

    bot.action(/^adm:ordview:(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const orders = await db.getOrders();
        const o = orders.find((x) => x.id === ctx.match[1]);
        if (!o) return ctx.reply('\u274c Topilmadi.');
        await ctx.reply(
            '\ud83d\udce6 <b>Buyurtma</b> <code>#' + o.id + '</code>\n\n' +
            '\ud83d\udd27 ' + t('uz', 'menu_' + o.service) + '\n' +
            '\ud83d\udc64 ' + (o.username ? '@' + o.username : o.userId) + ' (<code>' + o.userId + '</code>)\n' +
            '\ud83d\udcdd ' + o.description + '\n' +
            '\ud83d\udcb0 ' + o.budget + '\n\u23f3 ' + o.deadline + '\n\ud83d\udcde ' + o.phone + '\n' +
            '\ud83d\udccc Holat: ' + STATUS_UZ[o.status], {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('\u2705 Qabul', 'adm:ord:accepted:' + o.id),
                        Markup.button.callback('\u2699\ufe0f Jarayonda', 'adm:ord:in_progress:' + o.id),
                    ],
                    [
                        Markup.button.callback('\ud83c\udf89 Bajarildi', 'adm:ord:done:' + o.id),
                        Markup.button.callback('\u274c Rad etish', 'adm:ord:rejected:' + o.id),
                    ],
                ]),
            }
        );
    });

    bot.action(/^adm:ord:(accepted|in_progress|done|rejected):(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const [, status, id] = ctx.match;
        const order = await db.setOrderStatus(id, status);
        if (!order) return ctx.answerCbQuery('\u274c Topilmadi');
        await ctx.answerCbQuery('\u2705 ' + STATUS_UZ[status]);
        const user = await db.getUser(order.userId);
        const lang = (user && user.lang) || 'uz';
        await ctx.telegram.sendMessage(
            order.userId,
            '\ud83d\udce6 #' + order.id + ' \u2014 ' + t(lang, 'menu_' + order.service) + '\n' +
            '\ud83d\udccc ' + t(lang, 'status_' + status)
        ).catch(() => {});
    });

    /* ===== To'lovlar ===== */
    bot.action('adm:pays', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const pays = await db.getPayments();
        if (!pays.length) return ctx.reply('\ud83d\udced To\u2018lovlar yo\u2018q.');
        const lines = pays.slice(-20).reverse().map((p) =>
            STATUS_UZ[p.status].slice(0, 2) + ' ' + p.item + ' \u2014 ' + fmt(p.amount) +
            ' so\u2018m | <code>' + p.userId + '</code>'
        );
        const totalApproved = pays.filter((p) => p.status === 'approved')
            .reduce((sum, p) => sum + Number(p.amount), 0);
        await ctx.reply(
            '\ud83d\udcb0 <b>To\u2018lovlar</b> (oxirgi 20)\n' +
            '\ud83d\udcb5 Jami tasdiqlangan: ' + fmt(totalApproved) + ' so\u2018m\n\n' + lines.join('\n'), { parse_mode: 'HTML' }
        );
    });

    /* ===== Foydalanuvchilar ===== */
    bot.action('adm:users', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const users = await db.getUsers();
        const lines = users.slice(-30).map((u) =>
            '\ud83d\udc64 <code>' + u.id + '</code> ' + (u.username ? '@' + u.username : u.firstName) +
            ' | ' + (u.lang || '\u2014') + ' | ref: ' + (u.referrals || 0)
        );
        await ctx.reply(
            '\ud83d\udc65 <b>Foydalanuvchilar</b> (oxirgi 30 / jami ' + users.length + ')\n\n' +
            (lines.join('\n') || 'Bo\u2018sh'), { parse_mode: 'HTML' }
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
        await ctx.reply(
            '\ud83d\udcca <b>Statistika</b>\n\n' +
            '\ud83d\udc65 Foydalanuvchilar: ' + users.length + '\n' +
            '\ud83d\udd17 Referal orqali: ' + users.filter((u) => u.referredBy).length + '\n\n' +
            '\ud83d\udce6 Buyurtmalar: ' + orders.length + '\n' +
            '  \ud83c\udd95 Yangi: ' + byStatus('new') +
            ' | \u2699\ufe0f Jarayonda: ' + byStatus('in_progress') +
            ' | \ud83c\udf89 Bajarildi: ' + byStatus('done') + '\n\n' +
            '\ud83d\udcb0 To\u2018lovlar: ' + pays.length + ' ta\n' +
            '\ud83d\udcb5 Jami daromad: ' + fmt(totalApproved) + ' so\u2018m', { parse_mode: 'HTML' }
        );
    });

    /* ===== Sozlamalar ===== */
    bot.action('adm:settings', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        await ctx.reply(
            '\u2699\ufe0f <b>Sozlamalar</b>\n\n' +
            '\ud83d\udcb3 Karta: ' + s.cardNumber + '\n' +
            '\ud83d\udcac Telegram: ' + s.contact.telegram + '\n' +
            '\ud83d\udcf1 Telefon: ' + s.contact.phone + '\n' +
            '\ud83d\udce2 Kanallar: ' + (s.channels || []).map((c) => c.username).join(', ') + '\n' +
            '\ud83d\udc4b Xush kelibsiz xabari: ' + (s.welcomeMsg ? '\u2705 o\u2018rnatilgan' : '\u274c yo\u2018q (default)') + '\n' +
            '\u26a0\ufe0f Obuna xabari: ' + (s.subMsg ? '\u2705 o\u2018rnatilgan' : '\u274c yo\u2018q (default)') + '\n\n' +
            '\u2139\ufe0f Narxlar data/settings.json faylida tahrirlanadi.', { parse_mode: 'HTML', ...settingsKeyboard() }
        );
    });

    bot.action(/^adm:set:(\w+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        if (!SET_KEYS[key]) return;
        state.set(ctx.from.id, { action: 'admin:set', key });
        await ctx.reply('\u270f\ufe0f Yangi qiymatni kiriting (' + SET_KEYS[key] + '):');
    });

    /* ===== Majburiy kanallar boshqaruvi ===== */
    bot.action('adm:channels', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        const channels = s.channels || [];
        const rows = channels.map((c, i) => [
            Markup.button.callback('\u274c ' + (c.title || c.username), 'adm:delch:' + i),
        ]);
        rows.push([Markup.button.callback('\u2795 Kanal qo\u2018shish', 'adm:addch')]);
        rows.push([Markup.button.callback('\u2b05\ufe0f Orqaga', 'adm:back')]);
        await ctx.reply(
            '\ud83d\udce2 <b>Majburiy kanallar</b>\n\n' +
            (channels.map((c) => '\u2022 ' + (c.title || '') + ' (' + c.username + ')').join('\n') || 'Bo\u2018sh') +
            '\n\n\u26a0\ufe0f Bot har bir kanalda ADMIN bo\u2018lishi shart!\n' +
            'O\u2018chirish uchun kanalni bosing:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    });

    bot.action(/^adm:delch:(\d+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const i = Number(ctx.match[1]);
        const s = await db.getSettings();
        const removed = (s.channels || []).splice(i, 1);
        await db.updateSettings({ channels: s.channels });
        await ctx.answerCbQuery('\u2705 O\u2018chirildi: ' + (removed[0] ? removed[0].username : ''));
        await ctx.deleteMessage().catch(() => {});
    });

    bot.action('adm:addch', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'admin:addchannel' });
        await ctx.reply(
            '\u2795 Kanal qo\u2018shish.\n\nFormat: <code>@username | Kanal nomi</code>\n' +
            'Masalan: <code>@MONTRAX_kanal | MONTRAX Kanal</code>\n\n' +
            'Faqat @username yozsangiz ham bo\u2018ladi.', { parse_mode: 'HTML' }
        );
    });

    /* ===== Xabar mockuplari (premium emoji bilan) ===== */
    bot.action(/^adm:msg:(welcome|sub)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const kind = ctx.match[1];
        state.set(ctx.from.id, { action: 'admin:setmsg', kind });
        await ctx.reply(
            (kind === 'welcome' ?
                '\ud83d\udc4b <b>Xush kelibsiz xabari</b>' :
                '\u26a0\ufe0f <b>Majburiy obuna xabari</b>') +
            '\n\nXabaringizni shu yerga yuboring \u2014 matn, rasm yoki video bo\u2018lishi mumkin.\n' +
            '\ud83d\udc8e <b>Premium emojilarni bemalol ishlating</b> \u2014 xabar userlarga ' +
            'FORWARD sifatida boradi, shuning uchun emojilar harakatli saqlanadi.\n' +
            '\ud83d\udca1 Maslahat: xabarni avval kanalingizga joylab, kanaldan botga forward qiling \u2014 ' +
            'userlarga \u00abForwarded from MONTRAX Kanal\u00bb deb brendli ko\u2018rinadi.\n\n' +
            '\u26a0\ufe0f Muhim: yuborgan xabaringizni bu chatdan O\u2018CHIRMANG \u2014 bot uni nusxalab ishlatadi.\n' +
            'Default holatga qaytarish uchun: <code>default</code> deb yozing.', { parse_mode: 'HTML' }
        );
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
        return ctx.reply('\u2705 Saqlandi: ' + text);
    }

    if (s.action === 'admin:addchannel') {
        const [rawUser, rawTitle] = text.split('|').map((x) => x.trim());
        let username = rawUser || '';
        if (!username.startsWith('@')) username = '@' + username;
        const settings = await db.getSettings();
        settings.channels = settings.channels || [];
        settings.channels.push({ username, title: rawTitle || username });
        await db.updateSettings({ channels: settings.channels });
        state.clear(ctx.from.id);
        return ctx.reply(
            '\u2705 Kanal qo\u2018shildi: ' + username +
            '\n\n\u26a0\ufe0f Botni shu kanalga ADMIN qilib qo\u2018shishni unutmang!'
        );
    }

    if (s.action === 'admin:setmsg') {
        if (text.toLowerCase() === 'default') {
            await db.updateSettings({
                [s.kind === 'welcome' ? 'welcomeMsg' : 'subMsg']: null });
            state.clear(ctx.from.id);
            return ctx.reply('\u2705 Default xabarga qaytarildi.');
        }
        return captureMessage(ctx, s);
    }

    if (s.action === 'admin:broadcast') return doBroadcast(ctx);
}

/* Admin yuborgan xabarni mockup sifatida saqlash (copyMessage uchun) */
async function captureMessage(ctx, s) {
    const ref = { chatId: ctx.chat.id, messageId: ctx.message.message_id };
    await db.updateSettings({
        [s.kind === 'welcome' ? 'welcomeMsg' : 'subMsg']: ref });
    state.clear(ctx.from.id);
    await ctx.reply(
        '\u2705 Saqlandi! Quyida foydalanuvchi ko\u2018radigan ko\u2018rinish ' +
        '(forward sifatida boradi \u2014 premium emojilar harakatli saqlanadi):'
    );
    // Preview — aynan userlar ko'radigan ko'rinishda (forward)
    await ctx.telegram.forwardMessage(ctx.chat.id, ref.chatId, ref.messageId).catch(() => {});
}

/* Broadcast: copyMessage — premium emojilar mijozlarga ham ko'rinadi */
async function doBroadcast(ctx) {
    state.clear(ctx.from.id);
    const users = await db.getUsers();
    // Agar admin xabarni biror joydan FORWARD qilgan bo'lsa — forward qilamiz:
    // premium emojilar harakatli qoladi va asl manba (masalan kanal) ko'rinadi.
    // Oddiy yozilgan xabar bo'lsa — copy (toza, "Forwarded" yorlig'isiz).
    const useForward = Boolean(ctx.message.forward_origin);
    await ctx.reply(
        '\u23f3 Yuborilmoqda... (' + users.length + ' user, rejim: ' +
        (useForward ? 'forward \ud83d\udc8e premium emoji saqlanadi' : 'copy') + ')'
    );
    let ok = 0,
        fail = 0;
    for (const u of users) {
        try {
            if (useForward) {
                await ctx.telegram.forwardMessage(u.id, ctx.chat.id, ctx.message.message_id);
            } else {
                await ctx.telegram.copyMessage(u.id, ctx.chat.id, ctx.message.message_id);
            }
            ok++;
        } catch { fail++; }
        await new Promise((r) => setTimeout(r, 50));
    }
    await ctx.reply('\ud83d\udce3 Tugadi!\n\u2705 Yuborildi: ' + ok + '\n\u274c Xato: ' + fail);
}

/* Media (rasm/video) — mockup saqlash yoki broadcast */
async function handleMedia(ctx, s) {
    if (s.action === 'admin:setmsg') return captureMessage(ctx, s);
    if (s.action === 'admin:broadcast') return doBroadcast(ctx);
}

module.exports = { registerAdmin, handleText, handleMedia, isAdmin };