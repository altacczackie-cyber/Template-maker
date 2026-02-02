require('dotenv').config();
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_TOKEN = process.env.DISCORD_USER_TOKEN;
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID;    // Server da copiare
const SOURCE_GUILD_ID = process.env.SOURCE_GUILD_ID;    // Server dove copiare
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'pinkcorset';

const DISCORD_API = 'https://discord.com/api/v10';
const headers = { 
  'Authorization': USER_TOKEN, 
  'Content-Type': 'application/json'
};

async function cloneToExistingServer() {
  console.log('='.repeat(60));
  console.log('🚀 CLONING TO EXISTING SERVER');
  console.log(`🎯 From: ${TARGET_GUILD_ID}`);
  console.log(`🏰 To: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(60));
  
  try {
    // 1. Verifica account
    const user = await axios.get(`${DISCORD_API}/users/@me`, { headers });
    console.log(`✅ Account: ${user.data.username}`);
    
    // 2. Verifica permessi sul server source
    console.log('🔐 Checking permissions on source server...');
    const guildsRes = await axios.get(`${DISCORD_API}/users/@me/guilds`, { headers });
    const sourceGuild = guildsRes.data.find(g => g.id === SOURCE_GUILD_ID);
    
    if (!sourceGuild) {
      throw new Error(`❌ Not in source server ${SOURCE_GUILD_ID}`);
    }
    
    const perms = parseInt(sourceGuild.permissions);
    const canManage = (perms & 0x20) !== 0; // MANAGE_GUILD
    const isOwner = sourceGuild.owner;
    
    if (!canManage && !isOwner) {
      throw new Error('❌ Need MANAGE_GUILD permission in source server');
    }
    
    console.log(`✅ Permissions OK (${isOwner ? 'Owner' : 'Manage Guild'})`);
    
    // 3. Fetch dati target server
    console.log('📥 Fetching target server data...');
    const [channelsRes, rolesRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/channels`, { headers }),
      axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/roles`, { headers })
    ]);
    
    const channels = channelsRes.data;
    const roles = rolesRes.data.filter(r => r.name !== '@everyone');
    
    // 4. Crea ruoli nel source server
    console.log('🎭 Creating roles...');
    const createdRoles = [];
    
    for (const role of roles) {
      try {
        const roleData = {
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          permissions: role.permissions,
          mentionable: role.mentionable
        };
        
        const response = await axios.post(
          `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/roles`,
          roleData,
          { headers }
        );
        
        createdRoles.push({
          original: role.name,
          new_id: response.data.id
        });
        
        console.log(`   ✅ Role: ${role.name}`);
        await new Promise(r => setTimeout(r, 500)); // Rate limit
        
      } catch (error) {
        console.log(`   ⚠️ Skipping role ${role.name}: ${error.response?.status}`);
      }
    }
    
    // 5. Crea categorie e canali
    console.log('📁 Creating categories and channels...');
    
    // Prima le categorie
    const categories = channels.filter(c => c.type === 4);
    const categoryMap = {};
    
    for (const category of categories) {
      try {
        const catData = {
          name: category.name,
          type: 4,
          position: category.position
        };
        
        const response = await axios.post(
          `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/channels`,
          catData,
          { headers }
        );
        
        categoryMap[category.id] = response.data.id;
        console.log(`   ✅ Category: ${category.name}`);
        await new Promise(r => setTimeout(r, 400));
        
      } catch (error) {
        console.log(`   ⚠️ Skipping category ${category.name}`);
      }
    }
    
    // Poi i canali
    const otherChannels = channels.filter(c => c.type !== 4);
    let createdChannels = 0;
    
    for (const channel of otherChannels) {
      try {
        const channelData = {
          name: channel.name,
          type: channel.type,
          position: channel.position,
          parent_id: categoryMap[channel.parent_id] || null,
          topic: channel.topic || null,
          nsfw: channel.nsfw || false,
          bitrate: channel.bitrate || 64000,
          user_limit: channel.user_limit || 0,
          rate_limit_per_user: channel.rate_limit_per_user || 0
        };
        
        await axios.post(
          `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/channels`,
          channelData,
          { headers }
        );
        
        createdChannels++;
        const typeName = 
          channel.type === 0 ? 'text' :
          channel.type === 2 ? 'voice' :
          channel.type === 5 ? 'announcement' :
          channel.type === 15 ? 'forum' : `type ${channel.type}`;
        
        console.log(`   ✅ ${typeName}: ${channel.name}`);
        await new Promise(r => setTimeout(r, 400));
        
      } catch (error) {
        console.log(`   ⚠️ Skipping channel ${channel.name}`);
      }
    }
    
    // 6. Risultati
    console.log('\n' + '='.repeat(60));
    console.log('🎉 CLONE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Results:`);
    console.log(`   🎭 Roles created: ${createdRoles.length}/${roles.length}`);
    console.log(`   📂 Categories: ${Object.keys(categoryMap).length}/${categories.length}`);
    console.log(`   💬 Channels: ${createdChannels}/${otherChannels.length}`);
    console.log(`🏰 Source Server ID: ${SOURCE_GUILD_ID}`);
    console.log(`👤 By: @${OWNER_USERNAME}`);
    console.log('='.repeat(60));
    
    return {
      success: true,
      source_server_id: SOURCE_GUILD_ID,
      stats: {
        roles_created: createdRoles.length,
        categories_created: Object.keys(categoryMap).length,
        channels_created: createdChannels
      },
      created_by: `@${OWNER_USERNAME}`,
      note: 'Cloned structure to existing server'
    };
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ CLONE FAILED');
    console.log('='.repeat(60));
    console.log(`Error: ${error.message}`);
    console.log('='.repeat(60));
    
    return {
      success: false,
      error: error.message,
      created_by: `@${OWNER_USERNAME}`
    };
  }
}

// Web server
app.get('/', (req, res) => {
  res.send(`
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
      <h1>🚀 Discord Server Cloner</h1>
      <p><strong>👤 By:</strong> @${OWNER_USERNAME}</p>
      <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>🎯 Target (copy from):</strong> ${TARGET_GUILD_ID || 'Not set'}</p>
        <p><strong>🏰 Source (copy to):</strong> ${SOURCE_GUILD_ID || 'Not set'}</p>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>⚠️ Requirements:</h3>
        <ul>
          <li>You must have <strong>MANAGE_GUILD</strong> permission in source server</li>
          <li>You must be a member of both servers</li>
          <li>Process takes 1-2 minutes</li>
        </ul>
      </div>
      
      <button onclick="startClone()" style="padding: 12px 24px; background: #5865f2; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
        🚀 START CLONING
      </button>
      
      <div id="result" style="margin-top: 20px;"></div>
      
      <script>
        async function startClone() {
          document.getElementById('result').innerHTML = 
            '<div style="background: #e7f3ff; padding: 15px; border-radius: 5px;">⏳ Cloning in progress... Check console logs.</div>';
          
          const res = await fetch('/clone');
          const data = await res.json();
          
          if (data.success) {
            let html = '<div style="background: #d4edda; padding: 20px; border-radius: 5px;">';
            html += '<h3 style="color: #155724;">✅ CLONE COMPLETE!</h3>';
            html += \`<p><strong>Source Server:</strong> \${data.source_server_id}</p>\`;
            html += \`<p><strong>Roles created:</strong> \${data.stats.roles_created}</p>\`;
            html += \`<p><strong>Categories:</strong> \${data.stats.categories_created}</p>\`;
            html += \`<p><strong>Channels:</strong> \${data.stats.channels_created}</p>\`;
            html += \`<p><strong>By:</strong> \${data.created_by}</p>\`;
            html += '</div>';
            document.getElementById('result').innerHTML = html;
          } else {
            document.getElementById('result').innerHTML = 
              \`<div style="background: #f8d7da; padding: 20px; border-radius: 5px;">
                <h3 style="color: #721c24;">❌ CLONE FAILED</h3>
                <p>\${data.error}</p>
              </div>\`;
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/clone', async (req, res) => {
  const result = await cloneToExistingServer();
  res.json(result);
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`👤 By: @${OWNER_USERNAME}`);
  
  if (USER_TOKEN && TARGET_GUILD_ID && SOURCE_GUILD_ID) {
    console.log('\n🔄 Auto-cloning in 3 seconds...\n');
    setTimeout(() => {
      cloneToExistingServer();
    }, 3000);
  }
});
