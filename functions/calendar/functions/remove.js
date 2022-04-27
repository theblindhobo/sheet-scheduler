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
      await events.map(async (e) => {
        i++;
        setTimeout(async () => {
          try {
            const res = await calendar.events.delete({
              calendarId: calendarID,
              eventId: e.removeEventId
            });

            var date = e.eventDetails.start.dateTime;
            var time = date.split('T')[1].substring(0,5);
            date = date.split('T')[0];

            logger.log(`[CALENDAR]\t[REMOVE]\tDeleted:\n\t\t\t\t\t\t\t\tStart Time:\t${date} ${time} ${e.eventDetails.start.timeZone}\n\t\t\t\t\t\t\t\tEvent Summary:\t${e.eventDetails.summary}\n\t\t\t\t\t\t\t\tEvent ID:\t${e.removeEventId}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]\t[REMOVE]`, `\tDeleted:\n\t\t\t\t\tStart Time:\t${date} ${time} ${e.eventDetails.start.timeZone}\n\t\t\t\t\tEvent Summary:\t${e.eventDetails.summary}\n\t\t\t\t\tEvent ID:\t${e.removeEventId}`);
          } catch(err) {
            if(err.toString().includes(`Resource has been deleted`)) {
              logger.log(`[CALENDAR]\t[REMOVE]\tError: Resource has been deleted:\n\t\t\t\t\t\t\t\tStart Time:\t${date} ${time} ${e.eventDetails.start.timeZone}\n\t\t\t\t\t\t\t\tEvent Summary:\t${e.eventDetails.summary}\n\t\t\t\t\t\t\t\tEvent ID:\t${e.removeEventId}`);
              console.log(`\x1b[31m%s\x1b[0m`, `[CALENDAR]\t[REMOVE]`, `\tError: Resource has been deleted:\n\t\t\t\t\tStart Time:\t${date} ${time} ${e.eventDetails.start.timeZone}\n\t\t\t\t\tEvent Summary:\t${e.eventDetails.summary}\n\t\t\t\t\tEvent ID:\t${e.removeEventId}`);
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
