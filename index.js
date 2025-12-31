const { Bot } = require("grammy");

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is missing");
  process.exit(1);
}

const bot = new Bot(token);

function getUserName(user) {
  return (user.first_name || "User") + (user.last_name ? " " + user.last_name : "");
}

bot.command("start", async (ctx) => {
  const name = getUserName(ctx.from);
  await ctx.reply(👋 Hello ${name}\n\nI am your AI test bot.\nSend me any message.);
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  if (text.length > 4000) {
    return ctx.reply("Message too long.");
  }

  await ctx.reply(🤖 You said:\n${text});
});

bot.start();
console.log("Bot is running...");
