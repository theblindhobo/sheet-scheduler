const _ = require('lodash');
const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const logger = require('../../functions/logger/logger.js');

var calendarID = process.env.CALENDAR_ID;

const { insert } = require('./functions/insert.js');
const { update } = require('./functions/update.js');
const { remove } = require('./functions/remove.js');

let prevRows;
var sheetIndexStart = 5; // the row on the sheet to start looking at
var longestDuration = 12; // in hours


var actionArray = ['LIVE', 'VOD', 'DEMO'];
var defaultTimezone = 'UTC';

var minutesInPast = 10; // for checking 10mins in past up until future dates (to include NOW)


module.exports = {
  calendar: async (auth, rows) => {

    // Use lodash to check if the current rows and prevRows are NOT equal
    if(!_.isEqual(rows, prevRows)) {
      // grab calendar
      const calendar = google.calendar({ version: 'v3', auth });
      const res = await calendar.events.list({
        calendarId: calendarID
      });

      let existingCalendarEvents = [];
      if(res.data.items.length > 0) {
        await res.data.items.map(async (item) => {
          var eventDetails = {
            id: item.id,
            iCalUID: item.iCalUID,
            start: item.start.dateTime + ' ' + item.start.timeZone,
            end: item.end.dateTime + ' ' + item.end.timeZone,
            actionSource: item.location,
            line1: item.summary,
            line2: (item.description) ? item.description.replace( /(<([^>]+)>)/ig, '') : ''
          };
          var scheduledDate = new Date(eventDetails.start.split(' ')[0]);
          var dateNow = new Date(Date.now());
          if(dateNow.setMinutes(dateNow.getMinutes() - minutesInPast) <= scheduledDate.getTime()) {
            // these events are 'now' to future time
            await existingCalendarEvents.push(eventDetails);
          }
        });
      }

      prevRows = rows; // set current rows to equal prevRows

      let pendingCalendarEvents = [];
      await rows.map(async (row) => {

        var column = {
          index: (row[0]) ? row[0] : '',
          status: (row[1]) ? row[1] : '',
          datetime: (row[2]) ? row[2] : '',
          timezone: (row[3] == defaultTimezone) ? row[3] : defaultTimezone,
          action: (row[4]) ? row[4] : '',
          source: (row[5]) ? row[5] : '',
          line1: (row[6]) ? row[6] : '',
          line2: (row[7]) ? row[7] : '',
        };

        // starts looking at and after this index
        if(column.index >= sheetIndexStart) {
          // checks start time is valid date
          if(!isNaN(Date.parse(column.datetime + ' ' + column.timezone))) {
            // check if action is LIVE, DEMO, or VOD
            if(column.action !== '' && actionArray.includes(column.action)) {
              // set line1 if missing (for Cal entry)
              switch(column.action) {
                case 'LIVE':
                  column.line1 = (column.line1 !== '') ? column.line1 : ((column.source !== '') ? `${column.action} - ${column.source}` : column.action);
                  break;
                case 'VOD':
                  column.line1 = (column.line1 !== '') ? column.line1 : ((column.source !== '') ? `${column.action} - ${column.source}` : column.action);
                  break;
                case 'DEMO':
                  column.line1 = (column.line1 !== '') ? column.line1 : `Demoscene`;
                  break;
                default:
                  column.line1 = (column.line1 !== '') ? column.line1 : 'KONCEPT Event';
              }
              // if date is not in the past, continue (or past 10mins)
              var newDateNow = new Date(Date.now());
              if(newDateNow.setMinutes(newDateNow.getMinutes() - minutesInPast) <= (new Date(Date.parse(column.datetime + ' ' + column.timezone))).getTime()) {
                column.start = {
                  dateTime: new Date(Date.parse(column.datetime + ' ' + column.timezone)).toISOString().split('.')[0]+'Z',
                  timeZone: column.timezone
                };

                let duration = '1';
                column.duration = duration;
                // checks duration is a number
                if(!isNaN(parseFloat(column.duration))) {
                  // checks duration is under the max allowed time
                  if(!(parseFloat(column.duration) >= longestDuration)) {
                    // splits duration into array: [ hours, minutes ]
                    var splitHourMin = [
                        (parseFloat(column.duration) > 0) ? Math.floor(parseFloat(column.duration)) : Math.ceil(parseFloat(column.duration)),
                        parseFloat(column.duration) % 1
                    ];
                    // adds duration to start time to get end time
                    var workingEndDate = new Date(Date.parse(column.datetime + ' ' + column.timezone));
                    workingEndDate.setHours(workingEndDate.getHours() + splitHourMin[0]);
                    workingEndDate.setMinutes(workingEndDate.getMinutes() + Math.floor(splitHourMin[1] * 60));
                    column.end = await {
                      dateTime: workingEndDate.toISOString().split('.')[0]+'Z',
                      timeZone: column.timezone
                    };
                  } else {
                    logger.log(`[CALENDAR]\t\tDuration is too long. Setting end time to be exact as start time.`);
                    console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]`, `\t\tDuration is too long. Setting end time to be exact as start time.`);
                    column.end = column.start;
                  }
                } else {
                  logger.log(`[CALENDAR]\t\tDuration is not a valid number. Setting end time to be exact as start time.`);
                  console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]`, `\t\tDuration is not a valid number. Setting end time to be exact as start time.`);
                  column.end = column.start;
                }
                // push these to an array outside of 'map' ?
                // check if theres another event with same start time
                await pendingCalendarEvents.push(column);
              }
            }
          } else {
            if(column.status !== '' && column.datetime !== '') {
              logger.log(`[CALENDAR]\t\tDatetime field is not a valid date. Cannot add this event to the calendar: ${column}`);
              console.log(`\x1b[33m%s\x1b[0m`, `[CALENDAR]`, `\t\tDatetime field is not a valid date. Cannot add this event to the calendar:`, column);
            }
          }
        }

      });

      let _newEvents = [];
      let _exactEvent = [];
      let _sameStartTimeEvent = [];
      let _diffStartTimeEvent = [];
      let _other = [];
      let _checkEvent = [];
      if(existingCalendarEvents.length > 0) {
        // iterate through each of existing to see if pending is new, update, or need remove
        await existingCalendarEvents.map(async (existingEvent) => {
          // check against each pending
          await pendingCalendarEvents.map(async (pendingEvent) => {
            let checkStartTime = (pendingEvent.start.dateTime + ' ' + pendingEvent.start.timeZone === existingEvent.start);
            let checkEndTime = (pendingEvent.end.dateTime + ' ' + pendingEvent.end.timeZone === existingEvent.end);
            let checkAction = (existingEvent.actionSource.split(' ').includes(pendingEvent.action));
            let checkSource = (existingEvent.actionSource.split(' ').includes(pendingEvent.source) || (pendingEvent.action === 'DEMO' && existingEvent.actionSource === 'DEMO'));
            let checkLine1 = (pendingEvent.line1.replace(/live:/gi, '').trim() === existingEvent.line1);
            let checkLine2 = (pendingEvent.line2 === existingEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkSource && checkLine1 && checkLine2) {
              await _exactEvent.push(pendingEvent);
            } else if(checkStartTime && !(checkEndTime && checkAction && checkSource && checkLine1 && checkLine2)) {
              // if start times are the same but other fields are different, update existing event with new info
              await _sameStartTimeEvent.push({
                updateId: existingEvent.id,
                updateInfo: pendingEvent
              });
            } else if(!(checkStartTime && checkEndTime && checkAction && checkSource && checkLine1 && checkLine2)) {
              // start time doesnt match
              await _diffStartTimeEvent.push(pendingEvent);
              await _checkEvent.push(existingEvent);
            } else {
              // not sure what else could be here
              await _other.push(pendingEvent);
            }
          })
        })
      } else {
        // push all pendingCalendarEvents to insert.js
        _newEvents = pendingCalendarEvents;
      }



      _newEvents = await [...new Set(_newEvents)]; // unique
      _exactEvent = await [...new Set(_exactEvent)]; // unique
      _sameStartTimeEvent = await [...new Set(_sameStartTimeEvent)]; // unique
      _diffStartTimeEvent = await [...new Set(_diffStartTimeEvent)]; // unique
      _other = await [...new Set(_other)]; // unique
      _checkEvent = await [...new Set(_checkEvent)]; // unique

      let _exactMatches = [];
      // check exact events from diffStartTime and remove any from _diffStartTimeEvent (cause if the event is exact... it isnt going to be added again)
      if(_exactEvent.length > 0) {
        await _exactEvent.map(async (exactEvent) => {
          // check against _diffStartTimeEvent array
          await _diffStartTimeEvent.map(async (diffStartTimeEvent) => {
            if(_.isEqual(exactEvent, diffStartTimeEvent)) {
              // console.log('exact match');
              await _exactMatches.push(exactEvent);
            } else {
              // console.log('something else');
            }
          })
        });
        // remove exactMatches from _diffStartTimeEvent array
        _diffStartTimeEvent = await _diffStartTimeEvent.filter(item => !_exactMatches.includes(item)); // replaces array with only entries that are different (and dont have an exact match already)

        let removeTheseFromDiffArray = [];
        // remove diffStartTime from sameStartTimeEvent array
        if(_sameStartTimeEvent.length > 0) {
          await _sameStartTimeEvent.map(async (sameStartTimeEvent) => {
            await _diffStartTimeEvent.map(async (diffStartTimeEvent) => {
              if(_.isEqual(sameStartTimeEvent.updateInfo, diffStartTimeEvent)) {
                await removeTheseFromDiffArray.push(sameStartTimeEvent.updateInfo);
              }
            });
          });
          _diffStartTimeEvent = await _diffStartTimeEvent.filter(item => !removeTheseFromDiffArray.includes(item)); // removes events that are in _sameStartTimeEvent (updating)
        }
      }

      let _eventExists = [];
      if(_checkEvent.length > 0) {
        await _checkEvent.map(async (checkEvent) => {
          // check against each array?
          await _newEvents.map(async (newEvent) => {
            let checkStartTime = (newEvent.start.dateTime + ' ' + newEvent.start.timeZone === checkEvent.start);
            let checkEndTime = (newEvent.end.dateTime + ' ' + newEvent.end.timeZone === checkEvent.end);
            let checkAction = (checkEvent.actionSource.split(' ').includes(newEvent.action));
            let checkSource = (checkEvent.actionSource.split(' ').includes(newEvent.source) || (newEvent.action === 'DEMO' && checkEvent.actionSource === 'DEMO'));
            let checkLine1 = (newEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (newEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkSource && checkLine1 && checkLine2) {
              // console.log('exact match');
              await _eventExists.push({
                eventId: checkEvent.id,
                eventDetails: newEvent
              });
            }
          });
          await _exactEvent.map(async (exactEvent) => {
            let checkStartTime = (exactEvent.start.dateTime + ' ' + exactEvent.start.timeZone === checkEvent.start);
            let checkEndTime = (exactEvent.end.dateTime + ' ' + exactEvent.end.timeZone === checkEvent.end);
            let checkAction = (checkEvent.actionSource.split(' ').includes(exactEvent.action));
            let checkSource = (checkEvent.actionSource.split(' ').includes(exactEvent.source) || (exactEvent.action === 'DEMO' && checkEvent.actionSource === 'DEMO'));
            let checkLine1 = (exactEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (exactEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkSource && checkLine1 && checkLine2) {
              // console.log('exact match');
              await _eventExists.push({
                eventId: checkEvent.id,
                eventDetails: exactEvent
              });
            }
          });
          await _diffStartTimeEvent.map(async (diffStartTimeEvent) => {
            let checkStartTime = (diffStartTimeEvent.start.dateTime + ' ' + diffStartTimeEvent.start.timeZone === checkEvent.start);
            let checkEndTime = (diffStartTimeEvent.end.dateTime + ' ' + diffStartTimeEvent.end.timeZone === checkEvent.end);
            let checkAction = (checkEvent.actionSource.split(' ').includes(diffStartTimeEvent.action));
            let checkSource = (checkEvent.actionSource.split(' ').includes(diffStartTimeEvent.source) || (diffStartTimeEvent.action === 'DEMO' && checkEvent.actionSource === 'DEMO'));
            let checkLine1 = (diffStartTimeEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (diffStartTimeEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkSource && checkLine1 && checkLine2) {
              // console.log('exact match');
              await _eventExists.push({
                eventId: checkEvent.id,
                eventDetails: diffStartTimeEvent
              });
            }
          });
          await _other.map(async (otherEvent) => {
            let checkStartTime = (otherEvent.start.dateTime + ' ' + otherEvent.start.timeZone === checkEvent.start);
            let checkEndTime = (otherEvent.end.dateTime + ' ' + otherEvent.end.timeZone === checkEvent.end);
            let checkAction = (checkEvent.actionSource.split(' ').includes(otherEvent.action));
            let checkSource = (checkEvent.actionSource.split(' ').includes(otherEvent.source) || (otherEvent.action === 'DEMO' && checkEvent.actionSource === 'DEMO'));
            let checkLine1 = (otherEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (otherEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkSource && checkLine1 && checkLine2) {
              // console.log('exact match');
              await _eventExists.push({
                eventId: checkEvent.id,
                eventDetails: otherEvent
              });
            }
          });
        });
      }
      let mightDeleteTheseEvents = [];
      let _eventExistsIds = [];
      await _eventExists.map(async (eventExists) => await _eventExistsIds.push(eventExists.eventId));
      await existingCalendarEvents.filter(async (existingEvent) => {
        await _eventExistsIds.map(async (eventId) => {
          if(existingEvent.id !== eventId) await mightDeleteTheseEvents.push(existingEvent.id);
        });
      });

      mightDeleteTheseEvents = await [...new Set(mightDeleteTheseEvents)];
      let deleteTheseEvents = await mightDeleteTheseEvents.filter(item => !_eventExistsIds.includes(item));

      let dontDeleteEvents = [];
      // dont delete any that are in the update array
      if(_sameStartTimeEvent.length > 0) {
        await _sameStartTimeEvent.map(async (sameStartTimeEvent) => {
          await deleteTheseEvents.map(async (eventId) => {
            if(_.isEqual(sameStartTimeEvent.updateId, eventId)) {
              await dontDeleteEvents.push(eventId);
            }
          });
        });
        deleteTheseEvents = await deleteTheseEvents.filter(item => !dontDeleteEvents.includes(item));
      }




      var insertArray = _diffStartTimeEvent.concat(_newEvents); // these should be brand new entries
      var updateArray = _sameStartTimeEvent; // these should be events that need updating
      var removeArray = deleteTheseEvents; // these should be all events to delete

      await insert(auth, insertArray); // send new events to insert.js
      await update(auth, updateArray); // send update events to update.js
      await remove(auth, removeArray); // send delete events to remove.js







    } else {
      // console.log('those rows are identical');
    }
    // await console.log('7');


  }
}
