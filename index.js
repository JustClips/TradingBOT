require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

console.log('🚀 Bot starting...');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    
    if (message.content === '!ping') {
        await message.reply('Pong! 🏓');
    }
});

client.login(process.env.DISCORD_TOKEN);
