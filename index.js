require('dotenv').config();
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// VARIABILI RENDER (DA IMPOSTARE SU RENDER.COM)
const USER_TOKEN = process.env.DISCORD_USER_TOKEN; // Token account utente
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID; // ID server da clonare
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'pinkcorset';

// Configurazione
const DISCORD_API = 'https://discord.com/api/v10';
const headers = {
  'Authorization': USER_TOKEN,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Directory logs
const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

class DiscordUserTemplateCreator {
  constructor() {
    this.userInfo = null;
    this.guildInfo = null;
    this.templateData = null;
    this.deploymentStart = Date.now();
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
    
    const logFile = path.join(LOGS_DIR, `deploy-${Date.now()}.log`);
    fs.appendFileSync(logFile, logMessage + '\n');
    
    return logMessage;
  }

  async validateToken() {
    try {
      this.log('🔐 Validating user token...');
      
      const response = await axios.get(`${DISCORD_API}/users/@me`, { headers });
      
      if (response.status === 200) {
        this.userInfo = response.data;
        this.log(`✅ Logged in as: ${this.userInfo.username}#${this.userInfo.discriminator}`);
        this.log(`📧 Email: ${this.userInfo.email || 'Not available'}`);
        this.log(`🆔 User ID: ${this.userInfo.id}`);
        return true;
      }
    } catch (error) {
      this.log(`❌ Invalid token or rate limited: ${error.message}`, 'error');
      return false;
    }
  }

  async getGuilds() {
    try {
      this.log('📋 Fetching user guilds...');
      
      const response = await axios.get(`${DISCORD_API}/users/@me/guilds`, { headers });
      
      if (response.status === 200) {
        const guilds = response.data;
        this.log(`✅ Found ${guilds.length} guilds`);
        
        // Cerca il guild target
        const targetGuild = guilds.find(g => g.id === TARGET_GUILD_ID);
        
        if (targetGuild) {
          this.guildInfo = targetGuild;
          this.log(`🎯 Target guild found: ${targetGuild.name} (${targetGuild.id})`);
          
          // Controlla permessi
          const permissions = parseInt(targetGuild.permissions);
          const isAdmin = (permissions & 0x8) !== 0; // Administrator permission
          const isOwner = targetGuild.owner;
          
          this.log(`🔑 Permissions: Owner=${isOwner}, Admin=${isAdmin}`);
          
          if (!isOwner && !isAdmin) {
            this.log('⚠️ Warning: Limited permissions on target guild', 'warn');
          }
          
          return true;
        } else {
          this.log(`❌ Target guild ${TARGET_GUILD_ID} not found in user guilds`, 'error');
          return false;
        }
      }
    } catch (error) {
      this.log(`❌ Error fetching guilds: ${error.message}`, 'error');
      return false;
    }
  }

  async fetchGuildDetails() {
    try {
      this.log('🔍 Fetching detailed guild information...');
      
      const response = await axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}`, { headers });
      
      if (response.status === 200) {
        const details = response.data;
        
        this.log(`🏰 Guild Name: ${details.name}`);
        this.log(`👥 Members: ${details.approximate_member_count || 'N/A'}`);
        this.log(`🎨 Icon: ${details.icon ? `https://cdn.discordapp.com/icons/${TARGET_GUILD_ID}/${details.icon}.png` : 'None'}`);
        this.log(`🏆 Premium Tier: ${details.premium_tier}`);
        
        return details;
      }
    } catch (error) {
      this.log(`⚠️ Cannot fetch full guild details: ${error.response?.status === 403 ? 'No permission' : error.message}`, 'warn');
      return null;
    }
  }

  async fetchChannels() {
    try {
      this.log('📁 Fetching guild channels...');
      
      const response = await axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/channels`, { headers });
      
      if (response.status === 200) {
        const channels = response.data;
        this.log(`✅ Found ${channels.length} channels`);
        
        // Organizza canali
        const categories = channels.filter(c => c.type === 4);
        const textChannels = channels.filter(c => c.type === 0);
        const voiceChannels = channels.filter(c => c.type === 2);
        const forumChannels = channels.filter(c => c.type === 15);
        const announcementChannels = channels.filter(c => c.type === 5);
        
        this.log(`   📂 Categories: ${categories.length}`);
        this.log(`   💬 Text Channels: ${textChannels.length}`);
        this.log(`   🔊 Voice Channels: ${voiceChannels.length}`);
        this.log(`   📝 Forum Channels: ${forumChannels.length}`);
        this.log(`   📢 Announcement Channels: ${announcementChannels.length}`);
        
        return {
          all: channels,
          categories,
          textChannels,
          voiceChannels,
          forumChannels,
          announcementChannels
        };
      }
    } catch (error) {
      this.log(`❌ Error fetching channels: ${error.message}`, 'error');
      return null;
    }
  }

  async fetchRoles() {
    try {
      this.log('🎭 Fetching guild roles...');
      
      const response = await axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/roles`, { headers });
      
      if (response.status === 200) {
        const roles = response.data;
        const filteredRoles = roles.filter(role => role.name !== '@everyone');
        this.log(`✅ Found ${filteredRoles.length} roles (excluding @everyone)`);
        return filteredRoles;
      }
    } catch (error) {
      this.log(`⚠️ Cannot fetch roles: ${error.message}`, 'warn');
      return [];
    }
  }

  async fetchEmojis() {
    try {
      this.log('😀 Fetching guild emojis...');
      
      const response = await axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/emojis`, { headers });
      
      if (response.status === 200) {
        const emojis = response.data;
        this.log(`✅ Found ${emojis.length} emojis`);
        return emojis;
      }
    } catch (error) {
      this.log(`⚠️ Cannot fetch emojis: ${error.message}`, 'warn');
      return [];
    }
  }

  async fetchMembers() {
    try {
      this.log('👥 Fetching guild members (limited)...');
      
      // Discord limita a 1000 membri per richiesta
      const response = await axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/members?limit=100`, { headers });
      
      if (response.status === 200) {
        const members = response.data;
        this.log(`✅ Sampled ${members.length} members`);
        
        // Estrai solo informazioni pubbliche
        return members.map(member => ({
          id: member.user.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.avatar,
          roles: member.roles,
          joined_at: member.joined_at
        }));
      }
    } catch (error) {
      this.log(`⚠️ Cannot fetch members: ${error.message}`, 'warn');
      return [];
    }
  }

  async createTemplate() {
    try {
      this.log('🛠️ Creating comprehensive template...');
      
      // Raccogli tutti i dati
      const guildDetails = await this.fetchGuildDetails();
      const channels = await this.fetchChannels();
      const roles = await this.fetchRoles();
      const emojis = await this.fetchEmojis();
      const members = await this.fetchMembers();
      
      // Crea template
      this.templateData = {
        metadata: {
          created_at: new Date().toISOString(),
          created_by: `@${OWNER_USERNAME}`,
          tool: "Discord User Template Creator (EDUCATIONAL)",
          note: "⚠️ FOR EDUCATIONAL PURPOSES ONLY - Created by @pinkcorset",
          
          user_info: {
            id: this.userInfo.id,
            username: this.userInfo.username,
            discriminator: this.userInfo.discriminator
          },
          
          guild_info: {
            id: TARGET_GUILD_ID,
            name: guildDetails?.name || this.guildInfo?.name,
            description: guildDetails?.description,
            icon: guildDetails?.icon,
            banner: guildDetails?.banner,
            features: guildDetails?.features || [],
            verification_level: guildDetails?.verification_level,
            premium_tier: guildDetails?.premium_tier,
            member_count: guildDetails?.approximate_member_count,
            owner_id: guildDetails?.owner_id
          }
        },
        
        structure: {
          categories: channels?.categories?.map(cat => ({
            id: cat.id,
            name: cat.name,
            position: cat.position,
            permissions: cat.permission_overwrites
          })) || [],
          
          channels: {
            text: channels?.textChannels?.map(ch => ({
              id: ch.id,
              name: ch.name,
              position: ch.position,
              topic: ch.topic,
              nsfw: ch.nsfw,
              parent_id: ch.parent_id,
              rate_limit_per_user: ch.rate_limit_per_user
            })) || [],
            
            voice: channels?.voiceChannels?.map(ch => ({
              id: ch.id,
              name: ch.name,
              position: ch.position,
              bitrate: ch.bitrate,
              user_limit: ch.user_limit,
              parent_id: ch.parent_id
            })) || [],
            
            forum: channels?.forumChannels?.map(ch => ({
              id: ch.id,
              name: ch.name,
              position: ch.position,
              topic: ch.topic,
              parent_id: ch.parent_id
            })) || [],
            
            announcement: channels?.announcementChannels?.map(ch => ({
              id: ch.id,
              name: ch.name,
              position: ch.position,
              topic: ch.topic,
              parent_id: ch.parent_id
            })) || []
          },
          
          roles: roles.map(role => ({
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: role.permissions,
            hoist: role.hoist,
            mentionable: role.mentionable,
            managed: role.managed
          })),
          
          emojis: emojis.map(emoji => ({
            id: emoji.id,
            name: emoji.name,
            animated: emoji.animated,
            available: emoji.available
          })),
          
          members_sample: members
        },
        
        settings: {
          afk_channel_id: guildDetails?.afk_channel_id,
          afk_timeout: guildDetails?.afk_timeout,
          system_channel_id: guildDetails?.system_channel_id,
          system_channel_flags: guildDetails?.system_channel_flags,
          rules_channel_id: guildDetails?.rules_channel_id,
          public_updates_channel_id: guildDetails?.public_updates_channel_id,
          preferred_locale: guildDetails?.preferred_locale,
          default_message_notifications: guildDetails?.default_message_notifications,
          explicit_content_filter: guildDetails?.explicit_content_filter
        }
      };
      
      // Statistiche
      const totalChannels = 
        (channels?.textChannels?.length || 0) +
        (channels?.voiceChannels?.length || 0) +
        (channels?.forumChannels?.length || 0) +
        (channels?.announcementChannels?.length || 0);
      
      this.log('\n📊 TEMPLATE STATISTICS:');
      this.log(`   📁 Categories: ${channels?.categories?.length || 0}`);
      this.log(`   📝 Total Channels: ${totalChannels}`);
      this.log(`   🎭 Roles: ${roles.length}`);
      this.log(`   😀 Emojis: ${emojis.length}`);
      this.log(`   👥 Members (sample): ${members.length}`);
      
      return this.templateData;
      
    } catch (error) {
      this.log(`❌ Error creating template: ${error.message}`, 'error');
      throw error;
    }
  }

  async saveTemplate() {
    try {
      if (!this.templateData) {
        throw new Error('No template data to save');
      }
      
      const safeName = (this.templateData.metadata.guild_info.name || 'unknown')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      
      const filename = `template_${safeName}_${Date.now()}.json`;
      const filepath = path.join(LOGS_DIR, filename);
      
      // Aggiungi credits finali
      this.templateData.credits = {
        created_by: `@${OWNER_USERNAME}`,
        educational_purpose: true,
        warning: "DO NOT USE FOR UNAUTHORIZED SERVER CLONING",
        timestamp: new Date().toISOString(),
        render_deployment: true
      };
      
      fs.writeFileSync(filepath, JSON.stringify(this.templateData, null, 2));
      
      this.log(`💾 Template saved to: ${filepath}`);
      
      // Crea anche una versione web-accessible
      const webFilename = `web_${filename}`;
      const webFilepath = path.join(LOGS_DIR, webFilename);
      
      const webTemplate = {
        ...this.templateData,
        web_viewable: true,
        download_url: `/download/${webFilename}`
      };
      
      fs.writeFileSync(webFilepath, JSON.stringify(webTemplate, null, 2));
      
      return {
        filepath,
        filename,
        webFilepath,
        webFilename,
        size: fs.statSync(filepath).size
      };
      
    } catch (error) {
      this.log(`❌ Error saving template: ${error.message}`, 'error');
      throw error;
    }
  }

  async executeFullProcess() {
    try {
      this.log('🚀 STARTING DISCORD USER TEMPLATE CREATOR');
      this.log('===========================================');
      this.log(`👤 Owner: @${OWNER_USERNAME}`);
      this.log(`🎯 Target Guild ID: ${TARGET_GUILD_ID}`);
      this.log(`⏰ Start Time: ${new Date(this.deploymentStart).toISOString()}`);
      this.log('===========================================');
      
      // 1. Validazione token
      if (!await this.validateToken()) {
        throw new Error('Invalid user token');
      }
      
      // 2. Verifica guild access
      if (!await this.getGuilds()) {
        throw new Error('Cannot access target guild');
      }
      
      // 3. Crea template
      await this.createTemplate();
      
      // 4. Salva template
      const saved = await this.saveTemplate();
      
      // 5. Calcola tempo
      const elapsed = Date.now() - this.deploymentStart;
      const seconds = Math.floor(elapsed / 1000);
      
      // 6. Risultato finale
      this.log('\n' + '='.repeat(60));
      this.log('🎉 TEMPLATE CREATION COMPLETE!');
      this.log('='.repeat(60));
      this.log(`🏰 Server: "${this.templateData.metadata.guild_info.name}"`);
      this.log(`👤 Created by: @${OWNER_USERNAME}`);
      this.log(`⏱️  Time: ${seconds} seconds`);
      this.log(`💾 File: ${saved.filename}`);
      this.log(`📦 Size: ${(saved.size / 1024).toFixed(2)} KB`);
      this.log(`🔗 Web View: /download/${saved.webFilename}`);
      this.log('='.repeat(60));
      this.log('⚠️  WARNING: EDUCATIONAL USE ONLY');
      this.log('⚠️  Created by @pinkcorset for learning purposes');
      this.log('⚠️  Do not use for unauthorized server cloning');
      this.log('='.repeat(60));
      
      return {
        success: true,
        guild_name: this.templateData.metadata.guild_info.name,
        template_file: saved.filename,
        web_file: saved.webFilename,
        elapsed_time: `${seconds} seconds`,
        created_by: `@${OWNER_USERNAME}`,
        download_url: `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/download/${saved.webFilename}`,
        logs_url: `https://${process.env.RENDER_SERVICE_NAME}.onrender.com/logs`
      };
      
    } catch (error) {
      this.log(`❌ PROCESS FAILED: ${error.message}`, 'error');
      
      return {
        success: false,
        error: error.message,
        created_by: `@${OWNER_USERNAME}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Setup Express server
app.use(express.json());
app.use('/logs', express.static(LOGS_DIR));

app.get('/', (req, res) => {
  res.json({
    service: 'Discord User Template Creator',
    status: 'running',
    owner: `@${OWNER_USERNAME}`,
    educational: true,
    warning: 'FOR EDUCATIONAL PURPOSES ONLY',
    endpoints: {
      '/': 'This status page',
      '/start': 'Start template creation',
      '/logs': 'View logs directory',
      '/download/:file': 'Download template files'
    },
    note: 'Created by @pinkcorset'
  });
});

app.get('/start', async (req, res) => {
  const creator = new DiscordUserTemplateCreator();
  const result = await creator.executeFullProcess();
  res.json(result);
});

app.get('/download/:filename', (req, res) => {
  const filepath = path.join(LOGS_DIR, req.params.filename);
  
  if (fs.existsSync(filepath)) {
    res.download(filepath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    environment: {
      has_token: !!USER_TOKEN,
      has_guild_id: !!TARGET_GUILD_ID,
      owner: OWNER_USERNAME,
      node_version: process.version
    }
  });
});

// Start server and auto-execute
async function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`👤 Owner: @${OWNER_USERNAME}`);
    console.log(`🎯 Target: ${TARGET_GUILD_ID || 'NOT SET'}`);
    console.log('===========================================');
  });

  // Auto-start template creation on deployment
  if (USER_TOKEN && TARGET_GUILD_ID) {
    setTimeout(async () => {
      console.log('\n🔄 Auto-starting template creation on deployment...\n');
      
      const creator = new DiscordUserTemplateCreator();
      const result = await creator.executeFullProcess();
      
      // Log result prominently
      console.log('\n' + '='.repeat(70));
      console.log('🎯 DEPLOYMENT COMPLETE - TEMPLATE CREATED');
      console.log('='.repeat(70));
      console.log(JSON.stringify(result, null, 2));
      console.log('='.repeat(70));
      console.log(`📋 Visit: https://${process.env.RENDER_SERVICE_NAME}.onrender.com`);
      console.log(`👤 By: @${OWNER_USERNAME}`);
      console.log('='.repeat(70));
      
    }, 3000);
  } else {
    console.log('\n⚠️  WARNING: Missing environment variables');
    console.log('Set DISCORD_USER_TOKEN and TARGET_GUILD_ID in Render.com');
    console.log('Visit /start to manually trigger template creation\n');
  }

  return server;
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Interrupted by user');
  process.exit(0);
});

// Start application
startServer().catch(error => {
  console.error('Failed to start:', error);
  process.exit(1);
});
