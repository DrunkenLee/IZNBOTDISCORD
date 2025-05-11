export const pingCommand = {
  name: 'ping',
  description: 'Replies with Pong!',
  execute(message) {
    message.channel.send('Pong!');
  },
};

export const echoCommand = {
  name: 'echo',
  description: 'Replies with the message you send.',
  execute(message, args) {
    const response = args.join(' ') || 'You didn\'t provide a message!';
    message.channel.send(response);
  },
};

// Add more commands as needed
export const commands = [pingCommand, echoCommand];