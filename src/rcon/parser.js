export function parseRconResponse(response) {
    // Assuming the response is a string, split it into lines
    const lines = response.split('\n');
    const parsedResponse = {};

    lines.forEach(line => {
        // Example parsing logic: split by the first colon
        const [key, ...value] = line.split(':');
        if (key) {
            parsedResponse[key.trim()] = value.join(':').trim();
        }
    });

    return parsedResponse;
}

export function formatRconCommand(command) {
    // Format the command for sending to the RCON server
    return command.trim();
}