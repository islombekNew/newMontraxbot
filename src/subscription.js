const { Markup } = require('telegraf');
const db = require('./db');
const { t } = require('./i18n');
const { ADMIN_IDS, isAdminId } = require('./config');
const { forwardTpl } = require('./templates');

const OK_STATUSES = ['creator', 'administrator', 'member'];

// Obuna natijasini keshlash: har update'da N ta getChatMember so'rovi
// Telegram rate-limit'iga uriladi. Ijobiy natija 3 daqiqa amal qiladi.
const CACHE_TTL = 3 * 60 * 1000;
const subCache = new Map(); // userId -> { ok, ts }

// Kanal tekshiruvi ishlamay qolsa adminga BIR marta xabar beramiz
const alerted = new Set();

async function isMember(telegram, username, userId) {
    try {
        const m = await telegram.getChatMember(username, userId);
        return OK_STATUSES.includes(m.status);
    } catch (err) {
        // Bot kanalda admin emas yoki username xato — userni bloklamaymiz
        console.error('getChatMember xato:', username, err.message);
        if (!alerted.has(username)) {
            alerted.add(username);
            for (const adminId of ADMIN_IDS) {
                telegram.sendMessage(
                    adminId,
                    '⚠️ Obuna tekshiruvi ishlamayapti: ' + username +
                    '\nSabab: ' + err.message +
                    '\n\nBotni shu kanalga ADMIN qilib qo‘shing yoki kanalni ro‘yxatdan o‘chiring (/admin → Sozlamalar → Majburiy kanallar).'
                ).catch(() => {});
            }
        }
        return true;
    }
}

// Barcha majburiy kanallarni tekshirish (fresh=true — keshni chetlab o'tish)
async function checkAll(telegram, userId, { fresh = false } = {}) {
    const settings = await db.getSettings();
    const channels = settings.channels || [];
    if (!channels.length) return { ok: true, notJoined: [], settings };

    if (!fresh) {
        const cached = subCache.get(userId);
        if (cached && cached.ok && Date.now() - cached.ts < CACHE_TTL) {
            return { ok: true, notJoined: [], settings };
        }
    }

    const results = await Promise.all(
        channels.map((c) => isMember(telegram, c.username, userId))
    );
    const notJoined = channels.filter((_, i) => !results[i]);
    const ok = notJoined.length === 0;
    subCache.set(userId, { ok, ts: Date.now() });
    return { ok, notJoined, settings };
}

function joinKeyboard(notJoined, lang) {
    const rows = notJoined.map((c) => [
        Markup.button.url('📢 ' + (c.title || c.username), 'https://t.me/' + c.username.replace('@', '')),
    ]);
    rows.push([Markup.button.callback(t(lang, 'sub_check_btn'), 'check_sub')]);
    return Markup.inlineKeyboard(rows);
}

// Obuna talab xabari: admin mockup saqlagan bo'lsa — FORWARD
// (premium emojilar harakatli saqlanadi), keyin tugmalar bilan default matn
async function showSubPrompt(ctx, lang, res) {
    const kb = joinKeyboard(res.notJoined, lang);
    await forwardTpl(ctx.telegram, ctx.chat.id, 'sub');
    await ctx.reply(t(lang, 'sub_required'), { parse_mode: 'HTML', ...kb });
}

function subscriptionMiddleware(getLang) {
    return async(ctx, next) => {
        if (!ctx.from || ctx.from.is_bot) return next();
        if (isAdminId(ctx.from.id)) return next();

        // Til tanlash va tekshirish tugmalari o'tib ketishi kerak
        if (ctx.callbackQuery) {
            const d = ctx.callbackQuery.data || '';
            if (d === 'check_sub' || d.startsWith('lang:')) return next();
        }

        const res = await checkAll(ctx.telegram, ctx.from.id);
        if (res.ok) return next();

        const lang = await getLang(ctx);
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        await showSubPrompt(ctx, lang, res);
    };
}

// "Tekshirish" tugmasi handleri
function registerSubscription(bot, getLang, afterSubscribed) {
    bot.action('check_sub', async(ctx) => {
        const res = await checkAll(ctx.telegram, ctx.from.id, { fresh: true });
        const lang = await getLang(ctx);
        if (!res.ok) {
            return ctx.answerCbQuery(t(lang, 'sub_not_yet'), { show_alert: true });
        }
        await ctx.answerCbQuery(t(lang, 'sub_ok'));
        await ctx.deleteMessage().catch(() => {});
        await afterSubscribed(ctx);
    });
}

module.exports = { subscriptionMiddleware, registerSubscription, checkAll };
