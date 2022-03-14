const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const logger = require('../../../functions/logger/logger.js');

var calendarID = process.env.CALENDAR_ID;

module.exports = {
  insert: async (auth, events) => {

    // grab calendar
    const calendar = google.calendar({ version: 'v3', auth });

    if(events.length > 0) {
      let i = 0;
      await events.map(async (calEvent) => {
        i++;
        setTimeout(async () => {
          let location;
          let summary;
          switch(calEvent.action) {
            case 'LIVE':
              location = (calEvent.source !== '') ? `${calEvent.action} - ${calEvent.source}` : calEvent.action;
              summary = calEvent.line1.replace(/live:/gi, '').trim();
              break;
            case 'VOD':
              location = (calEvent.source !== '') ? `${calEvent.action} - ${calEvent.source}` : calEvent.action;
              summary = calEvent.line1.trim();
              break;
            case 'DEMO':
              location = calEvent.action;
              summary = calEvent.line1.trim();
              break;
            default:
              location = (calEvent.action) ? calEvent.action : '';
              summary = calEvent.line1.trim();
          }
          try {
            const res = await calendar.events.insert({
              calendarId: calendarID,
              requestBody: {
                start: calEvent.start,
                end: calEvent.end,
                summary: summary,
                location: location,
                description: calEvent.line2,
                guestsCanInviteOthers: true
              }
            });
            logger.log(`[CALENDAR]\t[INSERT]\tInserted:\t${calEvent.start.dateTime.replace('T', ' ').replace('Z', '').trim()} - ${summary}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]\t[INSERT]`, `\tInserted:\t${calEvent.start.dateTime.replace('T', ' ').replace('Z', '').trim()} - ${summary}`);
          } catch(err) {
            logger.log(`[CALENDAR]\t[INSERT]\tError: ${err}`);
            console.log(`\x1b[31m%s\x1b[0m`, `[CALENDAR]\t[INSERT]`, `\tError: `, err);
          }
        }, i * 3000);
      });
    }

  }
};
