const fs = require('fs');
const { Console } = require('console');
const { dateRightNow } = require('./dateRightNow.js');

var daysForNewLog = 4; // every 4 days, new log is generated

let logger;
async function every7days() {
  let logFile = await fs.createWriteStream(`./logs/scheduler_log_${dateRightNow().split(' ').join('_').replaceAll(':', '')}.txt`);
  logger = await new Console({
    stdout: logFile
  });
  setTimeout(async () => {
    await logFile.close();
    logger = null;
  }, daysForNewLog * 24 * 60 * 60 * 1000);
  return logger;
}

module.exports = {
  log: async (message) => {
    if(!logger) logger = await every7days();
    logger.log(`[${dateRightNow()}] - ${message}`);
  }
};
