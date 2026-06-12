const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t } = require('./i18n');

const isAdmin = (ctx) => ctx.from && ctx.from.id === Number(process.env.ADMIN_ID);
const fmt = (n) => Number(n).toLocaleString('uz-UZ');

const STATUS_UZ = {
  new: '\ud83c\udd95 Yangi', accepted: '\u2705 Qabul qilindi', in_progress: '\u2699\ufe0f Jarayonda',
  done: '\ud83c\udf89 Bajarildi', rejected: '\u274c Rad etildi',
  pending: '\u23f3 Kutilmoqda', approved: '\u2705 Tasdiqlandi',
};

function panelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('\ud83d\udce6 Buyurtmalar', 'adm:orders'),
      Markup.button.callback('\ud83d\udcb8 To\u2018lovlar', 'adm:pays'),
    ],
    [
      Markup.button.callback('\ud83d\udc65 Userlar', 'adm:users'),
      Markup.button.callback('\ud83d\udcca Statistika', 'adm:stats'),
    ],
    [
      Markup.button.callback('\u2699\ufe0f Sozlamalar', 'adm:settings'),
      Markup.button.callback('\ud83d\udce3 Hammaga xabar', 'adm:broadcast'),
    ],
  ]);
}

const SET_KEYS = {
  cardNumber: '\ud83d\udcb3 Karta raqami',
  telegram: '\ud83d\udcac Telegram kontakt',
  phone: '\ud83d\udcf1 Telefon',
  channel: '\ud83d\udce2 Kanal',
};

function registerAdmin(bot) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return;
    state.clear(ctx.from.id);
    await ctx.reply('\ud83d\udee0 <b>MONTRAX ADMIN PANEL</b>', { parse_mode: 'HTML', ...panelKeyboard() });
  });

  bot.action('adm:back', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    state.clear(ctx.from.id);
    await ctx.editMessageText('\ud83d\udee0 <b>MONTRAX ADMIN PANEL</b>', { parse_mode: 'HTML', ...panelKeyboard() })
      .catch(async () => ctx.reply('\ud83d\udee0 <b>MONTRAX ADMIN PANEL</b>', { parse_mode: 'HTML', ...panelKeyboard() }));
  });

  /* ===== Buyurtmalar ro'yxati ===== */
  bot.action('adm:orders', async (ctx) => {
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

  // Buyurtma tafsiloti + status tugmalari
  bot.action(/^adm:ordview:(.+)$/, async (ctx) => {
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
      '\ud83d\udcb0 ' + o.budget + '\n' +
      '\u23f3 ' + o.deadline + '\n' +
      '\ud83d\udcde ' + o.phone + '\n' +
      '\ud83d\udccc Holat: ' + STATUS_UZ[o.status],
      {
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

  // Status o'zgartirish (userga ham xabar boradi)
  bot.action(/^adm:ord:(accepted|in_progress|done|rejected):(.+)$/, async (ctx) => {
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
  bot.action('adm:pays', async (ctx) => {
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
      '\ud83d\udcb8 <b>To\u2018lovlar</b> (oxirgi 20)\n' +
      '\ud83d\udcb0 Jami tasdiqlangan: ' + fmt(totalApproved) + ' so\u2018m\n\n' +
      lines.join('\n'),
      { parse_mode: 'HTML' }
    );
  });

  /* ===== Userlar ===== */
  bot.action('adm:users', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const users = await db.getUsers();
    const lines = users.slice(-30).map((u) =>
      '\ud83d\udc64 <code>' + u.id + '</code> ' + (u.username ? '@' + u.username : u.firstName) +
      ' | ' + (u.lang || '\u2014') + ' | ref: ' + (u.referrals || 0)
    );
    await ctx.reply(
      '\ud83d\udc65 <b>Userlar</b> (oxirgi 30 / jami ' + users.length + ')\n\n' +
      (lines.join('\n') || 'Bo\u2018sh'),
      { parse_mode: 'HTML' }
    );
  });

  /* ===== Statistika ===== */
  bot.action('adm:stats', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const [users, orders, pays] = await Promise.all([db.getUsers(), db.getOrders(), db.getPayments()]);
    const byStatus = (st) => orders.filter((o) => o.status === st).length;
    const totalApproved = pays.filter((p) => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const totalRefs = users.reduce((sum, u) => sum + (u.referrals || 0), 0);
    await ctx.reply(
      '\ud83d\udcca <b>Statistika</b>\n\n' +
      '\ud83d\udc65 Userlar: ' + users.length + '\n' +
      '\ud83d\udc65 Referal orqali: ' + totalRefs + '\n\n' +
      '\ud83d\udce6 Buyurtmalar: ' + orders.length + '\n' +
      '  \ud83c\udd95 Yangi: ' + byStatus('new') + '\n' +
      '  \u2699\ufe0f Jarayonda: ' + byStatus('in_progress') + '\n' +
      '  \ud83c\udf89 Bajarildi: ' + byStatus('done') + '\n\n' +
      '\ud83d\udcb8 To\u2018lovlar: ' + pays.length + ' ta\n' +
      '\ud83d\udcb0 Jami daromad: ' + fmt(totalApproved) + ' so\u2018m',
      { parse_mode: 'HTML' }
    );
  });

  /* ===== Sozlamalar ===== */
  bot.action('adm:settings', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const s = await db.getSettings();
    const rows = Object.entries(SET_KEYS).map(([key, label]) => [
      Markup.button.callback(label, 'adm:set:' + key),
    ]);
    rows.push([Markup.button.callback('\u2b05\ufe0f Orqaga', 'adm:back')]);
    await ctx.reply(
      '\u2699\ufe0f <b>Sozlamalar</b>\n\n' +
      '\ud83d\udcb3 Karta: ' + s.cardNumber + '\n' +
      '\ud83d\udcac Telegram: ' + s.contact.telegram + '\n' +
      '\ud83d\udcf1 Telefon: ' + s.contact.phone + '\n' +
      '\ud83d\udce2 Kanal: ' + s.contact.channel + '\n\n' +
      '\u2139\ufe0f Narxlar (xizmat, stars, premium, sovg\u2018alar) data/settings.json faylida tahrirlanadi.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
    );
  });

  bot.action(/^adm:set:(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    if (!SET_KEYS[key]) return;
    state.set(ctx.from.id, { action: 'admin:set', key });
    await ctx.reply('\u270f\ufe0f Yangi qiymatni kiriting (' + SET_KEYS[key] + '):');
  });

  /* ===== Broadcast ===== */
  bot.action('adm:broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    state.set(ctx.from.id, { action: 'admin:broadcast' });
    await ctx.reply('\ud83d\udce3 Hammaga yuboriladigan xabarni yozing (matn, rasm yoki video):');
  });
}

/* ===== Matnli flow'lar ===== */
async function handleText(ctx, s) {
  if (s.action === 'admin:set') {
    const value = ctx.message.text.trim();
    if (s.key === 'cardNumber') {
      await db.updateSettings({ cardNumber: value });
    } else {
      const settings = await db.getSettings();
      settings.contact[s.key] = value;
      await db.updateSettings({ contact: settings.contact });
    }
    state.clear(ctx.from.id);
    return ctx.reply('\u2705 Saqlandi: ' + value);
  }
  if (s.action === 'admin:broadcast') return doBroadcast(ctx);
}

async function doBroadcast(ctx) {
  state.clear(ctx.from.id);
  const users = await db.getUsers();
  await ctx.reply('\u23f3 Yuborilmoqda... (' + users.length + ' user)');
  let ok = 0, fail = 0;
  for (const u of users) {
    try {
      await ctx.telegram.copyMessage(u.id, ctx.chat.id, ctx.message.message_id);
      ok++;
    } catch { fail++; }
    await new Promise((r) => setTimeout(r, 50)); // rate limit himoyasi
  }
  await ctx.reply('\ud83d\udce3 Tugadi!\n\u2705 Yuborildi: ' + ok + '\n\u274c Xato: ' + fail);
}

async function handleMedia(ctx, s) {
  if (s.action === 'admin:broadcast') return doBroadcast(ctx);
}

module.exports = { registerAdmin, handleText, handleMedia, isAdmin };
