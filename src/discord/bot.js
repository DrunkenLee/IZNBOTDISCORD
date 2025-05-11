import { Client, GatewayIntentBits, Events } from 'discord.js';
import config from '../config/config.js';

export class DiscordBot {
  constructor(token) {
    this.token = token || config.discord.token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    // Track the last restart time for cooldown
    this.lastRestartTime = null;
    // Required number of confirmations
    this.requiredConfirmations = 5;
    // Cooldown period in milliseconds (1 hour)
    this.restartCooldown = 60 * 60 * 1000;

    // RCON connection management
    this.rconClient = null;
    this.rconHeartbeatInterval = null;
    this.heartbeatIntervalTime = 5 * 60 * 1000; // 5 minutes
    this.isReconnecting = false;

    // Add this for cooldown tracking
    this.commandCooldowns = new Map();
    this.cooldownTime = 2 * 60 * 1000; // 2 minutes in ms
  }

  async login() {
    return this.client.login(this.token);
  }

  setupRconConnection(rconClient) {
    this.rconClient = rconClient;

    // Setup RCON heartbeat to keep connection alive
    this.startRconHeartbeat();

    // Return the wrapped rcon client with auto-reconnect
    return {
      send: async (command) => {
        try {
          return await this.sendRconCommand(command);
        } catch (error) {
          console.error(`RCON command failed: ${error.message}`);

          // Try to reconnect and retry the command once
          if (error.message.includes('WebSocket') || error.message.includes('ECONNRESET') ||
              error.message.includes('not connected') || error.message.toLowerCase().includes('timeout')) {
            console.log('Connection issue detected, attempting to reconnect...');

            try {
              await this.reconnectRcon();
              console.log('Reconnected to RCON, retrying command...');
              return await this.sendRconCommand(command);
            } catch (reconnectError) {
              throw new Error(`Failed to reconnect to RCON: ${reconnectError.message}`);
            }
          }

          throw error;
        }
      }
    };
  }

  startRconHeartbeat() {
    // Clear any existing interval
    if (this.rconHeartbeatInterval) {
      clearInterval(this.rconHeartbeatInterval);
    }

    // Set up a new heartbeat interval
    this.rconHeartbeatInterval = setInterval(async () => {
      try {
        console.log('Sending RCON heartbeat...');
        await this.sendRconCommand('players');
        console.log('RCON heartbeat successful');
      } catch (error) {
        console.error(`RCON heartbeat failed: ${error.message}`);
        this.reconnectRcon().catch(e => console.error(`Failed to reconnect: ${e.message}`));
      }
    }, this.heartbeatIntervalTime);

    console.log(`RCON heartbeat started, interval: ${this.heartbeatIntervalTime / 1000} seconds`);
  }

  async sendRconCommand(command) {
    if (!this.rconClient) {
      throw new Error('RCON client not initialized');
    }

    return this.rconClient.send(command);
  }

  async reconnectRcon() {
    if (this.isReconnecting) {
      console.log('Reconnection already in progress, skipping...');
      return;
    }

    this.isReconnecting = true;

    try {
      console.log('Attempting to reconnect to RCON server...');

      // This assumes your RCON client has a connect or reconnect method
      // Adjust this based on your actual RCON client implementation
      if (typeof this.rconClient.connect === 'function') {
        await this.rconClient.connect();
      } else if (typeof this.rconClient.reconnect === 'function') {
        await this.rconClient.reconnect();
      } else {
        // If no explicit reconnect method, you might need to recreate the client
        // This would require more context on how your RCON client is created
        throw new Error('No reconnect method available on RCON client');
      }

      console.log('Successfully reconnected to RCON server');
    } finally {
      this.isReconnecting = false;
    }
  }

  setupEventListeners(rconClient) {
    // Set up RCON with auto-reconnect wrapper
    const wrappedRconClient = this.setupRconConnection(rconClient);

    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      const prefix = config.discord.prefix;

      // Check if message starts with prefix
      if (!message.content.startsWith(prefix)) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // --- Cooldown check ---
      const isAdmin = message.member && message.member.roles.cache.some(role => role.name.toLowerCase() === 'admin');
      const now = Date.now();
      const cooldownKey = `${message.author.id}:${command}`;
      if (!isAdmin) { // Admins are immune to cooldown
        if (this.commandCooldowns.has(cooldownKey)) {
          const lastUsed = this.commandCooldowns.get(cooldownKey);
          if (now - lastUsed < this.cooldownTime) {
            const remaining = Math.ceil((this.cooldownTime - (now - lastUsed)) / 1000);
            return message.reply(`⏳ Please wait ${remaining} seconds before using \`${prefix}${command}\` again.`);
          }
        }
        this.commandCooldowns.set(cooldownKey, now);
      }

      // Handle commands
      if (command === 'ping') {
        // Simple ping response
        const timeBefore = Date.now();
        const reply = await message.channel.send('Pinging...');
        const pingTime = Date.now() - timeBefore;
        reply.edit(`Pong! 🏓\nBot Latency: ${pingTime}ms\nAPI Latency: ${Math.round(this.client.ws.ping)}ms`);
      } else if (command === 'players') {
        try {
          const response = await wrappedRconClient.send('players');
          message.channel.send(`Players online: ${response || 'None'}`);
        } catch (error) {
          message.channel.send(`Error fetching players list: ${error.message}`);
          console.error(error);
        }
      } else if (command === 'restart') {
        // Only allow users with the "peasant" or "guardian" role to initiate restart
        if (
          !message.member.roles.cache.some(role =>
            ['peasant', 'guardian'].includes(role.name.toLowerCase())
          )
        ) {
          return message.channel.send('❌ You need the @peasant or @guardian role to use this command.');
        }
        try {
          // Set 4 hours cooldown (in ms)
          this.restartCooldown = 4 * 60 * 60 * 1000;
          this.requiredConfirmations = 2; // 2 confirmations required

          // Check cooldown period
          if (this.lastRestartTime) {
            const timeSinceLastRestart = Date.now() - this.lastRestartTime;
            if (timeSinceLastRestart < this.restartCooldown) {
              const remainingTime = this.restartCooldown - timeSinceLastRestart;
              const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
              return message.channel.send(
                `Server restart is on cooldown. Please wait ${remainingMinutes} more minutes before restarting again.`
              );
            }
          }

          setTimeout(async () => {
            // Track unique users for confirm and cancel
            const confirmedUsers = new Set();
            const canceledUsers = new Set();

            const confirmMsg = await message.channel.send(
              `**Force Restart Requested!**\n` +
              `This command is for emergency use only.\n\n` +
              `**${confirmedUsers.size}/2** confirms | **${canceledUsers.size}/1** cancels\n` +
              `Type \`confirm\` or \`cancel\` within 120 seconds.\n` +
              `**Note:** At least 2 different users must confirm, or 1 must cancel.`
            );

            const filter = m => (
              ['confirm', 'cancel'].includes(m.content.toLowerCase()) &&
              m.member.roles.cache.some(role =>
                ['peasant', 'guardian'].includes(role.name.toLowerCase())
              )
            );
            const collector = message.channel.createMessageCollector({ filter, time: 120000 });

            collector.on('collect', async (m) => {
              const action = m.content.toLowerCase();
              if (action === 'confirm' && !confirmedUsers.has(m.author.id)) {
                confirmedUsers.add(m.author.id);
              }
              if (action === 'cancel' && !canceledUsers.has(m.author.id)) {
                canceledUsers.add(m.author.id);
              }

              // Update the confirmation message
              await confirmMsg.edit(
                `**Force Restart Requested!**\n` +
                `This command is for emergency use only.\n\n` +
                `**${confirmedUsers.size}/2** confirms | **${canceledUsers.size}/1** cancels\n` +
                `Type \`confirm\` or \`cancel\` within 120 seconds.\n` +
                `**Note:** At least 2 different users must confirm, or 1 must cancel.`
              );

              // If enough cancels, stop collector and cancel
              if (canceledUsers.size >= 1) {
                collector.stop('canceled');
              }
              // If enough confirms, stop collector and proceed
              if (confirmedUsers.size >= 2) {
                collector.stop('confirmed');
              }
            });

            collector.on('end', async (collected, reason) => {
              if (reason === 'confirmed') {
                await message.channel.send(`Confirmed by ${confirmedUsers.size} users! Initiating server restart sequence...`);
                try {
                  await wrappedRconClient.send('servermsg "SERVER RESTART: Force restart initiated by Discord vote. Server will restart in 2 minutes."');
                  await message.channel.send('In-game notification sent. Waiting 2 minutes before restart...');
                  await new Promise(resolve => setTimeout(resolve, 120000));
                  await wrappedRconClient.send('servermsg "SERVER RESTART IMMINENT: Saving world and restarting. Please finish what you\'re doing!"');
                  await message.channel.send('Final warning sent. Restarting server in 10 seconds...');
                  await new Promise(resolve => setTimeout(resolve, 10000));
                  await wrappedRconClient.send('quit');
                  await message.channel.send('Server restart command sent successfully.');
                  this.lastRestartTime = Date.now();
                } catch (restartError) {
                  await message.channel.send(`Error during restart: ${restartError.message}`);
                  console.error('Restart error:', restartError);
                }
              } else if (reason === 'canceled') {
                await confirmMsg.edit(`Restart canceled. Received ${canceledUsers.size}/1 cancels.`);
                await message.channel.send('Server restart vote has been canceled by users.');
              } else {
                await confirmMsg.edit(`Restart not confirmed. Only ${confirmedUsers.size}/2 confirms and ${canceledUsers.size}/1 cancels received.`);
              }
            });
          }, 1000);
        } catch (error) {
          message.channel.send(`Error initiating force restart: ${error.message}`);
          console.error('Error during restart command:', error);
        }
      } else if (command === 'adduser') {
        // Check if user has admin role
        if (!message.member.roles.cache.some(role => role.name.toLowerCase() === 'guardian')) {
          console.log(role.name.toLowerCase());
          return message.channel.send('❌ You need the @Guardian role to use this command.');
        }

        // Check if the user has provided both username and password
        if (args.length < 2) {
          return message.channel.send('❌ Missing arguments! Usage: `!adduser <username> <password>`');
        }

        const username = args[0];
        const password = args[1];

        try {
          // Send the adduser command to the server
          const response = await wrappedRconClient.send(`adduser "${username}" "${password}"`);
          message.channel.send(`✅ User command executed: ${response || 'Command sent, but no response received.'}`);

          // For security, try to delete the original message that contains the password
          try {
            if (message.deletable) {
              await message.delete();
              message.channel.send('Original message deleted for security.');
            }
          } catch (deleteError) {
            console.error('Failed to delete message containing password:', deleteError);
          }
        } catch (error) {
          message.channel.send(`❌ Error adding user: ${error.message}`);
          console.error('Error adding user:', error);
        }
      } else if (command === 'removeuserfromwhitelist') {
        // Check if user has admin role
        if (!message.member.roles.cache.some(role => role.name.toLowerCase() === 'guardian')) {
          return message.channel.send('❌ You need the @guardian role to use this command.');
        }

        // Check if the user has provided a username
        if (args.length < 1) {
          return message.channel.send('❌ Missing arguments! Usage: `!removeuserfromwhitelist <username>`');
        }

        const username = args[0];

        try {
          // Send the removeuserfromwhitelist command to the server
          const response = await wrappedRconClient.send(`removeuserfromwhitelist "${username}"`);
          message.channel.send(`✅ User removed from whitelist: ${response || 'Command sent, but no response received.'}`);
        } catch (error) {
          message.channel.send(`❌ Error removing user from whitelist: ${error.message}`);
          console.error('Error removing user from whitelist:', error);
        }
      } else if (command === 'help') {
        // Create an embed for better formatting
        const prefix = config.discord.prefix;

        // Create a formatted help message
        let helpMessage = '**🤖 IZN SUPPORT - Command List 🤖**\n\n';

        // General commands (no role requirements)
        helpMessage += '**General Commands:**\n';
        helpMessage += `\`${prefix}help\` - Shows this help message\n`;
        helpMessage += `\`${prefix}ping\` - Check bot response time\n`;
        helpMessage += `\`${prefix}players\` - Show currently online players\n`;
        helpMessage += `\`${prefix}restart\` - Initiate server restart (requires ${this.requiredConfirmations} user confirmations)\n\n`;
        // Admin commands
        helpMessage += '**Admin Commands:**\n';
        helpMessage += `\`${prefix}adduser <username> <password>\` - Add a user to the whitelist (requires @admin role)\n`;
        helpMessage += `\`${prefix}removeuserfromwhitelist <username>\` - Remove a user from the whitelist (requires @admin role)\n\n`;

        // Note about server commands
        helpMessage += '**Note:** Server commands may take a moment to process depending on server load.';

        // Send the help message
        message.channel.send(helpMessage);
      } else if (command === 'killboard') {
        try {
          const statusMsg = await message.channel.send('Fetching killboard, please wait...');
          const result = await this.sftpLogReader.getKillBoard();
          if (result && result.length > 0) {
            let reply = '**🏆 Top 10 Killboard 🏆**\n\n```';
            result.forEach((entry, idx) => {
              reply += `\n${idx + 1}. ${entry.name} — ${entry.kills} kills`;
            });
            reply += '\n```';
            reply += '*Note: This records is not real time data. and counted from last CC Defense Event*';
            await statusMsg.edit(reply);
          } else {
            await statusMsg.edit('No kill data found.');
          }
        } catch (err) {
          message.channel.send(`Error fetching killboard: ${err.message}`);
          console.error('Error in !killboard:', err);
        }
      } else if (command === 'topplaytime') {
        try {
          const statusMsg = await message.channel.send('Fetching top players by playtime from BattleMetrics...');
          const players = await this.battlemetrics.getTopPlayersByPlaytime(10);
          if (players && players.length > 0) {
            let reply = '**⏱️ Top 10 Players by Playtime (BattleMetrics)**\n\n```';
            players.forEach((player, idx) => {
              // Convert seconds to hours:minutes
              const hours = Math.floor(player.time / 3600);
              const minutes = Math.floor((player.time % 3600) / 60);
              reply += `\n${idx + 1}. ${player.name} — ${hours}h ${minutes}m`;
            });
            reply += '\n```';
            reply += '\nNotes: *This Data is taken from BattleMetrics, and may not be real time data.*';
            await statusMsg.edit(reply);
          } else {
            await statusMsg.edit('No playtime data found.');
          }
        } catch (err) {
          message.channel.send(`Error fetching playtime data: ${err.message}`);
          console.error('Error in !topplaytime:', err);
        }
      } else if (command === 'serverinfo') {
        try {
          const statusMsg = await message.channel.send('Fetching server info from BattleMetrics...');
          const url = `https://api.battlemetrics.com/servers/${config.battlemetrics.serverId}`;
          const headers = config.battlemetrics.apiKey
            ? { Authorization: `Bearer ${config.battlemetrics.apiKey}` }
            : {};
          const res = await fetch(url, { headers });
          if (!res.ok) throw new Error(`BattleMetrics API error: ${res.statusText}`);
          const data = await res.json();
          const attr = data.data.attributes;
          const details = attr.details || {};

          let reply = `**🖥️ Server Info**\n\n`;
          reply += `**Name:** ${attr.name}\n`;
          reply += `**IP:** ${attr.ip}\n`;
          reply += `**Port:** ${attr.port}\n`;
          reply += `**Status:** ${attr.status}\n`;
          reply += `**Open:** ${details.zomboid_open ? 'Yes' : 'No'}\n`;
          reply += `**Version:** ${details.version || 'Unknown'}\n`;

          await statusMsg.edit(reply);
        } catch (err) {
          message.channel.send(`Error fetching server info: ${err.message}`);
          console.error('Error in !serverinfo:', err);
        }
      }
    });

    this.client.once(Events.ClientReady, () => {
      console.log(`Bot is ready! Logged in as ${this.client.user.tag}`);
    });
  }

  // Make sure to clean up when the bot is shutting down
  cleanup() {
    if (this.rconHeartbeatInterval) {
      clearInterval(this.rconHeartbeatInterval);
      this.rconHeartbeatInterval = null;
    }
  }
}