const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const logger = require('../../../functions/logger/logger.js');

var calendarID = process.env.CALENDAR_ID;

module.exports = {
  remove: async (auth, events) => {

    // grab calendar
    const calendar = google.calendar({ version: 'v3', auth });

    if(events.length > 0) {
      let i = 0;
      await events.map(async (id) => {
        i++;
        setTimeout(async () => {
          try {
            const res = await calendar.events.delete({
              calendarId: calendarID,
              eventId: id
            });
            logger.log(`[CALENDAR]\t[REMOVE]\tDeleted:\t${id}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]\t[REMOVE]`, `\tDeleted:\t${id}`);
          } catch(err) {
            if(err.toString().includes(`Resource has been deleted`)) {
              logger.log(`[CALENDAR]\t[REMOVE]\tError: Resource has been deleted (id: ${id})`);
              console.log(`\x1b[31m%s\x1b[0m`, `[CALENDAR]\t[REMOVE]`, `\tError: Resource has been deleted (id: ${id})`);
            } else {
              logger.log(`[CALENDAR]\t[REMOVE]\tError: ${err}`);
              console.log(`\x1b[31m%s\x1b[0m`, `[CALENDAR]\t[REMOVE]`, `\tError: `, err);
            }

          }
        }, i * 3000);
      });
    }



  }
};
