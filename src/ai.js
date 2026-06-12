const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const SYSTEM_PROMPT =
  'Sen MONTRAX kompaniyasining AI yordamchisisan. MONTRAX professional IT xizmatlar ko\u2018rsatadi: ' +
  'Front-end dasturlash (saytlar, React), Back-end (Node.js, API, botlar), Grafik dizayn (logo, banner), ' +
  'UI/UX dizayn (Figma), Mobil ilovalar (React Native) va SMM & Reklama. ' +
  'Shuningdek Telegram Stars, Premium va sovg\u2018alar sotiladi. ' +
  'Foydalanuvchi qaysi tilda yozsa, o\u2018sha tilda qisqa va foydali javob ber. ' +
  'Narxlar haqida aniq savol bo\u2018lsa, botdagi tegishli bo\u2018limga yoki admin bilan bog\u2018lanishga yo\u2018naltir.';

async function askGemini(history) {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(GEMINI_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: history.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      })),
      generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const data = await res.json();
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts.map((p) => p.text).join('');
  if (!text) throw new Error('Gemini bo\u2018sh javob');
  return text;
}

function registerAI(bot, getLang, sendMainMenu) {
  bot.hears(allLangs('menu_ai'), async (ctx) => {
    const lang = await getLang(ctx);
    if (!process.env.GEMINI_API_KEY) {
      const s = await db.getSettings();
      return ctx.reply(t(lang, 'ai_no_key', { contact: s.contact.telegram }));
    }
    state.set(ctx.from.id, { action: 'ai:chat', data: { history: [] } });
    await ctx.reply(t(lang, 'ai_intro'), {
      parse_mode: 'HTML',
      ...Markup.keyboard([[t(lang, 'ai_exit_btn')]]).resize(),
    });
  });

  // Chiqish tugmasi (3 til)
  bot.hears(allLangs('ai_exit_btn'), async (ctx) => {
    const lang = await getLang(ctx);
    state.clear(ctx.from.id);
    await ctx.reply(t(lang, 'ai_exited'));
    await sendMainMenu(ctx, lang);
  });
}

// AI chat matni
async function handleText(ctx, s, lang) {
  if (s.action !== 'ai:chat') return;

  const userText = ctx.message.text;
  s.data.history.push({ role: 'user', text: userText });
  // Oxirgi 10 ta xabarni saqlaymiz (kontekstni cheklash)
  s.data.history = s.data.history.slice(-10);

  const waitMsg = await ctx.reply(t(lang, 'ai_thinking'));
  try {
    const answer = await askGemini(s.data.history);
    s.data.history.push({ role: 'model', text: answer });
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, answer)
      .catch(async () => ctx.reply(answer));
  } catch (err) {
    console.error('AI xato:', err.message);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, t(lang, 'ai_error'))
      .catch(() => {});
  }
}

module.exports = { registerAI, handleText };
