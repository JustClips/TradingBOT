require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

console.log('Bot starting...');

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

// Handle errors
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
