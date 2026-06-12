const { Markup } = require('telegraf');
const db = require('./db');
const { t } = require('./i18n');

const OK_STATUSES = ['creator', 'administrator', 'member'];

async function isMember(telegram, username, userId) {
  try {
    const m = await telegram.getChatMember(username, userId);
    return OK_STATUSES.includes(m.status);
  } catch (err) {
    // Bot kanalda admin emas yoki username xato — userni bloklamaymiz
    console.error('getChatMember xato:', username, err.message);
    return true;
  }
}

// Barcha majburiy kanallarni tekshirish
async function checkAll(telegram, userId) {
  const settings = await db.getSettings();
  const channels = settings.channels || [];
  if (!channels.length) return { ok: true, notJoined: [], settings };
  const results = await Promise.all(
    channels.map((c) => isMember(telegram, c.username, userId))
  );
  const notJoined = channels.filter((_, i) => !results[i]);
  return { ok: notJoined.length === 0, notJoined, settings };
}

function joinKeyboard(notJoined, lang) {
  const rows = notJoined.map((c) => [
    Markup.button.url('\ud83d\udce2 ' + (c.title || c.username), 'https://t.me/' + c.username.replace('@', '')),
  ]);
  rows.push([Markup.button.callback(t(lang, 'sub_check_btn'), 'check_sub')]);
  return Markup.inlineKeyboard(rows);
}

// Obuna talab xabari: admin mockup saqlagan bo'lsa — copyMessage
// (premium emojilar saqlanadi!), bo'lmasa — default matn
async function showSubPrompt(ctx, lang, res) {
  const kb = joinKeyboard(res.notJoined, lang);
  const sm = res.settings.subMsg;
  if (sm && sm.chatId && sm.messageId) {
    try {
      await ctx.telegram.copyMessage(ctx.chat.id, sm.chatId, sm.messageId, {
        reply_markup: kb.reply_markup,
      });
      return;
    } catch (err) {
      console.error('subMsg copy xato:', err.message);
    }
  }
  await ctx.reply(t(lang, 'sub_required'), { parse_mode: 'HTML', ...kb });
}

function subscriptionMiddleware(getLang) {
  return async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return next();
    if (ctx.from.id === Number(process.env.ADMIN_ID)) return next();

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
  bot.action('check_sub', async (ctx) => {
    const res = await checkAll(ctx.telegram, ctx.from.id);
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
