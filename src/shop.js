const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');

const fmt = (n) => Number(n).toLocaleString('uz-UZ');

function registerShop(bot, getLang) {
  /* ===== ⭐ Yulduzlar ===== */
  bot.hears(allLangs('menu_stars'), async (ctx) => {
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const rows = s.starsPackages.map((p, i) => [
      Markup.button.callback('⭐ ' + p.stars + ' — ' + fmt(p.price) + " so'm", 'shop:stars:' + i),
    ]);
    await ctx.reply(t(lang, 'stars_title'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
  });

  bot.action(/^shop:stars:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const pkg = s.starsPackages[Number(ctx.match[1])];
    if (!pkg) return;
    startPayment(ctx, lang, s, {
      type: 'stars',
      item: '⭐ ' + pkg.stars + ' Stars',
      price: pkg.price,
    });
  });

  /* ===== 👑 Premium ===== */
  bot.hears(allLangs('menu_premium'), async (ctx) => {
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const rows = s.premiumPlans.map((p, i) => [
      Markup.button.callback('👑 ' + p.months + ' ' + t(lang, 'months') + ' — ' + fmt(p.price) + " so'm", 'shop:prem:' + i),
    ]);
    await ctx.reply(t(lang, 'premium_title'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
  });

  bot.action(/^shop:prem:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const plan = s.premiumPlans[Number(ctx.match[1])];
    if (!plan) return;
    startPayment(ctx, lang, s, {
      type: 'premium',
      item: '👑 Premium ' + plan.months + ' ' + t(lang, 'months'),
      price: plan.price,
    });
  });

  /* ===== 🎁 Sovg'a ===== */
  bot.hears(allLangs('menu_gift'), async (ctx) => {
    const lang = await getLang(ctx);
    state.set(ctx.from.id, { action: 'gift:recipient', data: {} });
    await ctx.reply(t(lang, 'gift_title'), { parse_mode: 'HTML' });
  });

  bot.action(/^shop:gift:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    const st = state.get(ctx.from.id);
    if (!st || !st.data.recipient) return;
    const s = await db.getSettings();
    const gift = s.gifts[Number(ctx.match[1])];
    if (!gift) return;
    startPayment(ctx, lang, s, {
      type: 'gift',
      item: gift.name + ' → ' + st.data.recipient,
      price: gift.price,
      extra: { recipient: st.data.recipient, gift: gift.name },
    });
  });

  /* ===== "To'lov qildim" ===== */
  bot.action('shop:paid', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    const st = state.get(ctx.from.id);
    if (!st || st.action !== 'shop:waiting_paid') return;
    state.set(ctx.from.id, { action: 'shop:photo', data: st.data });
    await ctx.reply(t(lang, 'send_screenshot'));
  });

  /* ===== Admin tasdiqlash / rad etish ===== */
  bot.action(/^shop:(ok|no):(.+)$/, async (ctx) => {
    if (ctx.from.id !== Number(process.env.ADMIN_ID)) {
      return ctx.answerCbQuery("⛔ Ruxsat yo\u2018q", { show_alert: true });
    }
    const [, verdict, id] = ctx.match;
    const status = verdict === 'ok' ? 'approved' : 'rejected';
    const payment = await db.setPaymentStatus(id, status);
    if (!payment) return ctx.answerCbQuery('❌ Topilmadi');

    await ctx.answerCbQuery(status === 'approved' ? '✅ Tasdiqlandi' : '❌ Rad etildi');
    await ctx.editMessageCaption(
      (ctx.callbackQuery.message.caption || '') +
      '\n\n' + (status === 'approved' ? '✅ TASDIQLANDI' : '❌ RAD ETILDI')
    ).catch(() => {});

    const buyer = await db.getUser(payment.userId);
    const lang = (buyer && buyer.lang) || 'uz';
    const settings = await db.getSettings();
    const msg = status === 'approved'
      ? t(lang, 'pay_approved', { item: payment.item })
      : t(lang, 'pay_rejected', { contact: settings.contact.telegram });
    await ctx.telegram.sendMessage(payment.userId, msg).catch(() => {});
  });
}

// To'lov bosqichini boshlash (karta ko'rsatish)
async function startPayment(ctx, lang, settings, data) {
  state.set(ctx.from.id, { action: 'shop:waiting_paid', data });
  await ctx.reply(
    t(lang, 'pay_info', { item: data.item, price: Number(data.price).toLocaleString('uz-UZ'), card: settings.cardNumber }),
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'paid_btn'), 'shop:paid')]]),
    }
  );
}

// Gift recipient matni
async function handleText(ctx, s, lang) {
  if (s.action !== 'gift:recipient') return;
  let recipient = ctx.message.text.trim();
  if (!recipient.startsWith('@')) recipient = '@' + recipient;
  s.data.recipient = recipient;
  s.action = 'gift:choose';

  const settings = await db.getSettings();
  const rows = settings.gifts.map((g, i) => [
    Markup.button.callback(g.name + ' — ' + Number(g.price).toLocaleString('uz-UZ') + " so'm", 'shop:gift:' + i),
  ]);
  await ctx.reply(t(lang, 'gift_choose', { recipient }), Markup.inlineKeyboard(rows));
}

// Skrinshot
async function handlePhoto(ctx, s, lang) {
  if (s.action !== 'shop:photo') return;

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  const payment = await db.addPayment({
    userId: ctx.from.id,
    username: ctx.from.username || '',
    type: s.data.type,
    item: s.data.item,
    amount: s.data.price,
    extra: s.data.extra || null,
    photo: fileId,
  });
  state.clear(ctx.from.id);

  await ctx.reply(t(lang, 'screenshot_received'));

  const adminId = Number(process.env.ADMIN_ID);
  await ctx.telegram.sendPhoto(adminId, fileId, {
    caption:
      "💸 <b>YANGI TO\u2018LOV</b>\n\n" +
      '🛍 ' + payment.item + '\n' +
      '💰 ' + Number(payment.amount).toLocaleString('uz-UZ') + " so'm\n" +
      '👤 ' + (ctx.from.username ? '@' + ctx.from.username : ctx.from.first_name) +
      ' (<code>' + ctx.from.id + '</code>)',
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Tasdiqlash', 'shop:ok:' + payment.id),
        Markup.button.callback('❌ Rad etish', 'shop:no:' + payment.id),
      ],
    ]),
  }).catch((e) => console.error('Adminga payment yuborilmadi:', e.message));
}

module.exports = { registerShop, handleText, handlePhoto };
