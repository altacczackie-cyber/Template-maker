require('dotenv').config();
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// VARIABILI RENDER (USA IL TUO ACCOUNT)
const USER_TOKEN = process.env.DISCORD_USER_TOKEN; // Token del TUO account
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID; // ID server da template
const OWNER_USERNAME = process.env.OWNER_USERNAME || 'pinkcorset';

// Config Discord API
const DISCORD_API = 'https://discord.com/api/v10';
const headers = {
  'Authorization': USER_TOKEN,
  'Content-Type': 'application/json'
};

async function createDiscordTemplate() {
  console.log('='.repeat(60));
  console.log('🚀 DISCORD TEMPLATE CREATOR');
  console.log(`👤 Using USER ACCOUNT`);
  console.log(`🎯 Target Server: ${TARGET_GUILD_ID}`);
  console.log('='.repeat(60));
  
  try {
    // 1. Verifica che il token sia valido
    console.log('🔐 Verifying user token...');
    const userResponse = await axios.get(`${DISCORD_API}/users/@me`, { headers });
    console.log(`✅ Logged in as: ${userResponse.data.username}`);
    
    // 2. Verifica di essere nel server
    console.log('📋 Checking server access...');
    const guildsResponse = await axios.get(`${DISCORD_API}/users/@me/guilds`, { headers });
    const targetGuild = guildsResponse.data.find(g => g.id === TARGET_GUILD_ID);
    
    if (!targetGuild) {
      throw new Error(`❌ You are not in the server ${TARGET_GUILD_ID}`);
    }
    
    console.log(`✅ Server found: "${targetGuild.name}"`);
    
    // 3. Controlla permessi (MANAGE_GUILD = 0x20)
    const permissions = parseInt(targetGuild.permissions);
    const hasManageGuild = (permissions & 0x20) !== 0;
    const isOwner = targetGuild.owner;
    
    if (!hasManageGuild && !isOwner) {
      console.log('⚠️ Warning: You need MANAGE_GUILD permission or be server owner');
      console.log('💡 Ask the server owner for permission or use a server you own');
    }
    
    // 4. Crea il template
    console.log('🛠️ Creating Discord template...');
    
    const templateData = {
      name: `${targetGuild.name} - Template by @${OWNER_USERNAME}`,
      description: `Server template created by @${OWNER_USERNAME} on ${new Date().toLocaleDateString()}`
    };
    
    console.log(`📝 Template name: "${templateData.name}"`);
    
    const templateResponse = await axios.post(
      `${DISCORD_API}/guilds/${TARGET_GUILD_ID}/templates`,
      templateData,
      { headers }
    );
    
    const template = templateResponse.data;
    const templateUrl = `https://discord.new/${template.code}`;
    
    // 5. Mostra risultati
    console.log('\n' + '='.repeat(60));
    console.log('🎉 TEMPLATE CREATED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`🔗 TEMPLATE URL: ${templateUrl}`);
    console.log(`🏰 Server: ${targetGuild.name}`);
    console.log(`👤 Created by: @${OWNER_USERNAME}`);
    console.log(`📅 Created: ${new Date().toLocaleString()}`);
    console.log(`🔑 Code: ${template.code}`);
    console.log('='.repeat(60));
    console.log('💡 Share this link to let others use your template!');
    console.log('='.repeat(60));
    
    return {
      success: true,
      template_url: templateUrl,
      template_code: template.code,
      server_name: targetGuild.name,
      created_by: `@${OWNER_USERNAME}`,
      permissions: {
        has_manage_guild: hasManageGuild,
        is_owner: isOwner
      }
    };
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TEMPLATE CREATION FAILED');
    console.log('='.repeat(60));
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch(status) {
        case 400:
          console.log('❌ Bad request - Invalid data');
          break;
        case 403:
          console.log('❌ Forbidden - Missing MANAGE_GUILD permission');
          console.log('💡 You need "Manage Server" permission in the target server');
          console.log('💡 Or use a server where you are the owner');
          break;
        case 404:
          console.log('❌ Server not found');
          break;
        case 429:
          console.log('❌ Rate limited - Try again later');
          break;
        default:
          console.log(`❌ Discord API Error ${status}:`, data.message || 'Unknown error');
      }
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('='.repeat(60));
    
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      created_by: `@${OWNER_USERNAME}`
    };
  }
}

// Express server semplice
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Discord Template Creator - @pinkcorset</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .success { color: green; }
        .error { color: red; }
        .template-url { font-size: 18px; background: #f0f0f0; padding: 10px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>🎯 Discord Template Creator</h1>
      <p><strong>👤 Using:</strong> USER ACCOUNT</p>
      <p><strong>🎯 Target Server ID:</strong> ${TARGET_GUILD_ID || 'Not set'}</p>
      <p><strong>👑 Created by:</strong> @${OWNER_USERNAME}</p>
      <hr>
      <p><a href="/create-template">🚀 Click here to create template</a></p>
      <p><a href="/check-permissions">🔐 Check permissions first</a></p>
      <hr>
      <h3>ℹ️ How to use:</h3>
      <ol>
        <li>Make sure you have "Manage Server" permission in the target server</li>
        <li>Click "Create Template"</li>
        <li>Get your discord.new link</li>
        <li>Share it to let others clone your server!</li>
      </ol>
      <p><em>Educational tool by @pinkcorset</em></p>
    </body>
    </html>
  `);
});

app.get('/create-template', async (req, res) => {
  const result = await createDiscordTemplate();
  
  if (result.success) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Template Created! - @pinkcorset</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .success { color: green; font-size: 24px; }
          .template-url { font-size: 20px; background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }
          a { color: #5865f2; text-decoration: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1 class="success">🎉 TEMPLATE CREATED!</h1>
        <div class="template-url">
          🔗 <a href="${result.template_url}" target="_blank">${result.template_url}</a>
        </div>
        <p><strong>🏰 Server:</strong> ${result.server_name}</p>
        <p><strong>👤 Created by:</strong> ${result.created_by}</p>
        <p><strong>🔑 Code:</strong> ${result.template_code}</p>
        <hr>
        <h3>📋 How to use:</h3>
        <ol>
          <li>Click the link above</li>
          <li>Discord will open the template page</li>
          <li>Click "Use Template" to create a new server</li>
          <li>Customize and enjoy your cloned server!</li>
        </ol>
        <p><a href="/">← Back to home</a></p>
        <p><em>Educational tool by @pinkcorset</em></p>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - @pinkcorset</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .error { color: red; font-size: 24px; }
          .solution { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1 class="error">❌ TEMPLATE CREATION FAILED</h1>
        <p><strong>Error:</strong> ${result.error}</p>
        
        <div class="solution">
          <h3>💡 Possible solutions:</h3>
          <ol>
            <li><strong>You need "Manage Server" permission</strong> in the target server</li>
            <li><strong>Or be the server owner</strong></li>
            <li>Try with a different server that you own</li>
            <li>Ask the server owner to give you "Manage Server" permission</li>
          </ol>
        </div>
        
        <p><a href="/">← Back to home</a></p>
        <p><a href="/check-permissions">🔐 Check your permissions</a></p>
        <p><em>Educational tool by @pinkcorset</em></p>
      </body>
      </html>
    `);
  }
});

app.get('/check-permissions', async (req, res) => {
  try {
    console.log('🔐 Checking permissions...');
    
    const userResponse = await axios.get(`${DISCORD_API}/users/@me`, { headers });
    const guildsResponse = await axios.get(`${DISCORD_API}/users/@me/guilds`, { headers });
    
    const targetGuild = guildsResponse.data.find(g => g.id === TARGET_GUILD_ID);
    
    let permissions = {
      can_create_templates: false,
      reason: '',
      guild_info: null
    };
    
    if (targetGuild) {
      const permsInt = parseInt(targetGuild.permissions);
      const hasManageGuild = (permsInt & 0x20) !== 0;
      const isOwner = targetGuild.owner;
      
      permissions = {
        can_create_templates: hasManageGuild || isOwner,
        reason: hasManageGuild ? 'Has MANAGE_GUILD permission' : 
                isOwner ? 'Is server owner' : 'Missing MANAGE_GUILD permission',
        guild_info: {
          name: targetGuild.name,
          id: targetGuild.id,
          owner: isOwner,
          permissions: permsInt,
          permission_flags: {
            manage_guild: hasManageGuild,
            administrator: (permsInt & 0x8) !== 0
          }
        }
      };
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Permissions Check - @pinkcorset</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .success { color: green; }
          .warning { color: orange; }
          .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>🔐 Permissions Check</h1>
        <p><strong>👤 User:</strong> ${userResponse.data.username}#${userResponse.data.discriminator}</p>
        
        ${targetGuild ? `
          <div class="info">
            <h2>🏰 Server: "${targetGuild.name}"</h2>
            <p><strong>ID:</strong> ${targetGuild.id}</p>
            <p><strong>Owner:</strong> ${targetGuild.owner ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Manage Server Permission:</strong> ${permissions.guild_info.permission_flags.manage_guild ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Administrator:</strong> ${permissions.guild_info.permission_flags.administrator ? '✅ Yes' : '❌ No'}</p>
          </div>
          
          ${permissions.can_create_templates ? `
            <h2 class="success">✅ CAN CREATE TEMPLATES!</h2>
            <p>You have the necessary permissions to create templates for this server.</p>
            <p><a href="/create-template">🚀 Create Template Now</a></p>
          ` : `
            <h2 class="warning">❌ CANNOT CREATE TEMPLATES</h2>
            <p>You need "Manage Server" permission or be the server owner.</p>
            <p><strong>Reason:</strong> ${permissions.reason}</p>
            <p>Ask the server owner for "Manage Server" permission.</p>
          `}
        ` : `
          <h2 class="warning">❌ SERVER NOT FOUND</h2>
          <p>You are not a member of server ID: ${TARGET_GUILD_ID}</p>
          <p>Make sure:</p>
          <ol>
            <li>You are in the server</li>
            <li>The server ID is correct</li>
            <li>You're using the right account</li>
          </ol>
        `}
        
        <p><a href="/">← Back to home</a></p>
        <p><em>Educational tool by @pinkcorset</em></p>
      </body>
      </html>
    `);
    
  } catch (error) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error - @pinkcorset</title></head>
      <body>
        <h1>❌ Error checking permissions</h1>
        <p>${error.message}</p>
        <p><a href="/">← Back to home</a></p>
      </body>
      </html>
    `);
  }
});

// Auto-create on deployment
async function startServer() {
  const server = app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Discord Template Creator');
    console.log('='.repeat(60));
    console.log(`🌐 Server running on port: ${PORT}`);
    console.log(`👤 Using account for: @${OWNER_USERNAME}`);
    console.log(`🎯 Target Server ID: ${TARGET_GUILD_ID || 'NOT SET'}`);
    console.log('='.repeat(60));
    console.log('💡 Visit your Render URL to create template');
    console.log('='.repeat(60));
  });
  
  // Auto-create template on deployment
  if (USER_TOKEN && TARGET_GUILD_ID) {
    console.log('\n🔄 Auto-creating template on deployment...\n');
    
    setTimeout(async () => {
      try {
        const result = await createDiscordTemplate();
        
        if (result.success) {
          console.log('\n' + '='.repeat(70));
          console.log('🎯 DEPLOYMENT SUCCESSFUL!');
          console.log('='.repeat(70));
          console.log(`🔗 YOUR TEMPLATE LINK: ${result.template_url}`);
          console.log(`👤 Created by: @${OWNER_USERNAME}`);
          console.log('='.repeat(70));
          console.log('💡 Visit your Render URL to view the template link');
          console.log('='.repeat(70));
        }
      } catch (error) {
        console.log('Auto-creation failed:', error.message);
      }
    }, 3000);
  }
  
  return server;
}

// Start the server
startServer().catch(console.error);
