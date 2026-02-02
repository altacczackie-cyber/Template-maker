require('dotenv').config();
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// VARIABILI RENDER
const USER_TOKEN = process.env.DISCORD_USER_TOKEN;
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID;
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'pinkcorset';

// Configurazione
const DISCORD_API = 'https://discord.com/api/v10';
const headers = {
  'Authorization': USER_TOKEN,
  'Content-Type': 'application/json'
};

class DiscordServerCloner {
  constructor() {
    this.sourceGuildId = TARGET_GUILD_ID;
    this.newGuildId = null;
    this.newGuildInvite = null;
    this.clonedData = {
      categories: [],
      channels: [],
      roles: []
    };
  }

  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    return logMessage;
  }

  async createNewGuild() {
    try {
      await this.log('🏗️ Creating new guild...');
      
      const guildData = {
        name: `Clone of bleed - by @${OWNER_USERNAME}`,
        region: 'europe',
        icon: null,
        channels: [],
        system_channel_id: null,
        guild_template_code: null
      };
      
      const response = await axios.post(`${DISCORD_API}/guilds`, guildData, { headers });
      
      this.newGuildId = response.data.id;
      await this.log(`✅ New guild created: ${response.data.name} (${this.newGuildId})`);
      
      return response.data;
      
    } catch (error) {
      await this.log(`❌ Cannot create guild: ${error.response?.data?.message || error.message}`);
      throw new Error('Cannot create new guild. You may have reached the server limit.');
    }
  }

  async fetchSourceStructure() {
    try {
      await this.log('🔍 Fetching source server structure...');
      
      // Fetch everything
      const [channelsRes, rolesRes, emojisRes] = await Promise.all([
        axios.get(`${DISCORD_API}/guilds/${this.sourceGuildId}/channels`, { headers }),
        axios.get(`${DISCORD_API}/guilds/${this.sourceGuildId}/roles`, { headers }),
        axios.get(`${DISCORD_API}/guilds/${this.sourceGuildId}/emojis`, { headers })
      ]);
      
      // Organize channels by categories
      const allChannels = channelsRes.data;
      const categories = allChannels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
      const otherChannels = allChannels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);
      
      this.clonedData = {
        categories,
        channels: otherChannels,
        roles: rolesRes.data.filter(r => r.name !== '@everyone'),
        emojis: emojisRes.data
      };
      
      await this.log(`📊 Source stats: ${categories.length} categories, ${otherChannels.length} channels, ${this.clonedData.roles.length} roles`);
      
      return this.clonedData;
      
    } catch (error) {
      await this.log(`❌ Error fetching source: ${error.message}`);
      throw error;
    }
  }

  async createRoles() {
    try {
      await this.log('🎭 Creating roles...');
      
      const createdRoles = [];
      
      for (const role of this.clonedData.roles) {
        try {
          const roleData = {
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions,
            mentionable: role.mentionable
          };
          
          const response = await axios.post(
            `${DISCORD_API}/guilds/${this.newGuildId}/roles`,
            roleData,
            { headers }
          );
          
          createdRoles.push({
            old_id: role.id,
            new_id: response.data.id,
            name: role.name
          });
          
          await this.log(`   ✅ Role: ${role.name} (${role.color})`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          await this.log(`   ⚠️ Failed role ${role.name}: ${error.response?.status || error.message}`);
        }
      }
      
      await this.log(`✅ Created ${createdRoles.length} roles`);
      return createdRoles;
      
    } catch (error) {
      await this.log(`❌ Error creating roles: ${error.message}`);
      return [];
    }
  }

  async createCategories() {
    try {
      await this.log('📂 Creating categories...');
      
      const categoryMap = {};
      
      for (const category of this.clonedData.categories) {
        try {
          const categoryData = {
            name: category.name,
            type: 4,
            position: category.position,
            permission_overwrites: category.permission_overwrites || []
          };
          
          const response = await axios.post(
            `${DISCORD_API}/guilds/${this.newGuildId}/channels`,
            categoryData,
            { headers }
          );
          
          categoryMap[category.id] = response.data.id;
          
          await this.log(`   ✅ Category: ${category.name}`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          await this.log(`   ⚠️ Failed category ${category.name}: ${error.response?.status || error.message}`);
        }
      }
      
      await this.log(`✅ Created ${Object.keys(categoryMap).length} categories`);
      return categoryMap;
      
    } catch (error) {
      await this.log(`❌ Error creating categories: ${error.message}`);
      return {};
    }
  }

  async createChannels(categoryMap) {
    try {
      await this.log('💬 Creating channels...');
      
      let created = 0;
      const channelTypes = {
        0: 'text',
        2: 'voice',
        5: 'announcement',
        15: 'forum'
      };
      
      for (const channel of this.clonedData.channels) {
        try {
          const channelData = {
            name: channel.name,
            type: channel.type,
            position: channel.position,
            topic: channel.topic,
            nsfw: channel.nsfw || false,
            bitrate: channel.bitrate,
            user_limit: channel.user_limit,
            rate_limit_per_user: channel.rate_limit_per_user,
            parent_id: categoryMap[channel.parent_id] || null,
            permission_overwrites: channel.permission_overwrites || []
          };
          
          await axios.post(
            `${DISCORD_API}/guilds/${this.newGuildId}/channels`,
            channelData,
            { headers }
          );
          
          created++;
          const typeName = channelTypes[channel.type] || `type ${channel.type}`;
          await this.log(`   ✅ ${typeName}: ${channel.name}`);
          
          // Rate limiting importante
          await new Promise(resolve => setTimeout(resolve, 400));
          
        } catch (error) {
          await this.log(`   ⚠️ Failed channel ${channel.name}: ${error.response?.status || error.message}`);
        }
      }
      
      await this.log(`✅ Created ${created} channels`);
      return created;
      
    } catch (error) {
      await this.log(`❌ Error creating channels: ${error.message}`);
      return 0;
    }
  }

  async createInvite() {
    try {
      await this.log('🔗 Creating invite link...');
      
      // Trova il primo canale di testo
      const channelsRes = await axios.get(`${DISCORD_API}/guilds/${this.newGuildId}/channels`, { headers });
      const textChannel = channelsRes.data.find(c => c.type === 0);
      
      if (textChannel) {
        const inviteData = {
          max_age: 86400, // 24 ore
          max_uses: 0, // Illimitato
          temporary: false,
          unique: true
        };
        
        const response = await axios.post(
          `${DISCORD_API}/channels/${textChannel.id}/invites`,
          inviteData,
          { headers }
        );
        
        this.newGuildInvite = `https://discord.gg/${response.data.code}`;
        await this.log(`✅ Invite created: ${this.newGuildInvite}`);
        
        return this.newGuildInvite;
      }
      
      return null;
      
    } catch (error) {
      await this.log(`⚠️ Cannot create invite: ${error.message}`);
      return null;
    }
  }

  async executeFullClone() {
    try {
      await this.log('='.repeat(60));
      await this.log('🚀 STARTING FULL SERVER CLONE');
      await this.log(`👤 By: @${OWNER_USERNAME}`);
      await this.log(`🎯 Source: ${this.sourceGuildId}`);
      await this.log('='.repeat(60));
      
      // 1. Crea nuovo server
      await this.createNewGuild();
      
      // 2. Prendi struttura originale
      await this.fetchSourceStructure();
      
      // 3. Crea ruoli
      await this.createRoles();
      
      // 4. Crea categorie
      const categoryMap = await this.createCategories();
      
      // 5. Crea canali
      await this.createChannels(categoryMap);
      
      // 6. Crea invite
      const invite = await this.createInvite();
      
      // 7. Risultati finali
      await this.log('\n' + '='.repeat(60));
      await this.log('🎉 SERVER CLONED SUCCESSFULLY!');
      await this.log('='.repeat(60));
      await this.log(`🏰 New Server: Clone of bleed`);
      await this.log(`🆔 Guild ID: ${this.newGuildId}`);
      
      if (invite) {
        await this.log(`🔗 INVITE LINK: ${invite}`);
      }
      
      await this.log(`📊 Cloned:`);
      await this.log(`   📂 Categories: ${this.clonedData.categories.length}`);
      await this.log(`   💬 Channels: ${this.clonedData.channels.length}`);
      await this.log(`   🎭 Roles: ${this.clonedData.roles.length}`);
      await this.log(`   😀 Emojis: ${this.clonedData.emojis.length}`);
      
      await this.log('='.repeat(60));
      await this.log(`👤 Created by: @${OWNER_USERNAME}`);
      await this.log('='.repeat(60));
      
      return {
        success: true,
        new_guild_id: this.newGuildId,
        invite_link: invite,
        cloned_data: {
          categories: this.clonedData.categories.length,
          channels: this.clonedData.channels.length,
          roles: this.clonedData.roles.length,
          emojis: this.clonedData.emojis.length
        },
        created_by: `@${OWNER_USERNAME}`,
        note: 'Full server cloned automatically'
      };
      
    } catch (error) {
      await this.log('\n' + '='.repeat(60));
      await this.log('❌ CLONE FAILED');
      await this.log('='.repeat(60));
      await this.log(`Error: ${error.message}`);
      await this.log('='.repeat(60));
      
      return {
        success: false,
        error: error.message,
        created_by: `@${OWNER_USERNAME}`,
        note: 'Check if you have permission to create guilds'
      };
    }
  }
}

// Express server
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Discord Server Cloner - @pinkcorset</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .btn { background: #5865f2; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        .btn:hover { background: #4752c4; }
        .warning { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>🚀 Discord Server Cloner</h1>
      <p><strong>👤 By:</strong> @${OWNER_USERNAME}</p>
      <p><strong>🎯 Source Server:</strong> ${TARGET_GUILD_ID}</p>
      
      <div class="warning">
        <h3>⚠️ WARNING:</h3>
        <p>This will create a <strong>NEW REAL SERVER</strong> on your Discord account!</p>
        <p>You must have available server slots (max 200 for nitro).</p>
      </div>
      
      <h3>🚀 Start Clone:</h3>
      <button class="btn" onclick="startClone()">START FULL CLONE</button>
      
      <div id="result" style="margin-top: 20px; display: none;">
        <h3>⏳ Cloning in progress...</h3>
        <p>Check Render logs for details. This may take 1-2 minutes.</p>
      </div>
      
      <hr>
      <h3>📋 What will be cloned:</h3>
      <ul>
        <li>✅ All categories</li>
        <li>✅ All text/voice/forum channels</li>
        <li>✅ All roles (with colors and permissions)</li>
        <li>✅ Channel permissions</li>
        <li>✅ Channel positions and order</li>
      </ul>
      
      <script>
        function startClone() {
          document.getElementById('result').style.display = 'block';
          fetch('/clone')
            .then(res => res.json())
            .then(data => {
              document.getElementById('result').innerHTML = 
                data.success ? 
                  \`<h3 style="color: green;">✅ CLONE COMPLETE!</h3>
                   <p><strong>New Server ID:</strong> \${data.new_guild_id}</p>
                   \${data.invite_link ? \`<p><strong>Invite:</strong> <a href="\${data.invite_link}" target="_blank">\${data.invite_link}</a></p>\` : ''}
                   <p><strong>By:</strong> \${data.created_by}</p>\` :
                  \`<h3 style="color: red;">❌ CLONE FAILED</h3>
                   <p><strong>Error:</strong> \${data.error}</p>\`;
            })
            .catch(err => {
              document.getElementById('result').innerHTML = 
                \`<h3 style="color: red;">❌ ERROR</h3>
                 <p>\${err.message}</p>\`;
            });
        }
      </script>
      
      <p><em>Educational tool by @pinkcorset</em></p>
    </body>
    </html>
  `);
});

app.get('/clone', async (req, res) => {
  const cloner = new DiscordServerCloner();
  const result = await cloner.executeFullClone();
  res.json(result);
});

app.get('/status', (req, res) => {
  res.json({
    service: 'Discord Server Cloner',
    owner: `@${OWNER_USERNAME}`,
    source_guild: TARGET_GUILD_ID,
    status: 'ready',
    endpoints: {
      '/': 'Web interface',
      '/clone': 'Start cloning (POST)'
    }
  });
});

// Auto-start clone on deployment
async function startServer() {
  const server = app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Discord Server Cloner');
    console.log('='.repeat(60));
    console.log(`🌐 Port: ${PORT}`);
    console.log(`👤 By: @${OWNER_USERNAME}`);
    console.log(`🎯 Source: ${TARGET_GUILD_ID}`);
    console.log('='.repeat(60));
  });
  
  // Auto-clone on deployment (opzionale)
  if (USER_TOKEN && TARGET_GUILD_ID) {
    console.log('\n🔄 Auto-cloning on deployment...\n');
    
    setTimeout(async () => {
      const cloner = new DiscordServerCloner();
      const result = await cloner.executeFullClone();
      
      console.log('\n' + '='.repeat(70));
      console.log('🎯 CLONE RESULT:');
      console.log('='.repeat(70));
      console.log(JSON.stringify(result, null, 2));
      
      if (result.success && result.invite_link) {
        console.log('='.repeat(70));
        console.log(`🔗 YOUR NEW SERVER INVITE: ${result.invite_link}`);
        console.log('👤 Created by: @pinkcorset');
        console.log('='.repeat(70));
      }
    }, 3000);
  }
  
  return server;
}

startServer().catch(console.error);
