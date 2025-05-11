# Zomboid Discord RCON

## Overview
Zomboid Discord RCON is a Node.js application that integrates Project Zomboid's RCON (Remote Console) with Discord. This project allows you to manage your Project Zomboid server directly from a Discord channel, enabling seamless interaction and command execution.

## Features
- Connects to a Project Zomboid server via RCON.
- Responds to commands issued in a Discord channel.
- Provides logging for debugging and monitoring.
- Configurable settings for easy setup.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/zomboid-discord-rcon.git
   ```

2. Navigate to the project directory:
   ```
   cd zomboid-discord-rcon
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Create a `.env` file based on the `.env.example` file and fill in your Discord bot token and RCON credentials.

## Usage

1. Start the application:
   ```
   npm start
   ```

2. The bot will log in to Discord and connect to the RCON server. You can now issue commands in the designated Discord channel.

## Configuration

Configuration settings can be found in the `config/default.json` file. You can modify these settings to suit your server and bot requirements.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the ISC License. See the LICENSE file for more details.