import { Client, GatewayIntentBits, Events } from 'discord.js';
import config from '../config/config.js';
import { Client as SSHClient } from 'ssh2';

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
    this.requiredConfirmations = 2;
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
        if (
          !message.member.roles.cache.some(role =>
            ['peasant', 'guardian'].includes(role.name.toLowerCase())
          )
        ) {
          return message.channel.send('❌ You need the @peasant or @guardian role to use this command.');
        }
        try {
          this.restartCooldown = 4 * 60 * 60 * 1000;
          const requiredConfirms = this.requiredConfirmations;

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
            const confirmedUsers = new Set();
            const canceledUsers = new Set();

            const confirmMsg = await message.channel.send(
              `**Force Restart Requested!**\n` +
              `This command is for emergency use only.\n\n` +
              `**${confirmedUsers.size}/${requiredConfirms}** confirms | **${canceledUsers.size}/1** cancels\n` +
              `Type \`confirm\` or \`cancel\` within 120 seconds.\n` +
              `**Note:** At least ${requiredConfirms} different users must confirm, or 1 must cancel.`
            );

            const filter = m =>
              ['confirm', 'cancel'].includes(m.content.toLowerCase()) &&
              m.member.roles.cache.some(role =>
                ['peasant', 'guardian'].includes(role.name.toLowerCase())
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

              await confirmMsg.edit(
                `**Force Restart Requested!**\n` +
                `This command is for emergency use only.\n\n` +
                `**${confirmedUsers.size}/${requiredConfirms}** confirms | **${canceledUsers.size}/1** cancels\n` +
                `Type \`confirm\` or \`cancel\` within 120 seconds.\n` +
                `**Note:** At least ${requiredConfirms} different users must confirm, or 1 must cancel.`
              );


              if (canceledUsers.size >= 1) {
                collector.stop('canceled');
              }
              // If enough confirms, stop collector and proceed
              if (confirmedUsers.size >= requiredConfirms) {
                collector.stop('confirmed');
              }
            });

            collector.on('end', async (collected, reason) => {
              if (reason === 'confirmed') {
                await message.channel.send(`Confirmed by ${confirmedUsers.size} users! Sending in-game warnings and initiating server restart...`);
                try {

                  await wrappedRconClient.send('servermsg "SERVER RESTART: Restart initiated by Discord vote. Server will restart in 3 minutes."');

                  setTimeout(async () => {

                    await wrappedRconClient.send('servermsg "SERVER RESTART IMMINENT: Saving world and restarting in 1 minute. Please finish what you\'re doing!"');

                    setTimeout(async () => {
                      const sshConfig = {
                        host: process.env.OVH_SG_HOST,
                        port: process.env.OVH_SG_PORT_SSH,
                        username: process.env.OVH_SG_USERNAME,
                        password: process.env.OVH_SG_PASSWORD,
                      };
                      const conn = new SSHClient();
                      await new Promise((resolve, reject) => {
                        conn.on('ready', () => {
                          conn.exec('./pzserver restart', (err, stream) => {
                            if (err) {
                              conn.end();
                              return reject(err);
                            }
                            stream.on('close', () => {
                              conn.end();
                              resolve();
                            });
                            stream.on('data', () => {});
                            stream.stderr.on('data', () => {});
                          });
                        }).on('error', reject).connect(sshConfig);
                      });
                      await message.channel.send('In-game warnings sent. Server will restart now.');
                      this.lastRestartTime = Date.now();
                    }, 60000);
                  }, 120000);
                } catch (restartError) {
                  await message.channel.send(`Error during restart: ${restartError.message}`);
                  console.error('Restart error:', restartError);
                }
              } else if (reason === 'canceled') {
                await confirmMsg.edit(`Restart canceled. Received ${canceledUsers.size}/1 cancels.`);
                await message.channel.send('Server restart vote has been canceled by users.');
              } else {
                await confirmMsg.edit(`Restart not confirmed. Only ${confirmedUsers.size}/${requiredConfirms} confirms and ${canceledUsers.size}/1 cancels received.`);
              }
            });
          }, 1000);
        } catch (error) {
          message.channel.send(`Error initiating restart: ${error.message}`);
          console.error('Restart command error:', error);
        }
      }
    });
  }
}