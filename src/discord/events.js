export const onReady = (client) => {
  console.log(`Logged in as ${client.user.tag}!`);
};

export const onMessage = (client, message) => {
  if (message.author.bot) return;

  // Handle commands or other message events here
};