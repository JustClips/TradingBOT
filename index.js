require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

console.log('🚀 Bot starting...');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageTyping,
    ],
});

// Store active trades
const activeTrades = new Map();
const TRADE_CHANNEL_ID = '1410622424029855867'; // Your specific channel ID

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    // Start message cleanup
    startMessageCleanup();
});

// Message cleanup function - instant deletion
client.on(Events.MessageCreate, async (message) => {
    // Delete non-bot messages in trade channel immediately
    if (message.channelId === TRADE_CHANNEL_ID && !message.author.bot) {
        try {
            await message.delete();
        } catch (error) {
            // Ignore errors
        }
    }
});

// Start periodic cleanup for any missed messages
function startMessageCleanup() {
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(TRADE_CHANNEL_ID);
            const messages = await channel.messages.fetch({ limit: 50 });
            
            messages.forEach(async (message) => {
                if (!message.author.bot) {
                    try {
                        await message.delete();
                    } catch (error) {
                        // Ignore errors
                    }
                }
            });
        } catch (error) {
            console.error('Periodic cleanup error:', error);
        }
    }, 10000); // Check every 10 seconds
}

// Register slash commands
client.on(Events.ClientReady, async () => {
    try {
        const commands = [
            {
                name: 'trade',
                description: 'Create a new trade post',
            },
            {
                name: 'mytrades',
                description: 'View your active trades',
            },
            {
                name: 'activetrades',
                description: 'View all active trades',
            }
        ];

        await client.application.commands.set(commands);
        console.log('✅ Slash commands registered');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'trade') {
            // Check if command is used in the correct channel
            if (interaction.channelId !== TRADE_CHANNEL_ID) {
                await interaction.reply({ 
                    content: `⚠️ This command can only be used in <#${TRADE_CHANNEL_ID}>`, 
                    ephemeral: true 
                });
                return;
            }

            // Create modal for trade creation
            const modal = new ModalBuilder()
                .setCustomId('tradeModal')
                .setTitle('Create Trade Post')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('wantInput')
                            .setLabel('Looking For')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('What you want to receive')
                            .setMaxLength(100)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('offerInput')
                            .setLabel('Offering')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('What you are offering')
                            .setMaxLength(100)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('imageInput')
                            .setLabel('Image URL (Optional)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setPlaceholder('Direct image link')
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('descriptionInput')
                            .setLabel('Description (Optional)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                            .setPlaceholder('Additional details...')
                            .setMaxLength(500)
                    )
                );

            await interaction.showModal(modal);
        }

        // View my trades command
        if (interaction.commandName === 'mytrades') {
            const userTrades = [];
            activeTrades.forEach((trade, key) => {
                if (trade.traderId === interaction.user.id) {
                    userTrades.push(trade);
                }
            });

            if (userTrades.length === 0) {
                await interaction.reply({ 
                    content: '❌ You have no active trades.', 
                    ephemeral: true 
                });
                return;
            }

            let tradeList = '**Your Active Trades:**\n\n';
            userTrades.forEach((trade, index) => {
                tradeList += `${index + 1}. **${trade.offer}** → **${trade.want}** (<t:${Math.floor(trade.timestamp / 1000)}:R>)\n`;
            });

            await interaction.reply({ 
                content: tradeList, 
                ephemeral: true 
            });
        }

        // View all active trades
        if (interaction.commandName === 'activetrades') {
            const totalTrades = activeTrades.size;
            
            if (totalTrades === 0) {
                await interaction.reply({ 
                    content: '❌ No active trades at the moment.', 
                    ephemeral: true 
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Active Trades Overview')
                .setDescription(`There are currently **${totalTrades}** active trades.`)
                .setColor('#5865F2')
                .setFooter({ text: `Trade System`, iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });
        }
    }

    // Handle modal submission
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'tradeModal') {
            const want = interaction.fields.getTextInputValue('wantInput');
            const offer = interaction.fields.getTextInputValue('offerInput');
            const imageUrl = interaction.fields.getTextInputValue('imageInput') || '';
            const description = interaction.fields.getTextInputValue('descriptionInput') || '';

            // Validate image URL if provided
            let validImageUrl = '';
            if (imageUrl) {
                try {
                    const url = new URL(imageUrl);
                    if (imageUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) {
                        validImageUrl = imageUrl;
                    }
                } catch (e) {
                    // Invalid URL, ignore
                }
            }

            // Create professional trade embed
            const tradeEmbed = new EmbedBuilder()
                .setTitle('💱 NEW TRADE OFFER')
                .setDescription(`**Trader:** <@${interaction.user.id}>`)
                .setColor('#2B2D31')
                .setAuthor({ 
                    name: interaction.user.username, 
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) 
                })
                .addFields(
                    { 
                        name: '📦 Offering', 
                        value: offer, 
                        inline: false 
                    },
                    { 
                        name: '🔍 Looking For', 
                        value: want, 
                        inline: false 
                    }
                );

            // Add image if valid
            if (validImageUrl) {
                tradeEmbed.setImage(validImageUrl);
            }

            // Add description if provided
            if (description) {
                tradeEmbed.addFields({
                    name: '📝 Description', 
                    value: description, 
                    inline: false 
                });
            }

            // Add footer with timestamp
            tradeEmbed.setFooter({ 
                text: `ID: ${interaction.user.id.slice(-6)} • Posted: ${new Date().toLocaleTimeString()}`, 
                iconURL: client.user.displayAvatarURL() 
            });

            // Create action buttons with emojis
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`contact_${interaction.user.id}`)
                        .setLabel('💬 Contact Trader')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`cancel_${interaction.user.id}`)
                        .setLabel('❌ Cancel Trade')
                        .setStyle(ButtonStyle.Danger)
                );

            try {
                // Send the trade post to the specific channel
                const tradeChannel = await client.channels.fetch(TRADE_CHANNEL_ID);
                const tradeMessage = await tradeChannel.send({
                    embeds: [tradeEmbed],
                    components: [actionRow]
                });

                // Store trade info
                activeTrades.set(interaction.user.id, {
                    traderId: interaction.user.id,
                    traderUsername: interaction.user.username,
                    want: want,
                    offer: offer,
                    description: description,
                    imageUrl: validImageUrl,
                    channelId: TRADE_CHANNEL_ID,
                    messageId: tradeMessage.id,
                    timestamp: Date.now()
                });

                await interaction.reply({
                    content: '✅ **Trade created successfully!** Your post is now live.',
                    ephemeral: true
                });

            } catch (error) {
                console.error('Error creating trade post:', error);
                await interaction.reply({
                    content: '❌ **Failed to create trade post.** Please try again.',
                    ephemeral: true
                });
            }
        }
    }

    // Handle button interactions
    if (interaction.isButton()) {
        const [action, traderId] = interaction.customId.split('_');

        if (action === 'contact') {
            const tradeData = activeTrades.get(traderId);
            
            if (!tradeData) {
                await interaction.reply({ 
                    content: '❌ This trade is no longer active!', 
                    ephemeral: true 
                });
                return;
            }

            if (interaction.user.id === traderId) {
                await interaction.reply({ 
                    content: '❌ You cannot contact yourself!', 
                    ephemeral: true 
                });
                return;
            }

            try {
                // DM the trader
                const trader = await client.users.fetch(traderId);
                const traderEmbed = new EmbedBuilder()
                    .setTitle('🤝 Trade Interest')
                    .setDescription(`**${interaction.user.username}** is interested in your trade!`)
                    .setColor('#57F287')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 128 }))
                    .addFields(
                        { 
                            name: '👤 Interested User', 
                            value: `${interaction.user.username} (${interaction.user})`, 
                            inline: true 
                        },
                        { 
                            name: '💱 Trade Details', 
                            value: `**Offering:** ${tradeData.offer}\n**Looking For:** ${tradeData.want}`, 
                            inline: true 
                        }
                    )
                    .setFooter({ 
                        text: 'Trade System', 
                        iconURL: client.user.displayAvatarURL() 
                    })
                    .setTimestamp();

                await trader.send({
                    content: `## 💬 New Trade Interest!\nSomeone is interested in your trade:`,
                    embeds: [traderEmbed]
                });

                // DM the interested user
                const interestedEmbed = new EmbedBuilder()
                    .setTitle('🤝 Trade Connection')
                    .setDescription(`You contacted **${tradeData.traderUsername}** about their trade!`)
                    .setColor('#57F287')
                    .setThumbnail(tradeData.imageUrl || interaction.user.displayAvatarURL({ dynamic: true, size: 128 }))
                    .addFields(
                        { 
                            name: '👤 Trader', 
                            value: `${tradeData.traderUsername} (${trader})`, 
                            inline: true 
                        },
                        { 
                            name: '💱 Trade Details', 
                            value: `**Offering:** ${tradeData.offer}\n**Looking For:** ${tradeData.want}`, 
                            inline: true 
                        }
                    )
                    .setFooter({ 
                        text: 'Trade System', 
                        iconURL: client.user.displayAvatarURL() 
                    })
                    .setTimestamp();

                await interaction.user.send({
                    content: `## 💬 Trade Connection Established!\nYou can now communicate with the trader:`,
                    embeds: [interestedEmbed]
                });

                await interaction.reply({ 
                    content: '✅ Check your DMs! You and the trader have been notified.', 
                    ephemeral: true 
                });

            } catch (error) {
                console.error('DM Error:', error);
                await interaction.reply({ 
                    content: '❌ Unable to send DMs. Please make sure both users have DMs enabled.', 
                    ephemeral: true 
                });
            }
        }

        if (action === 'cancel') {
            if (interaction.user.id !== traderId) {
                await interaction.reply({ 
                    content: '❌ You can only cancel your own trades!', 
                    ephemeral: true 
                });
                return;
            }

            const tradeData = activeTrades.get(traderId);
            if (!tradeData) {
                await interaction.reply({ 
                    content: '❌ This trade is no longer active!', 
                    ephemeral: true 
                });
                return;
            }

            // Remove the trade
            activeTrades.delete(traderId);

            // Update the message to show it's cancelled
            try {
                const channel = await client.channels.fetch(tradeData.channelId);
                const message = await channel.messages.fetch(tradeData.messageId);
                
                const cancelledEmbed = new EmbedBuilder()
                    .setTitle('❌ TRADE CANCELLED')
                    .setDescription(`**Trader:** <@${tradeData.traderId}>`)
                    .setColor('#ED4245')
                    .setAuthor({ 
                        name: tradeData.traderUsername, 
                        iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) 
                    })
                    .addFields(
                        { 
                            name: '📦 Offering', 
                            value: tradeData.offer, 
                            inline: false 
                        },
                        { 
                            name: '🔍 Looking For', 
                            value: tradeData.want, 
                            inline: false 
                        }
                    );

                // Add image if it existed
                if (tradeData.imageUrl) {
                    cancelledEmbed.setImage(tradeData.imageUrl);
                }

                // Add description if it existed
                if (tradeData.description) {
                    cancelledEmbed.addFields({
                        name: '📝 Description', 
                        value: tradeData.description, 
                        inline: false 
                    });
                }

                cancelledEmbed.setFooter({ 
                    text: `Cancelled at ${new Date().toLocaleTimeString()}`, 
                    iconURL: client.user.displayAvatarURL() 
                });

                await message.edit({
                    embeds: [cancelledEmbed],
                    components: []
                });

                await interaction.reply({ 
                    content: '✅ Your trade has been cancelled!', 
                    ephemeral: true 
                });

            } catch (error) {
                console.error('Cancel Error:', error);
                await interaction.reply({ 
                    content: '✅ Trade cancelled!', 
                    ephemeral: true 
                });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
