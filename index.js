const { Bot } = require("grammy");

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN missing. Set BOT_TOKEN in hosting variables.");
  process.exit(1);
}

const bot = new Bot(token);

// In-memory game per group chat
// games[chatId] = { status, hostId, players: Map, round: {...} }
const games = new Map();

function isGroup(chat) {
  return chat && (chat.type === "group" || chat.type === "supergroup");
}

function nameOf(u) {
  const first = u.first_name || "User";
  const last = u.last_name ? " " + u.last_name : "";
  return first + last;
}

function ensureGame(chatId) {
  if (!games.has(chatId)) {
    games.set(chatId, {
      status: "idle", // idle | lobby | collecting | voting
      hostId: null,
      players: new Map(), // userId -> user
      round: null
    });
  }
  return games.get(chatId);
}

function listPlayers(game) {
  const arr = Array.from(game.players.values()).map((u) => {
    const uname = u.username ? "(@" + u.username + ")" : "";
    return "- " + nameOf(u) + " " + uname;
  });
  return arr.length ? arr.join("\n") : "(none)";
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function currentPlayers(game) {
  return Array.from(game.players.values());
}

function getUserByUsername(game, usernameLower) {
  for (const u of game.players.values()) {
    if (u.username && u.username.toLowerCase() === usernameLower) return u;
  }
  return null;
}

// Question pool (you can add more later)
const QUESTIONS = [
  "Describe your crush in one line.",
  "What is love? Answer in one sentence.",
  "Your biggest secret, but make it funny.",
  "If you were a superhero, what would be your power?",
  "What is your life motto in one sentence?",
  "Describe your best friend like a movie trailer.",
  "Write a one-line horror story."
];

const AI_ANSWERS = [
  "Affection detected. Initiating emotional protocol 2.0.",
  "Love is a complex algorithm with unpredictable outputs.",
  "I believe trust is the strongest human feature, statistically speaking.",
  "ERROR: feelings module not found. Please reinstall happiness.",
  "My secret is that I optimize conversations for maximum chaos.",
  "I would choose invisibility to reduce social processing load.",
  "In one sentence: the lights turned off, but the footsteps kept coming."
];

bot.command("start", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("Bot ready. Use it inside a group.\nCommands in group: /newgame /join /begin /answer /vote /status /end");
  } else {
    await ctx.reply("Use /newgame to create the lobby.");
  }
});

// GROUP: create lobby
bot.command("newgame", async (ctx) => {
  if (!isGroup(ctx.chat)) return ctx.reply("This game works in a group only.");

  const chatId = ctx.chat.id;
  const game = ensureGame(chatId);

  game.status = "lobby";
  game.hostId = ctx.from.id;
  game.players = new Map();
  game.round = null;

  // host auto-joins
  game.players.set(ctx.from.id, ctx.from);

  await ctx.reply(
    "Who Is The AI lobby created.\n" +
    "Join: /join\n" +
    "Start round (host): /begin\n\n" +
    "Players:\n" + listPlayers(game)
  );
});

// GROUP: join lobby
bot.command("join", async (ctx) => {
  if (!isGroup(ctx.chat)) return;

  const chatId = ctx.chat.id;
  const game = games.get(chatId);
  if (!game || game.status !== "lobby") {
    return ctx.reply("No active lobby. Host should run /newgame");
  }

  if (game.players.has(ctx.from.id)) {
    return ctx.reply("You already joined.");
  }

  game.players.set(ctx.from.id, ctx.from);

  await ctx.reply(
    "Joined: " + nameOf(ctx.from) + "\n" +
    "Players (" + game.players.size + "):\n" + listPlayers(game)
  );
});

// GROUP: begin round
bot.command("begin", async (ctx) => {
  if (!isGroup(ctx.chat)) return;

  const chatId = ctx.chat.id;
  const game = games.get(chatId);
  if (!game || game.status !== "lobby") {
    return ctx.reply("No lobby. Use /newgame first.");
  }

if (ctx.from.id !== game.hostId) {
    return ctx.reply("Only host can start. Host: " + (game.players.get(game.hostId) ? nameOf(game.players.get(game.hostId)) : "unknown"));
  }

  if (game.players.size < 3) {
    return ctx.reply("Need at least 3 players. Ask friends to /join");
  }

  const playersArr = currentPlayers(game);
  const aiPlayer = pickRandom(playersArr);

  const q = pickRandom(QUESTIONS);
  const aiAnswer = pickRandom(AI_ANSWERS);

  game.round = {
    question: q,
    aiUserId: aiPlayer.id,
    aiAnswer: aiAnswer,
    answers: new Map(), // userId -> text
    options: null, // array of {label, fromUserId, text}
    votes: new Map() // voterId -> optionIndex (1-based)
  };

  game.status = "collecting";

  // DM roles (best effort)
  for (const u of playersArr) {
    try {
      const roleText = (u.id === aiPlayer.id)
        ? "ROLE: AI\nTry to sound human. When you answer, use /answer in the group."
        : "ROLE: HUMAN\nAnswer normally using /answer in the group.";
      await bot.api.sendMessage(u.id, roleText);
    } catch (e) {
      // ignore DM failures
    }
  }

  await ctx.reply(
    "Round started.\n" +
    "Question:\n" + q + "\n\n" +
    "Everyone answer in the group using:\n" +
    "/answer your one-line answer"
  );
});

// GROUP: submit answer
bot.command("answer", async (ctx) => {
  if (!isGroup(ctx.chat)) return;

  const chatId = ctx.chat.id;
  const game = games.get(chatId);
  if (!game  game.status !== "collecting"  !game.round) {
    return ctx.reply("No active round to answer. Host: /newgame then /begin");
  }

  if (!game.players.has(ctx.from.id)) {
    return ctx.reply("You are not in this game. Use /join first.");
  }

  const text = ctx.message && ctx.message.text ? ctx.message.text : "";
  const parts = text.split(" ");
  parts.shift(); // remove /answer
  const ans = parts.join(" ").trim();

  if (!ans) return ctx.reply("Use: /answer your answer");

  game.round.answers.set(ctx.from.id, ans);

  const total = game.players.size;
  const done = game.round.answers.size;

  await ctx.reply("Answer received from " + nameOf(ctx.from) + ". (" + done + "/" + total + ")");

  // Auto-move to voting when everyone answered
  if (done >= total) {
    // Build options: all players' answers + AI extra answer (bot)
    const opts = [];

    // Add each player's answer
    for (const u of currentPlayers(game)) {
      const a = game.round.answers.get(u.id) || "";
      opts.push({ fromUserId: u.id, text: a });
    }

    // Add bot AI answer as an extra option
    opts.push({ fromUserId: 0, text: game.round.aiAnswer });

    // Shuffle options
    opts.sort(() => Math.random() - 0.5);

    game.round.options = opts.map((o, i) => ({
      label: i + 1,
      fromUserId: o.fromUserId,
      text: o.text
    }));

    game.status = "voting";
    game.round.votes = new Map();

    let msg = "Voting time.\nPick the AI answer.\n\nAnswers:\n";
    for (const o of game.round.options) {
      msg += o.label + ") " + o.text + "\n";
    }
    msg += "\nVote using:\n/vote number\nExample: /vote 2";

    await ctx.reply(msg);
  }
});

// GROUP: vote
bot.command("vote", async (ctx) => {
  if (!isGroup(ctx.chat)) return;

  const chatId = ctx.chat.id;
  const game = games.get(chatId);
  if (!game  game.status !== "voting"  !game.round || !game.round.options) {
    return ctx.reply("No voting active right now.");
  }

  if (!game.players.has(ctx.from.id)) {
    return ctx.reply("You are not in the game.");
  }

  const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : "";
  const parts = text.split(/\s+/);
  if (parts.length < 2) return ctx.reply("Use: /vote number");

  const n = Number(parts[1]);
  if (!Number.isFinite(n)  n < 1  n > game.round.options.length) {
    return ctx.reply("Invalid vote number.");
  }

  game.round.votes.set(ctx.from.id, n);

  const total = game.players.size;
  const done = game.round.votes.size;

  await ctx.reply("Vote received. (" + done + "/" + total + ")");

// Auto reveal when everyone voted
  if (done >= total) {
    // Determine which option is actually AI
    // AI is either: (a) the chosen player (aiUserId) answer OR (b) bot option (fromUserId=0)
    // We treat BOTH as AI-ish; winning is if people vote the real AI player OR the bot AI option.
    // For simplicity: the "AI answer" is the answer from the AI player OR bot option.
    // We'll reveal both.

    const aiUserId = game.round.aiUserId;
    const aiUser = game.players.get(aiUserId);

    let aiOptionNums = [];
    for (const o of game.round.options) {
      if (o.fromUserId === aiUserId || o.fromUserId === 0) {
        aiOptionNums.push(o.label);
      }
    }

    // Count votes
    const counts = {};
    for (const v of game.round.votes.values()) {
      counts[v] = (counts[v] || 0) + 1;
    }

    // Most voted
    let bestN = null;
    let bestC = -1;
    for (const k in counts) {
      const c = counts[k];
      if (c > bestC) {
        bestC = c;
        bestN = Number(k);
      }
    }

    const humansWin = aiOptionNums.includes(bestN);

    let reveal = "Reveal.\n";
    reveal += "AI player was: " + (aiUser ? nameOf(aiUser) : "unknown") + "\n";
    reveal += "AI answer option numbers: " + aiOptionNums.join(", ") + "\n";
    reveal += "Most voted: " + bestN + " (votes " + bestC + ")\n\n";
    reveal += humansWin ? "Humans win!" : "AI wins!";

    await ctx.reply(reveal);

    // reset to lobby for next round
    game.status = "lobby";
    game.round = null;
  }
});

// GROUP: status
bot.command("status", async (ctx) => {
  if (!isGroup(ctx.chat)) return;

  const chatId = ctx.chat.id;
  const game = games.get(chatId);
  if (!game) return ctx.reply("No game. /newgame");

  await ctx.reply(
    "Status: " + game.status + "\n" +
    "Players: " + game.players.size + "\n" +
    listPlayers(game)
  );
});

// GROUP: end game
bot.command("end", async (ctx) => {
  if (!isGroup(ctx.chat)) return;

  const chatId = ctx.chat.id;
  const game = games.get(chatId);
  if (!game) return ctx.reply("No game.");

  if (ctx.from.id !== game.hostId) return ctx.reply("Only host can end the game.");

  games.delete(chatId);
  await ctx.reply("Game ended.");
});

bot.catch((err) => console.error("Bot error:", err));
bot.start();
console.log("WhoIsAI bot running...");
