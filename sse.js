const clients = new Map();

const broadcast = (data) => {
  clients.forEach((interval, client) => {
    if (!client.writableEnded) {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  });
};

const addClient = (res) => {
  const interval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keep-alive\n\n');
    }
  }, 30000); // Send keep-alive every 30 seconds to prevent connection timeout
  clients.set(res, interval);
};

const removeClient = (res) => {
  const interval = clients.get(res);
  if (interval) clearInterval(interval);
  clients.delete(res);
};

module.exports = { broadcast, addClient, removeClient };
