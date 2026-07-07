const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');
const { ADMIN_IDS } = require('./config');
const { sendTpl } = require('./templates');

// Xizmat kaliti -> menu/desc kalitlari
const SERVICES = ['frontend', 'design', 'backend', 'mobile', 'uiux', 'smm'];

const MIN_DESC_LEN = 10;

function registerServices(bot, getLang) {
  // Har bir xizmat tugmasi (3 tildagi variantlari bilan)
  for (const svc of SERVICES) {
    bot.hears(allLangs('menu_' + svc), async (ctx) => {
      state.clear(ctx.from.id); // oldingi yarim flow'ni bekor qilamiz
      const lang = await getLang(ctx);
      const settings = await db.getSettings();
      const price = settings.servicePrices[svc] || '';
      const text =
        t(lang, 'svc_' + svc + '_desc') +
        '\n\n' + t(lang, 'svc_price_from', { price });
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t(lang, 'svc_order_btn'), 'svc:order:' + svc)],
        ]),
      });
    });
  }

  // Buyurtma flow boshlanishi
  bot.action(/^svc:order:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    const svc = ctx.match[1];
    state.set(ctx.from.id, { action: 'order:desc', data: { service: svc } });
    await ctx.reply(t(lang, 'order_desc_ask'));
  });

  // Tasdiqlash
  bot.action('order:confirm', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    const s = state.get(ctx.from.id);
    if (!s || s.action !== 'order:confirm') return;

    const order = await db.addOrder({
      userId: ctx.from.id,
      username: ctx.from.username || '',
      service: s.data.service,
      description: s.data.description,
      budget: s.data.budget,
      deadline: s.data.deadline,
      phone: s.data.phone,
    });
    state.clear(ctx.from.id);

    await ctx.editMessageReplyMarkup().catch(() => {});
    await sendTpl(ctx, 'order_done', t(lang, 'order_sent', { id: order.id }), { parse_mode: 'HTML' });

    // Barcha adminlarga xabar
    const adminMsg =
      '🆕 <b>YANGI BUYURTMA</b> <code>#' + order.id + '</code>\n\n' +
      '🔧 Xizmat: ' + t('uz', 'menu_' + order.service) + '\n' +
      '👤 User: ' + (order.username ? '@' + order.username : ctx.from.first_name) +
      ' (<code>' + order.userId + '</code>)\n' +
      '📝 ' + order.description + '\n' +
      '💰 Byudjet: ' + order.budget + '\n' +
      '⏳ Muddat: ' + order.deadline + '\n' +
      '📞 Tel: ' + order.phone;
    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Qabul qilish', 'adm:ord:accepted:' + order.id),
        Markup.button.callback('❌ Rad etish', 'adm:ord:rejected:' + order.id),
      ],
    ]);
    for (const adminId of ADMIN_IDS) {
      await ctx.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'HTML', ...kb })
        .catch((e) => console.error('Adminga order yuborilmadi (' + adminId + '):', e.message));
    }
  });

  bot.action('order:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    state.clear(ctx.from.id);
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply(t(lang, 'cancelled'));
  });
}

// Telefon: +998901234567, 998901234567, 901234567 (bo'shliq/tire/qavslar olib tashlanadi)
function isValidPhone(text) {
  const cleaned = text.replace(/[\s\-()]/g, '');
  return /^\+?\d{9,15}$/.test(cleaned);
}

// Matnli qadamlar
async function handleText(ctx, s, lang) {
  const text = ctx.message.text.trim();
  const d = s.data;

  switch (s.action) {
    case 'order:desc':
      if (text.length < MIN_DESC_LEN) {
        return ctx.reply(t(lang, 'err_short', { min: MIN_DESC_LEN }));
      }
      d.description = text;
      s.action = 'order:budget';
      return ctx.reply(t(lang, 'order_budget_ask'));
    case 'order:budget':
      d.budget = text;
      s.action = 'order:deadline';
      return ctx.reply(t(lang, 'order_deadline_ask'));
    case 'order:deadline':
      d.deadline = text;
      s.action = 'order:phone';
      return ctx.reply(t(lang, 'order_phone_ask'));
    case 'order:phone': {
      if (!isValidPhone(text)) {
        return ctx.reply(t(lang, 'err_phone'));
      }
      d.phone = text;
      s.action = 'order:confirm';
      return ctx.reply(
        t(lang, 'order_confirm', {
          service: t(lang, 'menu_' + d.service),
          desc: d.description, budget: d.budget,
          deadline: d.deadline, phone: d.phone,
        }),
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(t(lang, 'order_confirm_btn'), 'order:confirm'),
              Markup.button.callback(t(lang, 'order_cancel_btn'), 'order:cancel'),
            ],
          ]),
        }
      );
    }
  }
}

module.exports = { registerServices, handleText, SERVICES };
