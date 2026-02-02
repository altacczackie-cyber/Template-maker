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

async function cloneComplete() {
  console.log('='.repeat(60));
  console.log('🚀 COMPLETE SERVER CLONE');
  console.log(`🎯 From: ${TARGET_GUILD_ID} (bleed)`);
  console.log(`🏰 To: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(60));
  
  const results = {
    categories: { success: 0, failed: 0 },
    channels: { success: 0, failed: 0, skipped: 0, details: [] },
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
      }
      
      await new Promise(r => setTimeout(r, 800));
    }
    
    // 4. Crea canali NON-categoria (con SKIP per quelli problematici)
    console.log('\n💬 CREATING CHANNELS (53 total)...');
    const otherChannels = allChannels.filter(c => c.type !== 4);
    
    // Lista di canali problematici da saltare
    const problemChannels = ['・access', 'nome-problematico-2']; // Aggiungi qui
    
    for (const channel of otherChannels) {
      // SKIP canali problematici
      if (problemChannels.includes(channel.name)) {
        console.log(`   ⏭️ SKIPPING problematic channel: ${channel.name}`);
        results.channels.skipped++;
        results.channels.details.push({
          name: channel.name,
          type: channel.type,
          status: 'skipped',
          reason: 'known problematic channel'
        });
        continue;
      }
      
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
            
          case 5: // ANNOUNCEMENT - SEMPLIFICATO
            // Announcement channels possono essere problematici
            // Usa solo i campi essenziali
            if (channel.topic) channelData.topic = channel.topic;
            break;
            
          case 15: // FORUM - SEMPLIFICATO
            channelData.topic = channel.topic || null;
            // Non copiare available_tags che possono causare errori
            break;
        }
        
        await axios.post(
          `${DISCORD_API}/guilds/${SOURCE_GUILD_ID}/channels`,
          channelData,
          { headers }
        );
        
        results.channels.success++;
        const typeName = ['TEXT', 'VOICE', , , 'CATEGORY', 'ANNOUNCEMENT', , , , , , , , , , 'FORUM'][channel.type] || `TYPE_${channel.type}`;
        console.log(`   ✅ [${channel.position}] ${typeName}: ${channel.name}`);
        
        results.channels.details.push({
          name: channel.name,
          type: channel.type,
          status: 'created'
        });
        
      } catch (error) {
        results.channels.failed++;
        const typeName = ['TEXT', 'VOICE', , , 'CATEGORY', 'ANNOUNCEMENT'][channel.type] || `TYPE_${channel.type}`;
        console.log(`   ❌ Failed ${typeName} "${channel.name}": ${error.response?.status || error.code}`);
        
        results.channels.details.push({
          name: channel.name,
          type: channel.type,
          status: 'failed',
          error: error.response?.status,
          error_details: error.response?.data
        });
        
        // Se è un errore 400, logga i dettagli
        if (error.response?.status === 400) {
          console.log(`     🔍 Error details:`, JSON.stringify(error.response.data, null, 2));
        }
        
        // CONTINUA invece di fermarsi!
        console.log(`     ⏭️ Continuing with next channel...`);
      }
      
      await new Promise(r => setTimeout(r, 700));
    }
    
    // 5. Crea ruoli (se ci sono ancora)
    if (results.channels.success > 0) {
      console.log('\n🎭 CREATING ROLES...');
      for (const role of allRoles) {
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
          const colorHex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : 'default';
          console.log(`   ✅ ${role.name} (${colorHex})`);
        } catch (error) {
          results.roles.failed++;
          console.log(`   ❌ Failed role ${role.name}: ${error.response?.status}`);
        }
        
        await new Promise(r => setTimeout(r, 600));
      }
    }
    
    // 6. Risultati FINALI
    console.log('\n' + '='.repeat(60));
    console.log('🎉 CLONE PROCESS COMPLETED!');
    console.log('='.repeat(60));
    console.log('📊 FINAL RESULTS:');
    console.log(`   📂 CATEGORIES: ${results.categories.success}/${categories.length} ✅`);
    console.log(`   💬 CHANNELS: ${results.channels.success}/${otherChannels.length} ✅`);
    console.log(`        Skipped: ${results.channels.skipped}`);
    console.log(`        Failed: ${results.channels.failed}`);
    console.log(`   🎭 ROLES: ${results.roles.success}/${allRoles.length} ✅`);
    console.log('='.repeat(60));
    
    // Mostra dettagli dei fallimenti
    const failedChannels = results.channels.details.filter(c => c.status === 'failed');
    const skippedChannels = results.channels.details.filter(c => c.status === 'skipped');
    
    if (failedChannels.length > 0) {
      console.log('\n🔍 FAILED CHANNELS:');
      failedChannels.forEach(c => {
        const typeMap = {0: 'TEXT', 2: 'VOICE', 5: 'ANNOUNCEMENT', 15: 'FORUM'};
        console.log(`   ❌ ${typeMap[c.type] || c.type}: "${c.name}" (Error: ${c.error})`);
      });
    }
    
    if (skippedChannels.length > 0) {
      console.log('\n⏭️ SKIPPED CHANNELS:');
      skippedChannels.forEach(c => {
        const typeMap = {0: 'TEXT', 2: 'VOICE', 5: 'ANNOUNCEMENT', 15: 'FORUM'};
        console.log(`   ⏭️ ${typeMap[c.type] || c.type}: "${c.name}" (${c.reason})`);
      });
    }
    
    console.log(`\n🏰 Destination Server: ${SOURCE_GUILD_ID}`);
    console.log(`👤 By: @${OWNER_USERNAME}`);
    console.log('='.repeat(60));
    
    return {
      success: true,
      results: {
        categories: `${results.categories.success}/${categories.length}`,
        channels: {
          created: results.channels.success,
          total: otherChannels.length,
          skipped: results.channels.skipped,
          failed: results.channels.failed
        },
        roles: `${results.roles.success}/${allRoles.length}`
      },
      failed_channels: failedChannels,
      skipped_channels: skippedChannels,
      source_server: SOURCE_GUILD_ID,
      created_by: `@${OWNER_USERNAME}`,
      note: 'Clone completed with some channels skipped/failed'
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

// Web interface semplice
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Server Cloner - @pinkcorset</title></head>
    <body style="padding:20px;font-family:Arial">
      <h1>🚀 Server Cloner</h1>
      <p><strong>By:</strong> @${OWNER_USERNAME}</p>
      <p><strong>Target:</strong> ${TARGET_GUILD_ID}</p>
      <p><strong>Destination:</strong> ${SOURCE_GUILD_ID}</p>
      <hr>
      <button onclick="startClone()" style="padding:12px24px;background:#5865f2;color:white;border:none;border-radius:5px;cursor:pointer">
        🚀 Start Clone
      </button>
      <div id="result" style="margin-top:20px"></div>
      <script>
        async function startClone() {
          document.getElementById('result').innerHTML = '<p>⏳ Cloning... Check console logs.</p>';
          const res = await fetch('/clone');
          const data = await res.json();
          if (data.success) {
            let html = '<h3>✅ Clone Complete!</h3>';
            html += \`<p>Channels: \${data.results.channels.created}/\${data.results.channels.total}</p>\`;
            html += \`<p>Failed: \${data.results.channels.failed}</p>\`;
            html += \`<p>Skipped: \${data.results.channels.skipped}</p>\`;
            html += \`<p>By: \${data.created_by}</p>\`;
            document.getElementById('result').innerHTML = html;
          } else {
            document.getElementById('result').innerHTML = 
              \`<h3>❌ Error</h3><p>\${data.error}</p>\`;
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/clone', async (req, res) => {
  const result = await cloneComplete();
  res.json(result);
});

// Auto-start
app.listen(PORT, () => {
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`👤 By: @${OWNER_USERNAME}`);
  console.log(`🎯 Target: ${TARGET_GUILD_ID}`);
  console.log(`🏰 Destination: ${SOURCE_GUILD_ID}`);
  console.log('='.repeat(50));
  
  if (USER_TOKEN && TARGET_GUILD_ID && SOURCE_GUILD_ID) {
    console.log('\n🔄 Auto-cloning in 5 seconds...\n');
    setTimeout(async () => {
      console.log('🚀 STARTING CLONE...');
      await cloneComplete();
    }, 5000);
  }
});
