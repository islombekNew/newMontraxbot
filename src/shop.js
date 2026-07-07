const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');
const { ADMIN_IDS, isAdminId } = require('./config');
const { sendTpl, sendTplTo } = require('./templates');

const fmt = (n) => Number(n).toLocaleString('uz-UZ');

function registerShop(bot, getLang) {
  /* ===== ⭐ Yulduzlar ===== */
  bot.hears(allLangs('menu_stars'), async (ctx) => {
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const rows = s.starsPackages.map((p, i) => [
      Markup.button.callback('⭐ ' + p.stars + ' — ' + fmt(p.price) + " so'm", 'shop:stars:' + i),
    ]);
    await sendTpl(ctx, 'stars', t(lang, 'stars_title'), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows),
    });
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
    state.clear(ctx.from.id);
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    const rows = s.premiumPlans.map((p, i) => [
      Markup.button.callback('👑 ' + p.months + ' ' + t(lang, 'months') + ' — ' + fmt(p.price) + " so'm", 'shop:prem:' + i),
    ]);
    await sendTpl(ctx, 'premium', t(lang, 'premium_title'), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows),
    });
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
    await sendTpl(ctx, 'gift', t(lang, 'gift_title'), { parse_mode: 'HTML' });
  });

  bot.action(/^shop:gift:(\d+)$/, async (ctx) => {
    const lang = await getLang(ctx);
    const st = state.get(ctx.from.id);
    if (!st || !st.data || !st.data.recipient) {
      // Eski tugma (restart'dan keyin) — jim qolmasdan yo'naltiramiz
      await ctx.answerCbQuery();
      return ctx.reply(t(lang, 'gift_title'), { parse_mode: 'HTML' })
        .then(() => state.set(ctx.from.id, { action: 'gift:recipient', data: {} }));
    }
    await ctx.answerCbQuery();
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
    if (!st || st.action !== 'shop:waiting_paid') {
      // Restart'dan keyin eski tugma — userni yo'naltiramiz
      return ctx.reply(t(lang, 'resume_hint'));
    }
    state.set(ctx.from.id, { action: 'shop:photo', data: st.data });
    await ctx.reply(t(lang, 'send_screenshot'));
  });

  /* ===== Admin tasdiqlash / rad etish ===== */
  bot.action(/^shop:(ok|no):(.+)$/, async (ctx) => {
    if (!isAdminId(ctx.from.id)) {
      return ctx.answerCbQuery('⛔ Ruxsat yo‘q', { show_alert: true });
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
    if (status === 'approved') {
      await sendTplTo(ctx.telegram, payment.userId, 'pay_approved',
        t(lang, 'pay_approved', { item: payment.item })).catch(() => {});
    } else {
      await ctx.telegram.sendMessage(payment.userId,
        t(lang, 'pay_rejected', { contact: settings.contact.telegram })).catch(() => {});
    }
  });
}

// To'lov bosqichini boshlash (karta ko'rsatish)
async function startPayment(ctx, lang, settings, data) {
  state.set(ctx.from.id, { action: 'shop:waiting_paid', data });
  await sendTpl(ctx, 'pay',
    t(lang, 'pay_info', { item: data.item, price: fmt(data.price), card: settings.cardNumber }),
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

  // Username tekshiruvi: @dan keyin 4-32 ta harf/raqam/_
  if (!/^@[a-zA-Z0-9_]{4,32}$/.test(recipient)) {
    return ctx.reply(t(lang, 'err_username'));
  }

  s.data.recipient = recipient;
  s.action = 'gift:choose';

  const settings = await db.getSettings();
  const rows = settings.gifts.map((g, i) => [
    Markup.button.callback(g.name + ' — ' + fmt(g.price) + " so'm", 'shop:gift:' + i),
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

  // Barcha adminlarga skrinshot + tasdiqlash tugmalari
  const caption =
    "💸 <b>YANGI TO‘LOV</b>\n\n" +
    '🛍 ' + payment.item + '\n' +
    '💰 ' + fmt(payment.amount) + " so'm\n" +
    '👤 ' + (ctx.from.username ? '@' + ctx.from.username : ctx.from.first_name) +
    ' (<code>' + ctx.from.id + '</code>)';
  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Tasdiqlash', 'shop:ok:' + payment.id),
      Markup.button.callback('❌ Rad etish', 'shop:no:' + payment.id),
    ],
  ]);
  for (const adminId of ADMIN_IDS) {
    await ctx.telegram.sendPhoto(adminId, fileId, { caption, parse_mode: 'HTML', ...kb })
      .catch((e) => console.error('Adminga payment yuborilmadi (' + adminId + '):', e.message));
  }
}

module.exports = { registerShop, handleText, handlePhoto };
