import { Bot } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN);

function getName(user) {
  if (!user) return "Someone";
  if (user.username) return "@" + user.username;
  if (user.first_name) return user.first_name;
  return "User";
}

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.toLowerCase();
  const replyUser = ctx.message.reply_to_message?.from;

  if (!replyUser) return;

  const name = getName(replyUser);

  if (text.includes("who")  text.includes("ai")  text.includes("about")) {
    await ctx.reply(
      "🤖 *AI Scan Complete*\n\n" +
      name +
      " looks like someone who thinks a lot but talks less 😏",
      { parse_mode: "Markdown" }
    );
  }
});

bot.start();
console.log("AI bot running...");
