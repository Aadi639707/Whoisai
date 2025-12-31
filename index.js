const { Bot } = require("grammy");

const bot = new Bot(process.env.BOT_TOKEN);

function getName(user) {
  if (!user) return "Someone";
  if (user.username) return "@" + user.username;
  if (user.first_name) return user.first_name;
  return "User";
}

bot.on("message", async (ctx) => {
  if (!ctx.message.text) return;

  const replyUser = ctx.message.reply_to_message
    ? ctx.message.reply_to_message.from
    : null;

  if (!replyUser) return;

  const name = getName(replyUser);
  const text = ctx.message.text.toLowerCase();

  if (text.includes("who")  text.includes("ai")  text.includes("about")) {
    await ctx.reply(
      "🤖 AI Scan Result\n\n" +
      name +
      " is mysterious, smart, and probably hiding something 😏"
    );
  }
});

bot.start();
console.log("Bot is running...");
