require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from Render environment variables
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OWNER_USER_ID = process.env.OWNER_USER_ID || 'pinkcorset';
const RENDER_SERVICE_NAME = process.env.RENDER_SERVICE_NAME || 'discord-template-creator';

// Create logs directory
const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
}

// Logging function
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    
    // Also write to log file
    const logFile = path.join(LOGS_DIR, `deployment-${Date.now()}.log`);
    fs.appendFileSync(logFile, logMessage + '\n');
    
    return logMessage;
}

class DiscordTemplateCreator {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildEmojisAndStickers
            ]
        });
        this.templateData = null;
        this.guildName = 'Unknown Server';
        this.deploymentStartTime = Date.now();
    }

    async initialize() {
        try {
            log('🤖 Initializing Discord Template Creator by @pinkcorset');
            log('===========================================');
            
            // Validate environment variables
            if (!DISCORD_TOKEN) {
                throw new Error('DISCORD_TOKEN environment variable is required');
            }
            
            if (!TARGET_GUILD_ID) {
                throw new Error('TARGET_GUILD_ID environment variable is required');
            }

            log(`🎯 Target Server ID: ${TARGET_GUILD_ID}`);
            log(`👤 Owner: @${OWNER_USER_ID}`);
            log(`🚀 Deployment started at: ${new Date(this.deploymentStartTime).toISOString()}`);
            
            // Login to Discord
            await this.client.login(DISCORD_TOKEN);
            log('✅ Successfully logged in to Discord');
            
            // Wait for client to be ready
            await new Promise(resolve => this.client.once('ready', resolve));
            log('✅ Discord client is ready');
            
            return true;
        } catch (error) {
            log(`❌ Initialization failed: ${error.message}`);
            throw error;
        }
    }

    async fetchGuildData() {
        try {
            log(`🔍 Fetching data for guild: ${TARGET_GUILD_ID}`);
            
            const guild = this.client.guilds.cache.get(TARGET_GUILD_ID);
            if (!guild) {
                throw new Error(`Cannot access guild with ID: ${TARGET_GUILD_ID}. Make sure the bot is in the server.`);
            }

            this.guildName = guild.name;
            log(`🏰 Server found: "${this.guildName}"`);
            
            // Fetch guild with all channels
            await guild.fetch();
            await guild.channels.fetch();
            await guild.roles.fetch();
            await guild.emojis.fetch();
            
            log(`📊 Server statistics:`);
            log(`   👥 Members: ${guild.memberCount}`);
            log(`   📁 Categories: ${guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size}`);
            log(`   💬 Text Channels: ${guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size}`);
            log(`   🔊 Voice Channels: ${guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size}`);
            log(`   🎭 Roles: ${guild.roles.cache.size - 1}`); // Excluding @everyone
            log(`   😀 Emojis: ${guild.emojis.cache.size}`);

            return guild;
        } catch (error) {
            log(`❌ Failed to fetch guild data: ${error.message}`);
            throw error;
        }
    }

    async createTemplate(guild) {
        try {
            log('🛠️ Creating server template...');
            
            const template = {
                metadata: {
                    created_at: new Date().toISOString(),
                    guild_id: guild.id,
                    guild_name: guild.name,
                    description: `Template created by @${OWNER_USER_ID} on Render.com`,
                    note: `Educational template creation by @pinkcorset | RENDER: ${RENDER_SERVICE_NAME}`,
                    icon: guild.iconURL(),
                    owner: guild.ownerId,
                    member_count: guild.memberCount,
                    deployment_id: process.env.RENDER_GIT_COMMIT || `render-${Date.now()}`,
                    created_by: `@${OWNER_USER_ID}`
                },
                channels: {
                    categories: [],
                    text_channels: [],
                    voice_channels: [],
                    forum_channels: [],
                    announcement_channels: []
                },
                roles: [],
                emojis: [],
                settings: {
                    verification_level: guild.verificationLevel,
                    default_message_notifications: guild.defaultMessageNotifications,
                    explicit_content_filter: guild.explicitContentFilter,
                    features: guild.features,
                    premium_tier: guild.premiumTier,
                    premium_subscription_count: guild.premiumSubscriptionCount,
                    preferred_locale: guild.preferredLocale,
                    afk_timeout: guild.afkTimeout,
                    afk_channel_id: guild.afkChannelId,
                    system_channel_id: guild.systemChannelId,
                    rules_channel_id: guild.rulesChannelId,
                    public_updates_channel_id: guild.publicUpdatesChannelId
                }
            };

            // Process categories
            const categories = guild.channels.cache
                .filter(c => c.type === ChannelType.GuildCategory)
                .sort((a, b) => a.position - b.position);

            for (const category of categories.values()) {
                const categoryData = {
                    id: category.id,
                    name: category.name,
                    position: category.position,
                    permissions: this.extractPermissionOverwrites(category),
                    children: {
                        text_channels: [],
                        voice_channels: [],
                        forum_channels: [],
                        announcement_channels: []
                    }
                };

                // Get channels in this category
                const categoryChannels = guild.channels.cache
                    .filter(c => c.parentId === category.id)
                    .sort((a, b) => a.position - b.position);

                for (const channel of categoryChannels.values()) {
                    const channelData = this.extractChannelData(channel);
                    switch (channel.type) {
                        case ChannelType.GuildText:
                            categoryData.children.text_channels.push(channelData);
                            break;
                        case ChannelType.GuildVoice:
                            categoryData.children.voice_channels.push(channelData);
                            break;
                        case ChannelType.GuildForum:
                            categoryData.children.forum_channels.push(channelData);
                            break;
                        case ChannelType.GuildAnnouncement:
                            categoryData.children.announcement_channels.push(channelData);
                            break;
                    }
                }

                template.channels.categories.push(categoryData);
            }

            // Process uncategorized channels
            const uncategorizedChannels = guild.channels.cache
                .filter(c => !c.parentId && c.type !== ChannelType.GuildCategory)
                .sort((a, b) => a.position - b.position);

            for (const channel of uncategorizedChannels.values()) {
                const channelData = this.extractChannelData(channel);
                switch (channel.type) {
                    case ChannelType.GuildText:
                        template.channels.text_channels.push(channelData);
                        break;
                    case ChannelType.GuildVoice:
                        template.channels.voice_channels.push(channelData);
                        break;
                    case ChannelType.GuildForum:
                        template.channels.forum_channels.push(channelData);
                        break;
                    case ChannelType.GuildAnnouncement:
                        template.channels.announcement_channels.push(channelData);
                        break;
                }
            }

            // Process roles (excluding @everyone)
            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id)
                .sort((a, b) => b.position - a.position);

            for (const role of roles.values()) {
                template.roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    position: role.position,
                    permissions: role.permissions.bitfield.toString(),
                    mentionable: role.mentionable,
                    managed: role.managed,
                    icon: role.icon,
                    unicode_emoji: role.unicodeEmoji
                });
            }

            // Process emojis
            for (const emoji of guild.emojis.cache.values()) {
                template.emojis.push({
                    id: emoji.id,
                    name: emoji.name,
                    animated: emoji.animated,
                    available: emoji.available,
                    managed: emoji.managed,
                    requires_colons: emoji.requiresColons,
                    roles: emoji.roles?.map(r => r.id) || []
                });
            }

            this.templateData = template;
            
            const totalChannels = 
                template.channels.categories.reduce((sum, cat) => 
                    sum + cat.children.text_channels.length + 
                    cat.children.voice_channels.length + 
                    cat.children.forum_channels.length + 
                    cat.children.announcement_channels.length, 0) +
                template.channels.text_channels.length +
                template.channels.voice_channels.length +
                template.channels.forum_channels.length +
                template.channels.announcement_channels.length;

            log(`✅ Template created successfully!`);
            log(`   📁 Categories: ${template.channels.categories.length}`);
            log(`   📝 Total Channels: ${totalChannels}`);
            log(`   🎭 Roles: ${template.roles.length}`);
            log(`   😀 Emojis: ${template.emojis.length}`);
            
            return template;
        } catch (error) {
            log(`❌ Failed to create template: ${error.message}`);
            throw error;
        }
    }

    extractChannelData(channel) {
        return {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            position: channel.position,
            nsfw: channel.nsfw || false,
            topic: channel.topic || null,
            bitrate: channel.bitrate || null,
            user_limit: channel.userLimit || null,
            rate_limit_per_user: channel.rateLimitPerUser || null,
            parent_id: channel.parentId,
            permissions: this.extractPermissionOverwrites(channel),
            default_auto_archive_duration: channel.defaultAutoArchiveDuration || null,
            rtc_region: channel.rtcRegion || null,
            video_quality_mode: channel.videoQualityMode || null,
            default_reaction_emoji: channel.defaultReactionEmoji || null,
            available_tags: channel.availableTags || [],
            default_sort_order: channel.defaultSortOrder || null,
            default_forum_layout: channel.defaultForumLayout || null
        };
    }

    extractPermissionOverwrites(channel) {
        if (!channel.permissionOverwrites) return [];
        
        return channel.permissionOverwrites.cache.map(overwrite => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString()
        }));
    }

    async saveTemplateToFile() {
        try {
            const filename = `template_${this.guildName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.json`;
            const filepath = path.join(LOGS_DIR, filename);
            
            const templateWithCredits = {
                ...this.templateData,
                credits: {
                    created_by: `@${OWNER_USER_ID}`,
                    tool: 'Discord Template Creator',
                    deployment: RENDER_SERVICE_NAME,
                    note: 'Educational use only - Created with ❤️ by @pinkcorset'
                }
            };
            
            fs.writeFileSync(filepath, JSON.stringify(templateWithCredits, null, 2));
            log(`💾 Template saved to: ${filepath}`);
            
            return { filepath, filename };
        } catch (error) {
            log(`❌ Failed to save template: ${error.message}`);
            throw error;
        }
    }

    async generateTemplateLink() {
        try {
            // Create a simple web viewable version
            const webTemplate = {
                ...this.templateData,
                viewable: true,
                generated_at: new Date().toISOString(),
                credits: `Created by @${OWNER_USER_ID} via Render.com deployment`
            };
            
            const webFilename = `web_template_${Date.now()}.json`;
            const webFilepath = path.join(LOGS_DIR, webFilename);
            
            fs.writeFileSync(webFilepath, JSON.stringify(webTemplate, null, 2));
            
            // In a real scenario, you would upload this to a service
            // For now, we'll create a local URL simulation
            const baseUrl = process.env.RENDER_EXTERNAL_URL || `https://${RENDER_SERVICE_NAME}.onrender.com`;
            const simulatedUrl = `${baseUrl}/logs/${webFilename}`;
            
            log(`🔗 Simulated template URL: ${simulatedUrl}`);
            
            return {
                local_path: webFilepath,
                simulated_url: simulatedUrl,
                note: 'In production, upload to cloud storage for real URL'
            };
        } catch (error) {
            log(`❌ Failed to generate template link: ${error.message}`);
            return { error: error.message };
        }
    }

    async executeFullProcess() {
        try {
            log('🚀 STARTING FULL TEMPLATE CREATION PROCESS');
            log('===========================================');
            
            // Step 1: Initialize
            await this.initialize();
            
            // Step 2: Fetch guild data
            const guild = await this.fetchGuildData();
            
            // Step 3: Create template
            await this.createTemplate(guild);
            
            // Step 4: Save to file
            const savedFile = await this.saveTemplateToFile();
            
            // Step 5: Generate link
            const templateLink = await this.generateTemplateLink();
            
            // Calculate elapsed time
            const elapsedTime = Date.now() - this.deploymentStartTime;
            const seconds = Math.floor(elapsedTime / 1000);
            
            // Final summary
            log('\n🎉 TEMPLATE CREATION COMPLETE!');
            log('===========================================');
            log(`🏰 Server: "${this.guildName}"`);
            log(`🆔 Guild ID: ${TARGET_GUILD_ID}`);
            log(`👤 Created by: @${OWNER_USER_ID}`);
            log(`⏱️  Time taken: ${seconds} seconds`);
            log(`📁 Template saved: ${savedFile.filepath}`);
            log(`🔗 Template URL (simulated): ${templateLink.simulated_url}`);
            log(`🐙 RENDER Service: ${RENDER_SERVICE_NAME}`);
            log(`📅 Completed at: ${new Date().toISOString()}`);
            log('===========================================');
            log('⚠️  REMINDER: Educational use only!');
            log('⚠️  Only use on servers you own or have permission to template');
            log('💖 Created with ❤️ by @pinkcorset');
            log('===========================================');
            
            return {
                success: true,
                guild_name: this.guildName,
                file_path: savedFile.filepath,
                template_link: templateLink.simulated_url,
                elapsed_time: `${seconds} seconds`,
                created_by: `@${OWNER_USER_ID}`,
                deployment_id: process.env.RENDER_GIT_COMMIT || 'manual-deployment'
            };
        } catch (error) {
            log(`❌ PROCESS FAILED: ${error.message}`);
            return {
                success: false,
                error: error.message,
                created_by: `@${OWNER_USER_ID}`,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Create Express server for Render
app.get('/', (req, res) => {
    const status = {
        service: 'Discord Template Creator',
        status: 'running',
        owner: `@${OWNER_USER_ID}`,
        target_guild: TARGET_GUILD_ID || 'Not set',
        deployment_time: new Date().toISOString(),
        endpoints: {
            '/': 'This status page',
            '/logs': 'View deployment logs',
            '/create-template': 'Manually trigger template creation'
        },
        note: 'Educational tool by @pinkcorset'
    };
    res.json(status);
});

app.get('/logs', (req, res) => {
    try {
        const logs = [];
        const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log'));
        
        for (const file of files.slice(-5)) { // Last 5 log files
            const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8');
            logs.push({ file, content: content.split('\n').slice(-20) }); // Last 20 lines
        }
        
        res.json({
            log_count: files.length,
            recent_logs: logs,
            owner: `@${OWNER_USER_ID}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/create-template', async (req, res) => {
    const creator = new DiscordTemplateCreator();
    const result = await creator.executeFullProcess();
    res.json(result);
});

// Start the server and immediately begin template creation
async function startServer() {
    // Start Express server
    const server = app.listen(PORT, () => {
        log(`🌐 Server running on port ${PORT}`);
        log(`📡 External URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    });

    // Immediately start template creation process
    if (TARGET_GUILD_ID && DISCORD_TOKEN) {
        log('🚀 Auto-starting template creation on deployment...');
        
        // Small delay to ensure server is ready
        setTimeout(async () => {
            const creator = new DiscordTemplateCreator();
            const result = await creator.executeFullProcess();
            
            // Log the final result prominently
            console.log('\n' + '='.repeat(60));
            console.log('🎯 TEMPLATE CREATION RESULT:');
            console.log('='.repeat(60));
            console.log(JSON.stringify(result, null, 2));
            console.log('='.repeat(60));
            console.log(`🔗 Check /logs endpoint for detailed logs`);
            console.log(`👤 By @${OWNER_USER_ID}`);
            console.log('='.repeat(60));
            
            // Don't exit - keep server running
        }, 2000);
    } else {
        log('⚠️  Missing TARGET_GUILD_ID or DISCORD_TOKEN. Template creation skipped.');
        log('💡 Set these environment variables in Render.com dashboard');
    }

    return server;
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    log('🛑 Received SIGTERM signal. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    log('🛑 Received SIGINT signal. Shutting down gracefully...');
    process.exit(0);
});

// Start everything
startServer().catch(error => {
    console.error('Failed to start:', error);
    process.exit(1);
});
