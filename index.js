require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

// Create client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Ready event
client.once(Events.ClientReady, () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
});

// Message event
client.on(Events.MessageCreate, async (message) => {
    // Don't respond to bots
    if (message.author.bot) return;
    
    // Simple command
    if (message.content === '!ping') {
        await message.reply('Pong! 🏓');
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
