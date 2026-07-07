// PM2 bilan ishga tushirish: npm i -g pm2 && pm2 start ecosystem.config.js
// Bot o'chib qolsa avtomatik qayta ishga tushadi.
module.exports = {
  apps: [
    {
      name: 'montrax-bot',
      script: 'bot.js',
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
