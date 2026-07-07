// Qo'shimcha bo'limlar: 🖼 Portfolio, ❓ FAQ, ⭐ Baholash
const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function registerExtras(bot, getLang) {
  /* ===== 🖼 Portfolio ===== */
  bot.hears(allLangs('menu_portfolio'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const items = s.portfolio || [];
    if (!items.length) return ctx.reply(t(lang, 'portfolio_empty'));
    await ctx.reply(t(lang, 'portfolio_title'), { parse_mode: 'HTML' });
    // Forward — premium emojili/mediali postlar asl holida ko'rinadi
    for (const item of items.slice(0, 10)) {
      await ctx.telegram.forwardMessage(ctx.chat.id, item.chatId, item.messageId)
        .catch(() => {});
    }
  });

  /* ===== ❓ FAQ ===== */
  bot.hears(allLangs('menu_faq'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const faq = s.faq || [];
    if (!faq.length) return ctx.reply(t(lang, 'faq_empty'));
    const rows = faq.map((f, i) => [Markup.button.callback('❓ ' + f.q, 'faq:' + i)]);
    await ctx.reply(t(lang, 'faq_title'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
  });

  bot.action(/^faq:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const s = await db.getSettings();
    const f = (s.faq || [])[Number(ctx.match[1])];
    if (!f) return;
    await ctx.reply('❓ <b>' + esc(f.q) + '</b>\n\n💬 ' + esc(f.a), { parse_mode: 'HTML' });
  });

  /* ===== ⭐ Baholash (buyurtma "Bajarildi" bo'lganda yuboriladi) ===== */
  bot.action(/^rate:([^:]+):([1-5])$/, async (ctx) => {
    const lang = await getLang(ctx);
    const [, orderId, score] = ctx.match;
    await db.setOrderRating(orderId, Number(score));
    await ctx.answerCbQuery('⭐'.repeat(Number(score)));
    await ctx.editMessageText(t(lang, 'rate_thanks') + ' ' + '⭐'.repeat(Number(score)))
      .catch(() => {});
  });
}

// 1-5 yulduz tugmalari
function ratingKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [1, 2, 3, 4, 5].map((n) => Markup.button.callback(n + '⭐', 'rate:' + orderId + ':' + n)),
  ]);
}

module.exports = { registerExtras, ratingKeyboard };
