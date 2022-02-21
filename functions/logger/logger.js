const fs = require('fs');
const { Console } = require('console');
const { dateRightNow } = require('./dateRightNow.js');

const logFile = fs.createWriteStream(`./logs/websocket_log_${dateRightNow().split(' ').join('_').replaceAll(':', '')}.txt`);
const logger = new Console({
  stdout: logFile
});

module.exports = {
  log: (message) => {
    logger.log(`[${dateRightNow()}] - ${message}`);
  }
};
