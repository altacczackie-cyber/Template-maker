require('dotenv').config();
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const USER_TOKEN = process.env.DISCORD_USER_TOKEN;
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID;
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'pinkcorset';

const DISCORD_API = 'https://discord.com/api/v10';
const headers = { 'Authorization': USER_TOKEN, 'Content-Type': 'application/json' };

async function cloneServer() {
  console.log('🚀 CLONING SERVER...');
  
  try {
    // 1. Crea nuovo server
    console.log('🏗️ Creating new server...');
    const newGuild = await axios.post(`${DISCORD_API}/guilds`, {
      name: `Clone of bleed - @${OWNER_USERNAME}`,
      region: 'europe'
    }, { headers });
    
    const newGuildId = newGuild.data.id;
    console.log(`✅ New server: ${newGuild.data.name}`);
    
    // 2. Prendi dati sorgente
    console.log('📥 Fetching source data...');
    const [channels, roles] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/channels`, { headers }),
      axios.get(`${DISCORD_API}/guilds/${TARGET_GUILD_ID}/roles`, { headers })
    ]);
    
    // 3. Crea ruoli
    console.log('🎭 Creating roles...');
    for (const role of roles.data.filter(r => r.name !== '@everyone')) {
      try {
        await axios.post(`${DISCORD_API}/guilds/${newGuildId}/roles`, {
          name: role.name,
          color: role.color,
          permissions: role.permissions
        }, { headers });
        console.log(`   ✅ ${role.name}`);
      } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
    }
    
    // 4. Crea categorie
    console.log('📂 Creating categories...');
    const categoryMap = {};
    const categories = channels.data.filter(c => c.type === 4);
    
    for (const cat of categories) {
      try {
        const res = await axios.post(`${DISCORD_API}/guilds/${newGuildId}/channels`, {
          name: cat.name,
          type: 4,
          position: cat.position
        }, { headers });
        categoryMap[cat.id] = res.data.id;
        console.log(`   ✅ ${cat.name}`);
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 5. Crea canali
    console.log('💬 Creating channels...');
    const otherChannels = channels.data.filter(c => c.type !== 4);
    
    for (const ch of otherChannels) {
      try {
        await axios.post(`${DISCORD_API}/guilds/${newGuildId}/channels`, {
          name: ch.name,
          type: ch.type,
          position: ch.position,
          parent_id: categoryMap[ch.parent_id],
          topic: ch.topic
        }, { headers });
        console.log(`   ✅ ${ch.name}`);
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 6. Crea invite
    console.log('🔗 Creating invite...');
    const allChannels = await axios.get(`${DISCORD_API}/guilds/${newGuildId}/channels`, { headers });
    const textChannel = allChannels.data.find(c => c.type === 0);
    
    let invite = null;
    if (textChannel) {
      try {
        const inviteRes = await axios.post(`${DISCORD_API}/channels/${textChannel.id}/invites`, {
          max_age: 86400
        }, { headers });
        invite = `https://discord.gg/${inviteRes.data.code}`;
      } catch (e) {}
    }
    
    // 7. Risultato
    console.log('\n🎉 CLONE COMPLETE!');
    console.log('='.repeat(50));
    console.log(`🏰 New Server: ${newGuild.data.name}`);
    console.log(`🆔 ID: ${newGuildId}`);
    if (invite) console.log(`🔗 Invite: ${invite}`);
    console.log(`👤 By: @${OWNER_USERNAME}`);
    console.log('='.repeat(50));
    
    return { success: true, guildId: newGuildId, invite, createdBy: `@${OWNER_USERNAME}` };
    
  } catch (error) {
    console.log('❌ ERROR:', error.response?.data?.message || error.message);
    return { success: false, error: error.message, createdBy: `@${OWNER_USERNAME}` };
  }
}

// Web server
app.get('/', (req, res) => {
  res.send(`
    <html>
    <body>
      <h1>🚀 Discord Cloner</h1>
      <p>By @${OWNER_USERNAME}</p>
      <p>Target: ${TARGET_GUILD_ID}</p>
      <button onclick="startClone()">START CLONE</button>
      <div id="result"></div>
      <script>
        async function startClone() {
          const res = await fetch('/clone');
          const data = await res.json();
          document.getElementById('result').innerHTML = 
            data.success ? 
              \`<h3>✅ CLONED!</h3>
               <p>Server ID: \${data.guildId}</p>
               \${data.invite ? \`<p>Invite: <a href="\${data.invite}">\${data.invite}</a></p>\` : ''}
               <p>By: \${data.createdBy}</p>\` :
              \`<h3>❌ FAILED</h3><p>\${data.error}</p>\`;
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/clone', async (req, res) => {
  const result = await cloneServer();
  res.json(result);
});

// Auto-start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  if (USER_TOKEN && TARGET_GUILD_ID) {
    console.log('Auto-cloning in 3 seconds...');
    setTimeout(cloneServer, 3000);
  }
});
