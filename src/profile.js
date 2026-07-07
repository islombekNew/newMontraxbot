const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');
const { sendTpl } = require('./templates');

const LANG_NAMES = { uz: "O‘zbekcha 🇺🇿", ru: "Русский 🇷🇺", en: "English 🇬🇧" };

// Har 5 ta referal = 5% chegirma (maksimum 20%)
const discountFor = (refs) => Math.min(20, Math.floor((refs || 0) / 5) * 5);

function langKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇺🇿 O‘zbekcha", 'lang:uz')],
    [Markup.button.callback("🇷🇺 Русский", 'lang:ru')],
    [Markup.button.callback("🇬🇧 English", 'lang:en')],
  ]);
}

function registerProfile(bot, getLang, sendMainMenu) {
  /* ===== 👤 Profilim ===== */
  bot.hears(allLangs('menu_profile'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const user = await db.getUser(ctx.from.id);
    if (!user) return;
    const orders = await db.getUserOrders(ctx.from.id);
    await ctx.reply(
      t(lang, 'profile_title', {
        id: user.id,
        name: user.firstName || '—',
        date: user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('uz-UZ') : '—',
        orders: orders.length,
        refs: user.referrals || 0,
        discount: discountFor(user.referrals),
        lang: LANG_NAMES[lang],
      }),
      { parse_mode: 'HTML' }
    );
  });

  /* ===== 📦 Mening buyurtmalarim ===== */
  bot.hears(allLangs('menu_orders'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const orders = await db.getUserOrders(ctx.from.id);
    const payments = (await db.getPayments()).filter((p) => p.userId === ctx.from.id);

    if (!orders.length && !payments.length) {
      return ctx.reply(t(lang, 'no_orders'));
    }

    const lines = [];
    for (const o of orders.slice(-10)) {
      lines.push(
        '🔧 <code>#' + o.id + '</code> ' + t(lang, 'menu_' + o.service) +
        ' — ' + t(lang, 'status_' + o.status) +
        (o.rating ? ' ' + '⭐'.repeat(o.rating) : '')
      );
    }
    for (const p of payments.slice(-10)) {
      lines.push('🛍 ' + p.item + ' — ' + t(lang, 'status_' + p.status));
    }
    await ctx.reply(t(lang, 'my_orders_title') + '\n\n' + lines.join('\n'), { parse_mode: 'HTML' });
  });

  /* ===== 👥 Referal ===== */
  bot.hears(allLangs('menu_referral'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const user = await db.getUser(ctx.from.id);
    const link = 'https://t.me/' + ctx.botInfo.username + '?start=ref_' + ctx.from.id;
    await sendTpl(ctx, 'referral',
      t(lang, 'referral_title', { link, count: (user && user.referrals) || 0 }),
      { parse_mode: 'HTML' }
    );
  });

  /* ===== 🌐 Tilni o'zgartirish ===== */
  bot.hears(allLangs('menu_lang'), async (ctx) => {
    state.clear(ctx.from.id);
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

  /* ===== 📞 Bog'lanish ===== */
  bot.hears(allLangs('menu_contact'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    await sendTpl(ctx, 'contact',
      t(lang, 'contact_title', {
        telegram: s.contact.telegram,
        phone: s.contact.phone,
        channel: s.contact.channel,
      }),
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { registerProfile, langKeyboard, LANG_NAMES, discountFor };
