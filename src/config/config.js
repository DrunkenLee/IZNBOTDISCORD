// Load environment variables
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  rcon: {
    host: process.env.RCON_HOST || "localhost",
    port: parseInt(process.env.RCON_PORT) || 27015,
    password: process.env.RCON_PASSWORD || ""
  },
  discord: {
    token: process.env.DISCORD_BOT_TOKEN || "",
    prefix: process.env.DISCORD_PREFIX || "!"
  },
  sftp: {
    host: process.env.SFTP_HOST || "",
    port: parseInt(process.env.SFTP_PORT) || 22,
    username: process.env.SFTP_USERNAME || "",
    password: process.env.SFTP_PASSWORD || ""
  },
  battlemetrics: {
    apiKey: process.env.BATTLEMETRICS_API_KEY || "",
    serverId: process.env.BATTLEMETRICS_SERVER_ID || ""
  },
  logging: {
    level: process.env.LOG_LEVEL || "info"
  },
  get(path) {
    const parts = path.split('.');
    let result = this;
    for (const part of parts) {
      result = result[part];
    }
    return result;
  }
};

export default config;