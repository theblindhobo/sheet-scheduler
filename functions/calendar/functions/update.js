const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const logger = require('../../../functions/logger/logger.js');

var calendarID = process.env.CALENDAR_ID;

module.exports = {
  update: async (auth, events) => {

    // grab calendar
    const calendar = google.calendar({ version: 'v3', auth });

    if(events.length > 0) {
      let i = 0;
      await events.map(async (calEvent) => {
        i++;
        setTimeout(async () => {
          let location;
          let summary;
          switch(calEvent.updateInfo.action) {
            case 'LIVE':
              location = (calEvent.updateInfo.source !== '') ? `${calEvent.updateInfo.action} - ${calEvent.updateInfo.source}` : calEvent.updateInfo.action;
              summary = calEvent.updateInfo.line1.replace(/live:/gi, '').trim();
              break;
            case 'VOD':
              location = (calEvent.updateInfo.source !== '') ? `${calEvent.updateInfo.action} - ${calEvent.updateInfo.source}` : calEvent.updateInfo.action;
              summary = calEvent.updateInfo.line1.trim();
              break;
            case 'DEMO':
              location = calEvent.updateInfo.action;
              summary = `Demoscene`
              break;
            default:
              location = (calEvent.updateInfo.action) ? calEvent.updateInfo.action : '';
              summary = calEvent.updateInfo.action;
          }
          try {
            const res = await calendar.events.update({
              calendarId: calendarID,
              eventId: calEvent.updateId,
              requestBody: {
                start: calEvent.updateInfo.start,
                end: calEvent.updateInfo.end,
                summary: summary,
                location: location,
                description: calEvent.updateInfo.line2
              }
            });
            logger.log(`[CALENDAR]\t[UPDATE]\tUpdated ID: ${calEvent.updateId}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]\t[UPDATE]`, `\tUpdated ID: ${calEvent.updateId}`);
          } catch(err) {
            logger.log(`[CALENDAR]\t[UPDATE]\tError: ${err}`);
            console.log(`\x1b[31m%s\x1b[0m`, `[CALENDAR]\t[UPDATE]`, `\tError: `, err);
          }
        }, i * 3000);
      });
    }

  }
};
