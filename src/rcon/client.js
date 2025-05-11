import { Rcon } from 'rcon-client';

export class RconClient {
    constructor(host, port, password) {
        this.host = host;
        this.port = port;
        this.password = password;
        this.client = null;
    }

    async connect() {
        try {
            this.client = await Rcon.connect({
                host: this.host,
                port: this.port,
                password: this.password
            });

            console.log(`Connected to RCON at ${this.host}:${this.port}`);
            return this.client;
        } catch (error) {
            console.error('RCON connection error:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.end();
            this.client = null;
            console.log('Disconnected from RCON server');
        }
    }

    async send(command) {
        if (!this.client) {
            throw new Error('Not connected to RCON server');
        }

        try {
            return await this.client.send(command);
        } catch (error) {
            console.error(`Error sending command ${command}:`, error);
            throw error;
        }
    }
}