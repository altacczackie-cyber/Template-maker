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

async function cloneAllChannels() {
  console.log('='.repeat(60));
  console.log('🚀 CLONING ALL CHANNELS');
  console.log(`🎯 From: ${TARGET_GUILD_ID}`);
  console.log(`🏰 To: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(60));
  
  try {
    // 1. Check account
    const user = await axios.get(`${DISCORD_API}/users/@me`, { headers });
    console.log(`✅ Account: ${user.data.username}`);
    
    // 2. Get ALL channels from target
    console.log('📥 Fetching ALL channels...');
    const channelsRes = await axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/channels`, { headers });
    const channels = channelsRes.data;
    
    // Filter out unwanted channels
    const validChannels = channels.filter(ch => 
      ch.type === 0 ||  // TEXT
      ch.type === 2 ||  // VOICE
      ch.type === 4 ||  // CATEGORY
      ch.type === 5 ||  // ANNOUNCEMENT
      ch.type === 15    // FORUM
    );
    
    console.log(`📊 Total channels: ${channels.length}`);
    console.log(`📋 Valid channels: ${validChannels.length}`);
    
    // 3. Create category map FIRST
    console.log('📂 Creating categories first...');
    const categoryMap = {};
    const categories = validChannels.filter(c => c.type === 4);
    
    for (const cat of categories) {
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
        console.log(`   ✅ Category: ${cat.name} (ID: ${cat.id} -> ${response.data.id})`);
        
        // Longer delay for categories
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (error) {
        console.log(`   ⚠️ Failed category ${cat.name}: ${error.response?.status}`);
      }
    }
    
    // 4. Create non-category channels
    console.log('💬 Creating text/voice/forum channels...');
    const otherChannels = validChannels.filter(c => c.type !== 4);
    let created = 0;
    let failed = 0;
    
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
        
        created++;
        const typeMap = {
          0: '📝 TEXT',
          2: '🔊 VOICE', 
          5: '📢 ANNOUNCEMENT',
          15: '💬 FORUM'
        };
        console.log(`   ✅ ${typeMap[channel.type] || 'CHANNEL'}: ${channel.name}`);
        
        // Variable delay based on channel type
        const delay = channel.type === 0 ? 800 : 600;
        await new Promise(r => setTimeout(r, delay));
        
      } catch (error) {
        failed++;
        console.log(`   ❌ Failed ${channel.name}: ${error.response?.status || error.message}`);
        
        // Longer delay on failure
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // 5. Results
    console.log('\n' + '='.repeat(60));
    console.log('🎉 CHANNEL CLONE COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Results:`);
    console.log(`   📂 Categories: ${Object.keys(categoryMap).length}/${categories.length}`);
    console.log(`   💬 Channels created: ${created}/${otherChannels.length}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`🏰 Source Server: ${SOURCE_GUILD_ID}`);
    console.log(`👤 By: @${OWNER_USERNAME}`);
    console.log('='.repeat(60));
    
    return {
      success: true,
      categories_created: Object.keys(categoryMap).length,
      channels_created: created,
      channels_failed: failed,
      source_server: SOURCE_GUILD_ID,
      created_by: `@${OWNER_USERNAME}`
    };
    
  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
    return {
      success: false,
      error: error.message,
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
      <title>Discord Cloner - @pinkcorset</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .btn { background: #5865f2; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
        .btn:hover { background: #4752c4; }
        .btn-red { background: #dc3545; }
        .btn-red:hover { background: #c82333; }
      </style>
    </head>
    <body>
      <h1>🚀 Discord Server Cloner</h1>
      <p><strong>👤 By:</strong> @${OWNER_USERNAME}</p>
      <p><strong>🎯 Target:</strong> ${TARGET_GUILD_ID}</p>
      <p><strong>🏰 Source:</strong> ${SOURCE_GUILD_ID}</p>
      <hr>
      
      <h3>🛠️ Clone Options:</h3>
      <button class="btn" onclick="cloneChannels()">Clone ALL Channels</button>
      <button class="btn btn-red" onclick="cloneEverything()">Clone EVERYTHING</button>
      
      <div id="result" style="margin-top: 20px; padding: 15px; border-radius: 5px; display: none;"></div>
      
      <script>
        async function cloneChannels() {
          showLoading('Cloning channels... (this may take 2-3 minutes)');
          const res = await fetch('/clone-channels');
          showResult(await res.json());
        }
        
        async function cloneEverything() {
          showLoading('Cloning everything... (this may take 3-5 minutes)');
          const res = await fetch('/clone-all');
          showResult(await res.json());
        }
        
        function showLoading(msg) {
          document.getElementById('result').style.display = 'block';
          document.getElementById('result').innerHTML = 
            \`<div style="background: #e7f3ff; padding: 15px;">
              <h3>⏳ ${msg}</h3>
              <p>Check Render console logs for progress...</p>
            </div>\`;
        }
        
        function showResult(data) {
          if (data.success) {
            document.getElementById('result').innerHTML = 
              \`<div style="background: #d4edda; padding: 20px;">
                <h3>✅ CLONE COMPLETE!</h3>
                <p><strong>Categories:</strong> \${data.categories_created}</p>
                <p><strong>Channels created:</strong> \${data.channels_created}</p>
                <p><strong>Failed:</strong> \${data.channels_failed || 0}</p>
                <p><strong>By:</strong> \${data.created_by}</p>
              </div>\`;
          } else {
            document.getElementById('result').innerHTML = 
              \`<div style="background: #f8d7da; padding: 20px;">
                <h3>❌ ERROR</h3>
                <p>\${data.error}</p>
              </div>\`;
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/clone-channels', async (req, res) => {
  const result = await cloneAllChannels();
  res.json(result);
});

app.get('/clone-all', async (req, res) => {
  // Puoi aggiungere qui la clonazione di ruoli ed emoji
  const result = await cloneAllChannels();
  res.json(result);
});

// Auto-start
app.listen(PORT, () => {
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`👤 By: @${OWNER_USERNAME}`);
  console.log(`🎯 Target: ${TARGET_GUILD_ID}`);
  console.log(`🏰 Source: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(50));
  
  if (USER_TOKEN && TARGET_GUILD_ID && SOURCE_GUILD_ID) {
    console.log('\n🔄 Auto-cloning channels in 5 seconds...\n');
    setTimeout(async () => {
      console.log('🚀 STARTING AUTO-CLONE...');
      const result = await cloneAllChannels();
      console.log('\n' + '='.repeat(70));
      console.log('🎯 FINAL RESULT:');
      console.log('='.repeat(70));
      console.log(JSON.stringify(result, null, 2));
      console.log('='.repeat(70));
    }, 5000);
  }
});
