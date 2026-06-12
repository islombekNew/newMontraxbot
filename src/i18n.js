const fs = require('fs');
const path = require('path');

const LANGS = ['uz', 'ru', 'en'];
const locales = {};
for (const lang of LANGS) {
  locales[lang] = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'locales', lang + '.json'), 'utf8')
  );
}

// t('uz', 'start_welcome', { name: 'Ali' })
function t(lang, key, vars = {}) {
  const dict = locales[lang] || locales.uz;
  let text = dict[key] || locales.uz[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.split('{' + k + '}').join(String(v));
  }
  return text;
}

// Bitta menu tugmasining barcha tillardagi variantlari (bot.hears uchun)
function allLangs(key) {
  return LANGS.map((lang) => locales[lang][key]).filter(Boolean);
}

module.exports = { t, allLangs, LANGS };
