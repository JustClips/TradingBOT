require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');

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

client.once(Events.ClientReady, () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
});

// Register slash commands
client.on(Events.ClientReady, async () => {
    try {
        const commands = [
            {
                name: 'trade',
                description: 'Create a new trade post',
            },
        ];

        await client.application.commands.set(commands);
        console.log('✅ Slash commands registered');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Handle slash command
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'trade') {
            // Create modal for trade creation
            const modal = new ModalBuilder()
                .setCustomId('tradeModal')
                .setTitle('Create Trade Post');

            // What they want field
            const wantInput = new TextInputBuilder()
                .setCustomId('wantInput')
                .setLabel('What do you want?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Enter what you want to receive');

            // What they offer field
            const offerInput = new TextInputBuilder()
                .setCustomId('offerInput')
                .setLabel('What do you offer?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Enter what you want to trade');

            // Description field
            const descriptionInput = new TextInputBuilder()
                .setCustomId('descriptionInput')
                .setLabel('Description (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setPlaceholder('Add any additional details about your trade');

            // Add components to modal
            const firstActionRow = new ActionRowBuilder().addComponents(wantInput);
            const secondActionRow = new ActionRowBuilder().addComponents(offerInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(descriptionInput);

            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

            await interaction.showModal(modal);
        }
    }

    // Handle modal submission
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'tradeModal') {
            const want = interaction.fields.getTextInputValue('wantInput');
            const offer = interaction.fields.getTextInputValue('offerInput');
            const description = interaction.fields.getTextInputValue('descriptionInput') || 'No description provided';

            // Create trade embed
            const tradeEmbed = new EmbedBuilder()
                .setTitle('🔄 New Trade Offer')
                .setDescription(`**Trader:** <@${interaction.user.id}>`)
                .addFields(
                    { name: '💎 Wants', value: want, inline: true },
                    { name: '📦 Offers', value: offer, inline: true },
                    { name: '📝 Description', value: description, inline: false },
                    { name: '🕒 Posted', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
                )
                .setColor('#00ff00')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: `Trade ID: ${interaction.user.id}`, iconURL: interaction.user.displayAvatarURL() });

            // Create action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`contact_${interaction.user.id}`)
                        .setLabel('🤝 Contact Trader')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`cancel_${interaction.user.id}`)
                        .setLabel('❌ Cancel Trade')
                        .setStyle(ButtonStyle.Danger)
                );

            // Send the trade post
            const tradeMessage = await interaction.reply({
                content: '✅ Trade post created successfully!',
                embeds: [tradeEmbed],
                components: [actionRow],
                ephemeral: true
            });

            // Store trade info
            activeTrades.set(interaction.user.id, {
                traderId: interaction.user.id,
                traderUsername: interaction.user.username,
                want: want,
                offer: offer,
                description: description,
                channelId: interaction.channelId,
                messageId: (await interaction.fetchReply()).id,
                timestamp: Date.now()
            });
        }
    }

    // Handle button interactions
    if (interaction.isButton()) {
        const [action, traderId] = interaction.customId.split('_');

        if (action === 'contact') {
            const tradeData = activeTrades.get(traderId);
            
            if (!tradeData) {
                await interaction.reply({ content: '❌ This trade is no longer active!', ephemeral: true });
                return;
            }

            if (interaction.user.id === traderId) {
                await interaction.reply({ content: '❌ You cannot contact yourself!', ephemeral: true });
                return;
            }

            try {
                // DM the trader
                const trader = await client.users.fetch(traderId);
                const traderEmbed = new EmbedBuilder()
                    .setTitle('🤝 Trade Contact')
                    .setDescription(`**${interaction.user.username}** is interested in your trade!`)
                    .addFields(
                        { name: 'Their Username', value: interaction.user.username, inline: true },
                        { name: 'Trade Details', value: `Wants: ${tradeData.want}\nOffers: ${tradeData.offer}`, inline: true }
                    )
                    .setColor('#00ff00')
                    .setFooter({ text: 'You can now communicate with this user' });

                await trader.send({
                    content: `Hello! Someone is interested in your trade:`,
                    embeds: [traderEmbed]
                });

                // DM the interested user
                const interestedEmbed = new EmbedBuilder()
                    .setTitle('🤝 Trade Contact')
                    .setDescription(`You contacted **${tradeData.traderUsername}** about their trade!`)
                    .addFields(
                        { name: 'Trader', value: tradeData.traderUsername, inline: true },
                        { name: 'Trade Details', value: `Wants: ${tradeData.want}\nOffers: ${tradeData.offer}`, inline: true }
                    )
                    .setColor('#00ff00')
                    .setFooter({ text: 'You can now communicate with this user' });

                await interaction.user.send({
                    content: `Hello! Here's the trader's information:`,
                    embeds: [interestedEmbed]
                });

                await interaction.reply({ content: '✅ Check your DMs! You and the trader have been notified.', ephemeral: true });

            } catch (error) {
                console.error('DM Error:', error);
                await interaction.reply({ content: '❌ Unable to send DMs. Please make sure both users have DMs enabled.', ephemeral: true });
            }
        }

        if (action === 'cancel') {
            if (interaction.user.id !== traderId) {
                await interaction.reply({ content: '❌ You can only cancel your own trades!', ephemeral: true });
                return;
            }

            const tradeData = activeTrades.get(traderId);
            if (!tradeData) {
                await interaction.reply({ content: '❌ This trade is no longer active!', ephemeral: true });
                return;
            }

            // Remove the trade
            activeTrades.delete(traderId);

            // Update the message to show it's cancelled
            try {
                const channel = await client.channels.fetch(tradeData.channelId);
                const message = await channel.messages.fetch(tradeData.messageId);
                
                const cancelledEmbed = new EmbedBuilder()
                    .setTitle('❌ Trade Cancelled')
                    .setDescription(`**Trader:** <@${tradeData.traderId}>`)
                    .addFields(
                        { name: '💎 Wanted', value: tradeData.want, inline: true },
                        { name: '📦 Offered', value: tradeData.offer, inline: true },
                        { name: '📝 Description', value: tradeData.description, inline: false },
                        { name: '🕒 Posted', value: `<t:${Math.floor(tradeData.timestamp / 1000)}:R>`, inline: false },
                        { name: '🛑 Cancelled', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
                    )
                    .setColor('#ff0000')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: 'This trade has been cancelled' });

                await message.edit({
                    embeds: [cancelledEmbed],
                    components: []
                });

                await interaction.reply({ content: '✅ Your trade has been cancelled!', ephemeral: true });

            } catch (error) {
                console.error('Cancel Error:', error);
                await interaction.reply({ content: '✅ Trade cancelled! (Note: Could not update the original message)', ephemeral: true });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
