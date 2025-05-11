module.exports = {
  formatMessage: (username, message) => {
    return `${username}: ${message}`;
  },
  
  parseCommand: (input) => {
    const parts = input.split(' ');
    const command = parts.shift();
    return { command, args: parts };
  },
  
  isValidCommand: (command, validCommands) => {
    return validCommands.includes(command);
  }
};