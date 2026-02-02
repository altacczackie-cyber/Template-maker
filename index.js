require('dotenv').config();
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_TOKEN = process.env.DISCORD_USER_TOKEN;
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID;
const SOURCE_GUILD_ID = process.env.SOURCE_GUILD_ID;
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'pinkcorset';

const DISCORD_API = 'https://discord.com/api/v10';
const headers = { 
  'Authorization': USER_TOKEN, 
  'Content-Type': 'application/json'
};

// Cache per evitare rate limit
let rateLimitDelay = 1200;

async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Se è rate limit, aspetta di più
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 5;
        console.log(`   ⏳ Rate limited, waiting ${retryAfter}s...`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        rateLimitDelay += 500; // Aumenta delay
      } else {
        await new Promise(r => setTimeout(r, rateLimitDelay));
      }
    }
  }
}

async function cloneComplete() {
  console.log('='.repeat(60));
  console.log('🚀 COMPLETE SERVER CLONE');
  console.log(`🎯 From: ${TARGET_GUILD_ID} (bleed)`);
  console.log(`🏰 To: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(60));
  
  const results = {
    categories: { success: 0, failed: 0 },
    channels: { success: 0, failed: 0, details: [] },
    roles: { success: 0, failed: 0 }
  };
  
  try {
    // 1. Verifica account
    const user = await axios.get(`${DISCORD_API}/users/@me`, { headers });
    console.log(`✅ Account: ${user.data.username}`);
    
    // 2. Prendi TUTTI i dati
    console.log('📥 Fetching ALL server data...');
    const [channelsRes, rolesRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/channels`, { headers }),
      axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/roles`, { headers })
    ]);
    
    const allChannels = channelsRes.data;
    const allRoles = rolesRes.data.filter(r => r.name !== '@everyone');
    
    console.log(`📊 Found: ${allChannels.length} channels, ${allRoles.length} roles`);
    
    // 3. Crea categorie PRIMA
    console.log('\n📂 CREATING CATEGORIES (16 total)...');
    const categories = allChannels.filter(c => c.type === 4);
    const categoryMap = {};
    
    for (const cat of categories) {
      await withRetry(async () => {
        try {
          const catData = {
            name: cat.name,
            type: 4,
            position: cat.position
          };
          
          const response = await axios.post(
            `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/channels`,
            catData,
            { headers }
          );
          
          categoryMap[cat.id] = response.data.id;
          results.categories.success++;
          console.log(`   ✅ [${cat.position}] ${cat.name}`);
        } catch (error) {
          results.categories.failed++;
          console.log(`   ❌ Failed category ${cat.name}: ${error.response?.status}`);
          throw error;
        }
      });
      
      await new Promise(r => setTimeout(r, rateLimitDelay));
    }
    
    // 4. Crea canali NON-categoria
    console.log('\n💬 CREATING CHANNELS (53 total)...');
    const otherChannels = allChannels.filter(c => c.type !== 4);
    
    for (const channel of otherChannels) {
      await withRetry(async () => {
        try {
          // Data base per tutti i canali
          const channelData = {
            name: channel.name,
            type: channel.type,
            position: channel.position,
            parent_id: categoryMap[channel.parent_id] || null
          };
          
          // Aggiungi proprietà specifiche per tipo
          switch(channel.type) {
            case 0: // TEXT
              channelData.topic = channel.topic || null;
              channelData.nsfw = channel.nsfw || false;
              channelData.rate_limit_per_user = channel.rate_limit_per_user || 0;
              break;
              
            case 2: // VOICE
              channelData.bitrate = channel.bitrate || 64000;
              channelData.user_limit = channel.user_limit || 0;
              break;
              
            case 5: // ANNOUNCEMENT
              channelData.topic = channel.topic || null;
              break;
              
            case 15: // FORUM
              channelData.topic = channel.topic || null;
              channelData.available_tags = channel.available_tags || [];
              break;
          }
          
          await axios.post(
            `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/channels`,
            channelData,
            { headers }
          );
          
          results.channels.success++;
          const typeName = ['TEXT', 'VOICE', , , 'CATEGORY', 'ANNOUNCEMENT'][channel.type] || `TYPE_${channel.type}`;
          console.log(`   ✅ [${channel.position}] ${typeName}: ${channel.name}`);
          
          results.channels.details.push({
            name: channel.name,
            type: channel.type,
            success: true
          });
          
        } catch (error) {
          results.channels.failed++;
          const typeName = ['TEXT', 'VOICE', , , 'CATEGORY', 'ANNOUNCEMENT'][channel.type] || `TYPE_${channel.type}`;
          console.log(`   ❌ Failed ${typeName} "${channel.name}": ${error.response?.status || error.code}`);
          
          results.channels.details.push({
            name: channel.name,
            type: channel.type,
            success: false,
            error: error.response?.status
          });
          
          throw error;
        }
      });
      
      await new Promise(r => setTimeout(r, rateLimitDelay));
    }
    
    // 5. Crea ruoli
    console.log('\n🎭 CREATING ROLES...');
    for (const role of allRoles) {
      await withRetry(async () => {
        try {
          const roleData = {
            name: role.name,
            color: role.color,
            permissions: role.permissions,
            hoist: role.hoist || false,
            mentionable: role.mentionable || false
          };
          
          await axios.post(
            `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/roles`,
            roleData,
            { headers }
          );
          
          results.roles.success++;
          console.log(`   ✅ ${role.name} (#${role.color.toString(16).padStart(6, '0')})`);
        } catch (error) {
          results.roles.failed++;
          console.log(`   ❌ Failed role ${role.name}: ${error.response?.status}`);
          throw error;
        }
      });
      
      await new Promise(r => setTimeout(r, rateLimitDelay));
    }
    
    // 6. Risultati FINALI
    console.log('\n' + '='.repeat(60));
    console.log('🎉 COMPLETE CLONE FINISHED!');
    console.log('='.repeat(60));
    console.log('📊 FINAL RESULTS:');
    console.log(`   📂 CATEGORIES: ${results.categories.success}/${categories.length} ✅`);
    console.log(`   💬 CHANNELS: ${results.channels.success}/${otherChannels.length} ✅`);
    console.log(`   🎭 ROLES: ${results.roles.success}/${allRoles.length} ✅`);
    console.log('='.repeat(60));
    
    // Mostra canali falliti
    if (results.channels.failed > 0) {
      console.log('\n🔍 FAILED CHANNELS:');
      results.channels.details
        .filter(c => !c.success)
        .forEach(c => {
          const typeMap = {0: 'TEXT', 2: 'VOICE', 5: 'ANNOUNCEMENT', 15: 'FORUM'};
          console.log(`   ❌ ${typeMap[c.type] || c.type}: "${c.name}" (Error: ${c.error})`);
        });
    }
    
    console.log(`\n🏰 Source Server: ${SOURCE_GUILD_ID}`);
    console.log(`👤 By: @${OWNER_USERNAME}`);
    console.log('='.repeat(60));
    
    return {
      success: true,
      results: {
        categories: `${results.categories.success}/${categories.length}`,
        channels: `${results.channels.success}/${otherChannels.length}`,
        roles: `${results.roles.success}/${allRoles.length}`
      },
      failed_channels: results.channels.details.filter(c => !c.success).map(c => ({
        name: c.name,
        type: c.type,
        error: c.error
      })),
      source_server: SOURCE_GUILD_ID,
      created_by: `@${OWNER_USERNAME}`,
      note: 'Complete server clone attempt'
    };
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ FATAL ERROR');
    console.log('='.repeat(60));
    console.log(`Error: ${error.message}`);
    console.log('='.repeat(60));
    
    return {
      success: false,
      error: error.message,
      partial_results: results,
      created_by: `@${OWNER_USERNAME}`
    };
  }
}

// Web interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Complete Server Cloner - @pinkcorset</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .btn { background: #5865f2; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px; }
        .btn:hover { background: #4752c4; }
        .stats { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>🚀 COMPLETE SERVER CLONER</h1>
      <p><strong>👤 By:</strong> @${OWNER_USERNAME}</p>
      
      <div class="stats">
        <p><strong>🎯 Source:</strong> ${TARGET_GUILD_ID} (bleed)</p>
        <p><strong>🏰 Destination:</strong> ${SOURCE_GUILD_ID}</p>
        <p><strong>📊 Expected:</strong> 16 categories, 53 channels, 49 roles</p>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>⚠️ This will clone EVERYTHING:</h3>
        <ul>
          <li>All 16 categories</li>
          <li>All 53 channels (text/voice/forum/announcement)</li>
          <li>All 49 roles with colors and permissions</li>
          <li>Estimated time: 3-5 minutes</li>
        </ul>
      </div>
      
      <button class="btn" onclick="startCompleteClone()">🚀 START COMPLETE CLONE</button>
      
      <div id="result" style="margin-top: 30px;"></div>
      
      <script>
        async function startCompleteClone() {
          document.getElementById('result').innerHTML = 
            '<div style="background: #e7f3ff; padding: 20px; border-radius: 5px;">' +
            '<h3>⏳ CLONING IN PROGRESS...</h3>' +
            '<p>This will take 3-5 minutes. Check Render logs for real-time progress.</p>' +
            '<p>Do not refresh the page!</p>' +
            '</div>';
          
          try {
            const res = await fetch('/clone-complete');
            const data = await res.json();
            
            if (data.success) {
              let html = '<div style="background: #d4edda; padding: 25px; border-radius: 5px;">';
              html += '<h3>✅ COMPLETE CLONE FINISHED!</h3>';
              html += \`<p><strong>Categories:</strong> \${data.results.categories}</p>\`;
              html += \`<p><strong>Channels:</strong> \${data.results.channels}</p>\`;
              html += \`<p><strong>Roles:</strong> \${data.results.roles}</p>\`;
              
              if (data.failed_channels && data.failed_channels.length > 0) {
                html += '<h4>❌ Failed Channels:</h4><ul>';
                data.failed_channels.forEach(ch => {
                  html += \`<li>\${ch.name} (Error: \${ch.error})</li>\`;
                });
                html += '</ul>';
              }
              
              html += \`<p><strong>By:</strong> \${data.created_by}</p>\`;
              html += '</div>';
              
              document.getElementById('result').innerHTML = html;
            } else {
              document.getElementById('result').innerHTML = 
                \`<div style="background: #f8d7da; padding: 25px; border-radius: 5px;">
                  <h3>❌ CLONE FAILED</h3>
                  <p>\${data.error}</p>
                </div>\`;
            }
          } catch (err) {
            document.getElementById('result').innerHTML = 
              \`<div style="background: #f8d7da; padding: 25px; border-radius: 5px;">
                <h3>❌ NETWORK ERROR</h3>
                <p>\${err.message}</p>
              </div>\`;
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/clone-complete', async (req, res) => {
  const result = await cloneComplete();
  res.json(result);
});

// Auto-start complete clone
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`👤 By: @${OWNER_USERNAME}`);
  console.log(`🎯 Target: ${TARGET_GUILD_ID} (bleed)`);
  console.log(`🏰 Destination: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(60));
  
  if (USER_TOKEN && TARGET_GUILD_ID && SOURCE_GUILD_ID) {
    console.log('\n🔄 Starting COMPLETE clone in 10 seconds...\n');
    setTimeout(async () => {
      console.log('🚀 AUTO-STARTING COMPLETE CLONE...');
      await cloneComplete();
    }, 10000);
  }
});
