import { DiscordBot } from './discord/bot.js';
import { RconClient } from './rcon/client.js';
import config from './config/config.js';

async function main() {
  const discordBot = new DiscordBot(config.discord.token);
  let rconClient = new RconClient(config.rcon.host, config.rcon.port, config.rcon.password);

  try {
    // First, log in to Discord
    console.log('Logging in to Discord...');
    await discordBot.login();
    console.log('Discord bot logged in successfully.');

    // Set up initial RCON connection
    console.log('Connecting to RCON server...');
    await rconClient.connect();
    console.log('Connected to RCON server.');

    // Setup event listeners with the wrapped RCON client
    discordBot.setupEventListeners(rconClient);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      discordBot.cleanup();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

  } catch (error) {
    console.error('Error during initialization:', error);

    // If Discord connection fails, we should exit
    if (!discordBot.client.isReady()) {
      console.error('Discord connection failed. Exiting...');
      process.exit(1);
    }

    // If only RCON fails, we can continue and let the auto-reconnect handle it
    if (error.message.includes('RCON')) {
      console.log('Will attempt to reconnect to RCON server automatically...');
      // The heartbeat mechanism in the DiscordBot class will handle reconnection
    }
  }
}

main();