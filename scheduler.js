const fs = require('fs');
const logger = require('./functions/logger/logger.js');
const { google } = require('googleapis');
const { authorize, getNewToken } = require('./functions/authorize.js');

const refreshSheetInSecs = 10; // Refreshes sheet information every x seconds

const PORT_NUMBER = '3124';

const WebSocket = require('ws');
var client;
function connectWebsocket() {
  client = new WebSocket(`ws://localhost:${PORT_NUMBER}`);
  client.on('open', function open() {
    logger.log(`[WEBSOCKET] Connected at ws://localhost:${PORT_NUMBER}`);
    console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Connected at ws://localhost:${PORT_NUMBER}`);
  });
  function heartbeat(client) {
    clearTimeout(client.pingTimeout);
    client.pingTimeout = setTimeout(() => {
      client.close(1000, 'Terminated');
    }, 30000 + 1000);
  }
  client.on('message', async function(event) {
    const data = JSON.parse(event);
    if(data.event === 'ping') {
      heartbeat(client);
      client.send(JSON.stringify({ "event": "pong" }));
    }
  });

  client.on('error', (err) => {
    // logger.log(`[WEBSOCKET] Error: ${err.errno}`);
    // console.log(`\x1b[32m%s\x1b[0m`, `[WEBSOCKET]`, `Error:`, err.errno);
  });
  client.on('close', function(event) {
    clearTimeout(client.pingTimeout);
    client = null; // connection died, discard old and create new
    logger.log(`[WEBSOCKET] Error: ${event}\tDisconnected from WebSocket..\treconnecting..`);
    console.log(`\x1b[35m%s\x1b[31m%s\x1b[33m%s\x1b[31m%s\x1b[0m`, `[WEBSOCKET]`, ` Error: `, event, `\t Disconnected from WebSocket..`, `reconnecting..`);
    setTimeout(function () {
      connectWebsocket(); // Reconnect
    }, 10000);
  });
  return client;
}
connectWebsocket();
var ws;
const wsOpenListener = (event) => {
  logger.log(`[WEBSOCKET] Connected.`);
  console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Connected.`);
};
const wsMessageListener = (event) => {
  logger.log(`[WEBSOCKET] Received message.`);
  console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Received message.`);
};
const wsCloseListener = (event) => {
  if(ws) {
    logger.log(`[WEBSOCKET] Disconnected.`);
    console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Disconnected.`);
  }
  ws = new WebSocket(`ws://localhost:${PORT_NUMBER}`);
  ws.on('open', wsOpenListener);
  ws.on('message', wsMessageListener);
  ws.on('close', wsCloseListener);
};

require('./functions/onOffWebhook.js').onOffWebhook();
// check if twitch online every minute
setInterval(() => {
  require('./functions/onOffWebhook.js').onOffWebhook();
}, 60000);


// starts app
fs.readFile('credentials.json', (err, content) => {
  if (err) {
    logger.log(`[SCHEDULER] Error loading client secret file: ${err}`);
    return console.log(`[SCHEDULER] Error loading client secret file:`, err);
  }
  authorize(JSON.parse(content), searchSheet);
});


function searchSheet(auth) {

  require('./functions/sheetLogic.js').sheetLogic(google, auth, client);

  setTimeout(() => {
    searchSheet(auth);
  }, refreshSheetInSecs * 1000);
}
