// Tahrirlanadigan bot xabarlari tizimi.
// Admin istalgan xabar uchun "mockup" saqlaydi (matn/rasm/video, premium emoji bilan).
// Userga yuborishda mockup FORWARD qilinadi — premium emojilar harakatli saqlanadi
// (copyMessage'da Telegram ularni oddiy emojiga almashtirib yuboradi, forward'da yo'q).
const db = require('./db');

// dynamic: true  — mockup'dan keyin dinamik ma'lumotli default matn HAM yuboriladi
//                  (masalan karta raqami, referal havola — bularsiz bo'lmaydi)
// dynamic: false — mockup default matn O'RNINI bosadi (tugmalar alohida xabarda keladi)
const TEMPLATES = {
    welcome: { label: "👋 Xush kelibsiz xabari", dynamic: false },
    sub: { label: "⚠️ Majburiy obuna xabari", dynamic: true },
    stars: { label: "⭐ Yulduzlar sahifasi", dynamic: false },
    premium: { label: "👑 Premium sahifasi", dynamic: false },
    gift: { label: "🎁 Sovg'a sahifasi", dynamic: true },
    pay: { label: "💳 To'lov xabari (karta)", dynamic: true },
    contact: { label: "📞 Bog'lanish sahifasi", dynamic: false },
    referral: { label: "👥 Referal sahifasi", dynamic: true },
    ai_intro: { label: "🤖 AI kirish xabari", dynamic: true },
    order_done: { label: "✅ Buyurtma qabul qilindi", dynamic: true },
    pay_approved: { label: "🎉 To'lov tasdiqlandi", dynamic: true },
};

async function getTpl(key) {
    const s = await db.getSettings();
    const tpl = (s.templates || {})[key];
    if (tpl && tpl.chatId && tpl.messageId) return tpl;
    // Eski format bilan moslik (welcomeMsg/subMsg)
    if (key === 'welcome' && s.welcomeMsg && s.welcomeMsg.chatId) return s.welcomeMsg;
    if (key === 'sub' && s.subMsg && s.subMsg.chatId) return s.subMsg;
    return null;
}

async function setTpl(key, ref) {
    const s = await db.getSettings();
    const templates = Object.assign({}, s.templates);
    if (ref) templates[key] = ref;
    else delete templates[key];
    const patch = { templates };
    // Eski maydonlarni ham sinxron ushlab turamiz
    if (key === 'welcome') patch.welcomeMsg = ref || null;
    if (key === 'sub') patch.subMsg = ref || null;
    return db.updateSettings(patch);
}

// Mockup bo'lsa forward qiladi; muvaffaqiyatli bo'lsa true qaytaradi
async function forwardTpl(telegram, chatId, key) {
    const tpl = await getTpl(key);
    if (!tpl) return false;
    try {
        await telegram.forwardMessage(chatId, tpl.chatId, tpl.messageId);
        return true;
    } catch (err) {
        console.error('Template forward xato (' + key + '):', err.message);
        return false;
    }
}

// Universal yuborish:
//  - mockup yo'q                -> default matn (extra bilan)
//  - mockup bor + dynamic       -> forward + default matn ham
//  - mockup bor + static        -> forward + (tugmalar bo'lsa followText bilan alohida xabar)
async function sendTplTo(telegram, chatId, key, defaultText, extra = {}) {
    const def = TEMPLATES[key] || { dynamic: true };
    const { followText, ...opts } = extra;
    const forwarded = await forwardTpl(telegram, chatId, key);
    if (!forwarded || def.dynamic) {
        return telegram.sendMessage(chatId, defaultText, opts);
    }
    if (opts.reply_markup) {
        return telegram.sendMessage(chatId, followText || '👇', { reply_markup: opts.reply_markup });
    }
}

const sendTpl = (ctx, key, defaultText, extra) =>
    sendTplTo(ctx.telegram, ctx.chat.id, key, defaultText, extra);

module.exports = { TEMPLATES, getTpl, setTpl, forwardTpl, sendTplTo, sendTpl };
