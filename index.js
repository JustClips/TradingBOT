require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

console.log('🚀 Bot starting...');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

// Store active trades, reviews, and tickets
const activeTrades = new Map();
const userReviews = new Map(); // userId -> reviewMessageId
const activeTickets = new Map(); // channelId -> {userId, ownerId}
const TRADE_CHANNEL_ID = '1410622424029855867';
const SUGGESTION_CHANNEL_ID = '1410693106608902216';
const REVIEW_CHANNEL_ID = '1410697592475488338';
const TICKET_PANEL_CHANNEL_ID = '1410983240428163251'; // Where panel is shown
const TICKET_CREATION_CATEGORY_ID = '1410983107279978567'; // Where tickets are created
const OWNER_USER_ID = 'YOUR_OWNER_ID_HERE'; // Replace with actual owner ID

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    
    // Register slash commands
    try {
        const commands = [
            {
                name: 'setup-ticket-panel',
                description: 'Create ticket panel (Admin only)',
                defaultMemberPermissions: PermissionFlagsBits.Administrator
            },
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
            },
            {
                name: 'suggest',
                description: 'Submit a suggestion',
            },
            {
                name: 'suggestboard',
                description: 'View the suggestion leaderboard',
            },
            {
                name: 'review',
                description: 'Leave a review for the script',
            },
            {
                name: 'reviewboard',
                description: 'View all reviews',
            }
        ];

        await client.application.commands.set(commands);
        console.log('✅ Slash commands registered');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    
    // Start message cleanup for all channels
    startMessageCleanup();
});

// Message cleanup function - instant deletion
client.on(Events.MessageCreate, async (message) => {
    try {
        // Delete non-bot messages in all protected channels immediately
        const protectedChannels = [TRADE_CHANNEL_ID, SUGGESTION_CHANNEL_ID, REVIEW_CHANNEL_ID, TICKET_PANEL_CHANNEL_ID];
        if (protectedChannels.includes(message.channelId) && !message.author.bot) {
            try {
                await message.delete();
            } catch (error) {
                // Ignore errors
            }
        }
    } catch (error) {
        console.error('Message cleanup error:', error);
    }
});

// Handle reaction updates for suggestions
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.message.channelId === SUGGESTION_CHANNEL_ID && reaction.emoji.name === '⭐') {
        try {
            await updateSuggestionVoteCount(reaction.message);
        } catch (error) {
            console.error('Reaction add error:', error);
        }
    }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (reaction.message.channelId === SUGGESTION_CHANNEL_ID && reaction.emoji.name === '⭐') {
        try {
            await updateSuggestionVoteCount(reaction.message);
        } catch (error) {
            console.error('Reaction remove error:', error);
        }
    }
});

// Update suggestion vote count
async function updateSuggestionVoteCount(message) {
    try {
        if (message.partial) await message.fetch();
        
        const starCount = message.reactions.cache.get('⭐') ? message.reactions.cache.get('⭐').count : 0;
        
        if (message.embeds.length > 0 && message.embeds[0].title === '💡 New Suggestion') {
            const embed = message.embeds[0];
            
            const updatedEmbed = new EmbedBuilder()
                .setTitle(embed.title)
                .setColor(embed.color)
                .setAuthor(embed.author)
                .addFields(
                    { name: 'Suggestion', value: embed.fields[0].value, inline: false },
                    { name: 'Submitted', value: embed.fields[1].value, inline: true },
                    { name: 'Votes', value: `\`${starCount} ⭐\``, inline: true }
                )
                .setFooter(embed.footer)
                .setTimestamp(embed.timestamp);

            await message.edit({ embeds: [updatedEmbed] });
        }
    } catch (error) {
        // Don't log this error as it's common for messages to be deleted
    }
}

// Start periodic cleanup for any missed messages
function startMessageCleanup() {
    setInterval(async () => {
        try {
            const protectedChannels = [TRADE_CHANNEL_ID, SUGGESTION_CHANNEL_ID, REVIEW_CHANNEL_ID, TICKET_PANEL_CHANNEL_ID];
            
            for (const channelId of protectedChannels) {
                try {
                    const channel = await client.channels.fetch(channelId);
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
                    // Ignore channel fetch errors
                }
            }
        } catch (error) {
            console.error('Periodic cleanup error:', error);
        }
    }, 5000); // Check every 5 seconds
}

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommands(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmissions(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteractions(interaction);
        }
    } catch (error) {
        console.error('Interaction error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request. Please try again.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
        }
    }
});

// Handle slash commands
async function handleSlashCommands(interaction) {
    // Admin command to setup ticket panel
    if (interaction.commandName === 'setup-ticket-panel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ 
                content: '❌ You need administrator permissions to use this command.', 
                ephemeral: true 
            });
            return;
        }

        // Check if command is used in the correct channel
        if (interaction.channelId !== TICKET_PANEL_CHANNEL_ID) {
            await interaction.reply({ 
                content: `⚠️ This command can only be used in <#${TICKET_PANEL_CHANNEL_ID}>`, 
                ephemeral: true 
            });
            return;
        }

        // Create ticket panel embed
        const panelEmbed = new EmbedBuilder()
            .setTitle('🎫 Support Ticket System')
            .setDescription('Need help or want to contact the server owner? Click the button below to create a private ticket.')
            .setColor('#5865F2')
            .addFields(
                { name: '📋 How it works', value: '• Click the button to create a private ticket\n• Describe your issue or request\n• Wait for staff/owner response\n• Ticket will be closed when resolved', inline: false },
                { name: '⚠️ Important', value: '• Abuse will result in permanent ban\n• Provide clear and detailed information\n• Be respectful to staff members', inline: false }
            )
            .setFooter({ text: 'Ticket System', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        // Create action button
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('createTicket')
                    .setLabel('📧 Create Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫')
            );

        try {
            await interaction.channel.send({
                embeds: [panelEmbed],
                components: [actionRow]
            });

            await interaction.reply({
                content: '✅ Ticket panel created successfully!',
                ephemeral: true
            });

        } catch (error) {
            console.error('Error creating ticket panel:', error);
            await interaction.reply({
                content: '❌ Failed to create ticket panel. Make sure the bot has proper permissions.',
                ephemeral: true
            });
        }
        return;
    }

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

    // Suggestion command
    if (interaction.commandName === 'suggest') {
        // Check if command is used in the correct channel
        if (interaction.channelId !== SUGGESTION_CHANNEL_ID) {
            await interaction.reply({ 
                content: `⚠️ This command can only be used in <#${SUGGESTION_CHANNEL_ID}>`, 
                ephemeral: true 
            });
            return;
        }

        // Create modal for suggestion
        const modal = new ModalBuilder()
            .setCustomId('suggestionModal')
            .setTitle('Submit Suggestion')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('suggestionInput')
                        .setLabel('Your Suggestion')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setPlaceholder('What would you like to suggest?')
                        .setMaxLength(1000)
                        .setMinLength(10)
                )
            );

        await interaction.showModal(modal);
    }

    // Review command
    if (interaction.commandName === 'review') {
        // Check if command is used in the correct channel
        if (interaction.channelId !== REVIEW_CHANNEL_ID) {
            await interaction.reply({ 
                content: `⚠️ This command can only be used in <#${REVIEW_CHANNEL_ID}>`, 
                ephemeral: true 
            });
            return;
        }

        // Check if user already has a review
        if (userReviews.has(interaction.user.id)) {
            await interaction.reply({ 
                content: '❌ You have already submitted a review. Each user can only submit one review.', 
                ephemeral: true 
            });
            return;
        }

        // Create modal for review
        const modal = new ModalBuilder()
            .setCustomId('reviewModal')
            .setTitle('Leave a Review')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('ratingInput')
                        .setLabel('Rating (1-5 stars)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('Enter a number between 1-5')
                        .setMaxLength(1)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('titleInput')
                        .setLabel('Review Title')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('Brief summary of your experience')
                        .setMaxLength(100)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reviewInput')
                        .setLabel('Detailed Review')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setPlaceholder('Share your detailed experience...')
                        .setMaxLength(1000)
                        .setMinLength(20)
                )
            );

        await interaction.showModal(modal);
    }

    // Review board command
    if (interaction.commandName === 'reviewboard') {
        // Check if command is used in the correct channel
        if (interaction.channelId !== REVIEW_CHANNEL_ID) {
            await interaction.reply({ 
                content: `⚠️ This command can only be used in <#${REVIEW_CHANNEL_ID}>`, 
                ephemeral: true 
            });
            return;
        }

        try {
            const channel = await client.channels.fetch(REVIEW_CHANNEL_ID);
            const messages = await channel.messages.fetch({ limit: 100 });
            
            // Filter review messages
            const reviews = [];
            for (const [id, message] of messages) {
                if (message.embeds.length > 0 && message.embeds[0].title === '⭐ Script Review') {
                    const embed = message.embeds[0];
                    const ratingField = embed.fields.find(f => f.name === 'Rating');
                    if (ratingField) {
                        const rating = parseInt(ratingField.value.split('/')[0].replace(/[^0-9]/g, '') || '0');
                        reviews.push({
                            message: message,
                            embed: embed,
                            rating: rating,
                            timestamp: message.createdTimestamp
                        });
                    }
                }
            }

            // Sort by rating (descending), then by timestamp (newer first)
            reviews.sort((a, b) => {
                if (b.rating !== a.rating) {
                    return b.rating - a.rating;
                }
                return b.timestamp - a.timestamp;
            });

            if (reviews.length === 0) {
                await interaction.reply({ 
                    content: '❌ No reviews found yet.', 
                    ephemeral: true 
                });
                return;
            }

            // Create review board embed
            const reviewBoardEmbed = new EmbedBuilder()
                .setTitle('📋 Script Review Board')
                .setDescription(`**${reviews.length}** reviews submitted\nAverage Rating: ${calculateAverageRating(reviews)} ⭐`)
                .setColor('#FF6B6B')
                .setFooter({ text: `Review System`, iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            // Add top reviews (max 10)
            const topReviews = reviews.slice(0, 10);
            let reviewText = '';
            
            topReviews.forEach((review, index) => {
                const embed = review.embed;
                const username = embed.author ? embed.author.name : 'Unknown User';
                const titleField = embed.fields.find(f => f.name === 'Title');
                const title = titleField ? titleField.value : 'No title';
                const rating = '⭐'.repeat(review.rating);
                const shortTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
                
                reviewText += `**${index + 1}. ${username}** - ${rating}\n`;
                reviewText += `*${shortTitle}*\n\n`;
            });

            reviewBoardEmbed.setDescription(reviewBoardEmbed.data.description + '\n\n' + reviewText);

            await interaction.reply({ 
                embeds: [reviewBoardEmbed], 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Review board error:', error);
            await interaction.reply({ 
                content: '❌ Failed to load review board.', 
                ephemeral: true 
            });
        }
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

    // Suggestion board command
    if (interaction.commandName === 'suggestboard') {
        // Check if command is used in the correct channel
        if (interaction.channelId !== SUGGESTION_CHANNEL_ID) {
            await interaction.reply({ 
                content: `⚠️ This command can only be used in <#${SUGGESTION_CHANNEL_ID}>`, 
                ephemeral: true 
            });
            return;
        }

        try {
            const channel = await client.channels.fetch(SUGGESTION_CHANNEL_ID);
            const messages = await channel.messages.fetch({ limit: 100 });
            
            // Filter suggestion messages (those with star reactions)
            const suggestions = [];
            for (const [id, message] of messages) {
                if (message.embeds.length > 0 && message.embeds[0].title === '💡 New Suggestion') {
                    const starCount = message.reactions.cache.get('⭐') ? message.reactions.cache.get('⭐').count : 0;
                    suggestions.push({
                        message: message,
                        embed: message.embeds[0],
                        stars: starCount,
                        timestamp: message.createdTimestamp
                    });
                }
            }

            // Sort by stars (descending), then by timestamp (newer first)
            suggestions.sort((a, b) => {
                if (b.stars !== a.stars) {
                    return b.stars - a.stars;
                }
                return b.timestamp - a.timestamp;
            });

            if (suggestions.length === 0) {
                await interaction.reply({ 
                    content: '❌ No suggestions found.', 
                    ephemeral: true 
                });
                return;
            }

            // Create leaderboard embed
            const leaderboardEmbed = new EmbedBuilder()
                .setTitle('🏆 Suggestion Leaderboard')
                .setDescription(`Top suggestions ranked by ⭐ votes`)
                .setColor('#FFD700')
                .setFooter({ text: `Suggestion System`, iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            // Add top suggestions (max 10)
            const topSuggestions = suggestions.slice(0, 10);
            let leaderboardText = '';
            
            topSuggestions.forEach((suggestion, index) => {
                const embed = suggestion.embed;
                const username = embed.author ? embed.author.name : 'Unknown User';
                const suggestionField = embed.fields.find(f => f.name === 'Suggestion');
                const suggestionText = suggestionField ? suggestionField.value : 'No content';
                const shortSuggestion = suggestionText.length > 100 ? suggestionText.substring(0, 100) + '...' : suggestionText;
                
                const positionEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                
                leaderboardText += `${positionEmoji} **${username}** - ${suggestion.stars} ⭐\n`;
                leaderboardText += `> ${shortSuggestion}\n\n`;
            });

            leaderboardEmbed.setDescription(leaderboardText || 'No suggestions available.');

            await interaction.reply({ 
                embeds: [leaderboardEmbed], 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Suggestion board error:', error);
            await interaction.reply({ 
                content: '❌ Failed to load suggestion leaderboard.', 
                ephemeral: true 
            });
        }
    }
}

// Handle modal submissions
async function handleModalSubmissions(interaction) {
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

    // Handle suggestion modal submission
    if (interaction.customId === 'suggestionModal') {
        const suggestionText = interaction.fields.getTextInputValue('suggestionInput');

        // Create suggestion embed
        const suggestionEmbed = new EmbedBuilder()
            .setTitle('💡 New Suggestion')
            .setColor('#5865F2')
            .setAuthor({ 
                name: interaction.user.username, 
                iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) 
            })
            .addFields(
                { 
                    name: 'Suggestion', 
                    value: suggestionText, 
                    inline: false 
                },
                { 
                    name: 'Submitted', 
                    value: `<t:${Math.floor(Date.now() / 1000)}:f>`, 
                    inline: true 
                },
                { 
                    name: 'Votes', 
                    value: '`0 ⭐`', 
                    inline: true 
                }
            )
            .setFooter({ 
                text: `Suggestion ID: ${interaction.user.id.slice(-6)}`, 
                iconURL: client.user.displayAvatarURL() 
            })
            .setTimestamp();

        try {
            // Send the suggestion to the suggestion channel
            const suggestionChannel = await client.channels.fetch(SUGGESTION_CHANNEL_ID);
            const suggestionMessage = await suggestionChannel.send({
                embeds: [suggestionEmbed]
            });

            // Add initial star reaction
            await suggestionMessage.react('⭐');

            await interaction.reply({
                content: '✅ **Suggestion submitted successfully!** Community members can now vote with ⭐ reactions.',
                ephemeral: true
            });

        } catch (error) {
            console.error('Error creating suggestion:', error);
            await interaction.reply({
                content: '❌ **Failed to submit suggestion.** Please try again.',
                ephemeral: true
            });
        }
    }

    // Handle review modal submission
    if (interaction.customId === 'reviewModal') {
        const ratingInput = interaction.fields.getTextInputValue('ratingInput');
        const title = interaction.fields.getTextInputValue('titleInput');
        const reviewText = interaction.fields.getTextInputValue('reviewInput');

        // Validate rating
        const rating = parseInt(ratingInput);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            await interaction.reply({
                content: '❌ **Invalid rating!** Please enter a number between 1-5.',
                ephemeral: true
            });
            return;
        }

        // Create review embed
        const reviewEmbed = new EmbedBuilder()
            .setTitle('⭐ Script Review')
            .setColor('#FF6B6B')
            .setAuthor({ 
                name: interaction.user.username, 
                iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }) 
            })
            .addFields(
                { 
                    name: 'Title', 
                    value: title, 
                    inline: false 
                },
                { 
                    name: 'Review', 
                    value: reviewText, 
                    inline: false 
                },
                { 
                    name: 'Rating', 
                    value: `${'⭐'.repeat(rating)} (${rating}/5)`, 
                    inline: true 
                },
                { 
                    name: 'Submitted', 
                    value: `<t:${Math.floor(Date.now() / 1000)}:f>`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: `Review by ${interaction.user.username}`, 
                iconURL: client.user.displayAvatarURL() 
            })
            .setTimestamp();

        try {
            // Send the review to the review channel
            const reviewChannel = await client.channels.fetch(REVIEW_CHANNEL_ID);
            const reviewMessage = await reviewChannel.send({
                embeds: [reviewEmbed]
            });

            // Store user's review (one per user)
            userReviews.set(interaction.user.id, reviewMessage.id);

            await interaction.reply({
                content: '✅ **Review submitted successfully!** Thank you for your feedback.',
                ephemeral: true
            });

        } catch (error) {
            console.error('Error creating review:', error);
            await interaction.reply({
                content: '❌ **Failed to submit review.** Please try again.',
                ephemeral: true
            });
        }
    }

    // Handle ticket modal submission - FIXED VERSION
    if (interaction.customId === 'ticketModal') {
        const subject = interaction.fields.getTextInputValue('subjectInput');
        const description = interaction.fields.getTextInputValue('descriptionInput');

        try {
            // Validate inputs
            if (!subject || subject.trim().length === 0) {
                await interaction.reply({
                    content: '❌ Subject is required.',
                    ephemeral: true
                });
                return;
            }

            if (!description || description.trim().length === 0) {
                await interaction.reply({
                    content: '❌ Description is required.',
                    ephemeral: true
                });
                return;
            }

            // Create private ticket channel
            const guild = interaction.guild;
            const ticketChannel = await guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: TICKET_CREATION_CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageMessages
                        ],
                    },
                    {
                        id: OWNER_USER_ID,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ],
                    }
                ],
            });

            // Store ticket info
            activeTickets.set(ticketChannel.id, {
                userId: interaction.user.id,
                ownerId: OWNER_USER_ID,
                subject: subject,
                timestamp: Date.now()
            });

            // Create ticket embed
            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 Support Ticket')
                .setDescription(`**Created by:** <@${interaction.user.id}>\n**Subject:** ${subject}`)
                .setColor('#5865F2')
                .addFields(
                    { name: 'Description', value: description, inline: false },
                    { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                    { name: 'Status', value: '🟢 Open', inline: true }
                )
                .setFooter({ text: `Ticket ID: ${ticketChannel.id.slice(-6)}`, iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            // Create action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`closeTicket_${ticketChannel.id}`)
                        .setLabel('🔒 Close Ticket')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`contactOwner_${ticketChannel.id}`)
                        .setLabel('👤 Contact Owner')
                        .setStyle(ButtonStyle.Primary)
                );

            // Send ticket message
            await ticketChannel.send({
                content: `<@${interaction.user.id}> <@${OWNER_USER_ID}>`,
                embeds: [ticketEmbed],
                components: [actionRow]
            });

            // Send confirmation to user
            await interaction.reply({
                content: `✅ **Ticket created successfully!** Please check <#${ticketChannel.id}> to continue.`,
                ephemeral: true
            });

            // Send agreement message in ticket channel
            const agreementEmbed = new EmbedBuilder()
                .setTitle('⚠️ Ticket Agreement')
                .setDescription('**Please read and agree to the following:**\n\n• This ticket is for legitimate support only\n• Abuse of this system will result in a permanent ban\n• Provide clear and detailed information\n• Be respectful to staff members')
                .setColor('#FFA500')
                .addFields(
                    { name: 'Do you agree to these terms?', value: 'Click the button below to confirm' }
                )
                .setFooter({ text: 'Ticket System', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            const agreementRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`agreeTicket_${ticketChannel.id}`)
                        .setLabel('✅ I Agree')
                        .setStyle(ButtonStyle.Success)
                );

            await ticketChannel.send({
                embeds: [agreementEmbed],
                components: [agreementRow]
            });

        } catch (error) {
            console.error('Error creating ticket:', error);
            await interaction.reply({
                content: '❌ **Failed to create ticket.** Please try again. Error: ' + error.message,
                ephemeral: true
            });
        }
    }
}

// Handle button interactions
async function handleButtonInteractions(interaction) {
    // Handle ticket panel button
    if (interaction.customId === 'createTicket') {
        // Check if button is used in the correct channel
        if (interaction.channelId !== TICKET_PANEL_CHANNEL_ID) {
            await interaction.reply({ 
                content: `⚠️ This button can only be used in <#${TICKET_PANEL_CHANNEL_ID}>`, 
                ephemeral: true 
            });
            return;
        }

        // Create modal for ticket creation
        const modal = new ModalBuilder()
            .setCustomId('ticketModal')
            .setTitle('Create Ticket')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('subjectInput')
                        .setLabel('Subject')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('Brief subject of your ticket')
                        .setMaxLength(100)
                        .setMinLength(1)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('descriptionInput')
                        .setLabel('Description')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setPlaceholder('Describe what you need help with...')
                        .setMaxLength(1000)
                        .setMinLength(10)
                )
            );

        await interaction.showModal();
        return;
    }

    // Handle trade buttons
    const actionId = interaction.customId.split('_');
    const action = actionId[0];
    const id = actionId[1];

    if (action === 'contact' || action === 'cancel') {
        const traderId = id;
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

    // Handle ticket buttons
    if (action === 'closeTicket') {
        const channelId = id;
        const ticketData = activeTickets.get(channelId);
        
        if (!ticketData) {
            await interaction.reply({ 
                content: '❌ This ticket is no longer active!', 
                ephemeral: true 
            });
            return;
        }

        try {
            const channel = await client.channels.fetch(channelId);
            
            // Update ticket embed to show closed status
            const messages = await channel.messages.fetch({ limit: 100 });
            const ticketMessage = messages.find(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '🎫 Support Ticket'
            );

            if (ticketMessage) {
                const embed = ticketMessage.embeds[0];
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(embed.title)
                    .setDescription(embed.description)
                    .setColor('#ED4245')
                    .addFields(
                        { name: 'Description', value: embed.fields[0].value, inline: false },
                        { name: 'Created', value: embed.fields[1].value, inline: true },
                        { name: 'Status', value: '🔴 Closed', inline: true }
                    )
                    .setFooter(embed.footer)
                    .setTimestamp(embed.timestamp);

                await ticketMessage.edit({
                    embeds: [updatedEmbed],
                    components: []
                });
            }

            // Remove ticket from active tickets
            activeTickets.delete(channelId);

            // Delete channel after delay
            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);

            await interaction.reply({ 
                content: '✅ Ticket will be closed in 5 seconds.', 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Close ticket error:', error);
            await interaction.reply({ 
                content: '❌ Failed to close ticket.', 
                ephemeral: true 
            });
        }
    }

    if (action === 'contactOwner') {
        const channelId = id;
        const ticketData = activeTickets.get(channelId);
        
        if (!ticketData) {
            await interaction.reply({ 
                content: '❌ This ticket is no longer active!', 
                ephemeral: true 
            });
            return;
        }

        try {
            const channel = await client.channels.fetch(channelId);
            const owner = await client.users.fetch(ticketData.ownerId);
            
            await channel.send({
                content: `🔔 <@${ticketData.ownerId}> has been pinged by <@${interaction.user.id}>`
            });

            await interaction.reply({ 
                content: '✅ Owner has been notified!', 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Contact owner error:', error);
            await interaction.reply({ 
                content: '❌ Failed to contact owner.', 
                ephemeral: true 
            });
        }
    }

    if (action === 'agreeTicket') {
        const channelId = id;
        const ticketData = activeTickets.get(channelId);
        
        if (!ticketData) {
            await interaction.reply({ 
                content: '❌ This ticket is no longer active!', 
                ephemeral: true 
            });
            return;
        }

        try {
            const channel = await client.channels.fetch(channelId);
            
            await interaction.reply({ 
                content: '✅ Thank you for agreeing to the terms. You can now proceed with your support request.', 
                ephemeral: true 
            });

            // Update agreement message
            const messages = await channel.messages.fetch({ limit: 10 });
            const agreementMessage = messages.find(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '⚠️ Ticket Agreement'
            );

            if (agreementMessage) {
                const embed = agreementMessage.embeds[0];
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('✅ Agreement Accepted')
                    .setDescription(embed.description.replace('Please read and agree to the following:', '✅ Agreement accepted by user'))
                    .setColor('#57F287')
                    .setFooter({ text: 'Ticket System', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                await agreementMessage.edit({
                    embeds: [updatedEmbed],
                    components: []
                });
            }

        } catch (error) {
            console.error('Agree ticket error:', error);
            await interaction.reply({ 
                content: '❌ Failed to process agreement.', 
                ephemeral: true 
            });
        }
    }
}

// Helper function to calculate average rating
function calculateAverageRating(reviews) {
    if (reviews.length === 0) return '0.0';
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    const average = total / reviews.length;
    return average.toFixed(1);
}

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

client.login(process.env.DISCORD_TOKEN);
