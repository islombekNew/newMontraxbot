const { Markup } = require('telegraf');
const db = require('./db');
const { t, allLangs } = require('./i18n');

const LANG_NAMES = { uz: "O\u2018zbekcha \ud83c\uddfa\ud83c\uddff", ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439 \ud83c\uddf7\ud83c\uddfa", en: "English \ud83c\uddec\ud83c\udde7" };

function langKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("\ud83c\uddfa\ud83c\uddff O\u2018zbekcha", 'lang:uz')],
    [Markup.button.callback("\ud83c\uddf7\ud83c\uddfa \u0420\u0443\u0441\u0441\u043a\u0438\u0439", 'lang:ru')],
    [Markup.button.callback("\ud83c\uddec\ud83c\udde7 English", 'lang:en')],
  ]);
}

function registerProfile(bot, getLang, sendMainMenu) {
  /* ===== \ud83d\udc64 Profilim ===== */
  bot.hears(allLangs('menu_profile'), async (ctx) => {
    const lang = await getLang(ctx);
    const user = await db.getUser(ctx.from.id);
    const orders = await db.getUserOrders(ctx.from.id);
    await ctx.reply(
      t(lang, 'profile_title', {
        id: user.id,
        name: user.firstName || '\u2014',
        date: new Date(user.joinedAt).toLocaleDateString('uz-UZ'),
        orders: orders.length,
        refs: user.referrals || 0,
        lang: LANG_NAMES[lang],
      }),
      { parse_mode: 'HTML' }
    );
  });

  /* ===== \ud83d\udce6 Mening buyurtmalarim ===== */
  bot.hears(allLangs('menu_orders'), async (ctx) => {
    const lang = await getLang(ctx);
    const orders = await db.getUserOrders(ctx.from.id);
    const payments = (await db.getPayments()).filter((p) => p.userId === ctx.from.id);

    if (!orders.length && !payments.length) {
      return ctx.reply(t(lang, 'no_orders'));
    }

    const lines = [];
    for (const o of orders.slice(-10)) {
      lines.push(
        '\ud83d\udd27 <code>#' + o.id + '</code> ' + t(lang, 'menu_' + o.service) +
        ' \u2014 ' + t(lang, 'status_' + o.status)
      );
    }
    for (const p of payments.slice(-10)) {
      lines.push('\ud83d\udecd ' + p.item + ' \u2014 ' + t(lang, 'status_' + p.status));
    }
    await ctx.reply(t(lang, 'my_orders_title') + '\n\n' + lines.join('\n'), { parse_mode: 'HTML' });
  });

  /* ===== \ud83d\udc65 Referal ===== */
  bot.hears(allLangs('menu_referral'), async (ctx) => {
    const lang = await getLang(ctx);
    const user = await db.getUser(ctx.from.id);
    const link = 'https://t.me/' + ctx.botInfo.username + '?start=ref_' + ctx.from.id;
    await ctx.reply(
      t(lang, 'referral_title', { link, count: user.referrals || 0 }),
      { parse_mode: 'HTML' }
    );
  });

  /* ===== \ud83c\udf10 Tilni o'zgartirish ===== */
  bot.hears(allLangs('menu_lang'), async (ctx) => {
    await ctx.reply(t('uz', 'choose_lang'), langKeyboard());
  });

  bot.action(/^lang:(uz|ru|en)$/, async (ctx) => {
    const lang = ctx.match[1];
    await db.setUserLang(ctx.from.id, lang);
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(t(lang, 'lang_set'));
    await sendMainMenu(ctx, lang);
  });

  /* ===== \ud83d\udcde Bog'lanish ===== */
  bot.hears(allLangs('menu_contact'), async (ctx) => {
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    await ctx.reply(
      t(lang, 'contact_title', {
        telegram: s.contact.telegram,
        phone: s.contact.phone,
        channel: s.contact.channel,
      }),
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { registerProfile, langKeyboard, LANG_NAMES };
