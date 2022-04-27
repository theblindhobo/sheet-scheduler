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
var longestDuration = 48; // in hours

var actionArray = ['LIVE', 'VOD', 'DEMO', 'OFFLINE'];
var defaultTimezone = 'UTC';

var minutesInPast = 10; // for checking 10mins in past up until future dates (to include NOW)

module.exports = {
  calendar: async (auth, rows, dupesRowsSorted, keepsRowsSorted) => {

    // Use lodash to check if the current rows and prevRows are NOT equal
    if(!_.isEqual(rows, prevRows)) {
      // grab calendar
      const calendar = google.calendar({ version: 'v3', auth });

      let resultItems = [];
      const res = await calendar.events.list({
        kind: "calendar#event",
        calendarId: calendarID,
        orderBy: "startTime",
        singleEvents: true,
        maxResults: 20
      });
      resultItems = await res.data.items;

      async function nextPage(token) {
        const nextRes = await calendar.events.list({
          kind: "calendar#event",
          calendarId: calendarID,
          orderBy: "startTime",
          singleEvents: true,
          maxResults: 20,
          pageToken: token
        });

        // console.log(`[resultItems.length]: ${resultItems.length}\n[nextRes.data.items.length]: ${nextRes.data.items.length}`);
        resultItems = await [...resultItems, ...nextRes.data.items];
        // console.log(`[AFTER CONCAT - resultItems.length]: ${resultItems.length}`);

        if(nextRes.data.nextPageToken !== undefined) {
          await nextPage(nextRes.data.nextPageToken);
        }
        return
      }

      if(res.data.nextPageToken !== undefined) {
        // console.log('START OF THE PAGE TOKENS');
        // console.log(`[res.data.nextPageToken]`, res.data.nextPageToken);
        await nextPage(res.data.nextPageToken); // run the query again and concat to existing array
      }

      let existingCalendarEvents = [];
      let existingDuplicates = [];
      if(resultItems.length > 0) {
        await resultItems.map(async (item) => {
          var eventDetails = {
            id: item.id,
            iCalUID: item.iCalUID,
            start: item.start.dateTime + ' ' + item.start.timeZone,
            end: item.end.dateTime + ' ' + item.end.timeZone,
            action: item.location,
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
        let prevStartTime;
        // remove duplicate entries with same start time
        await existingCalendarEvents.map(async (existingEvent) => {



          if(_.isEqual(existingEvent.start, prevStartTime)) {
            // push id of duplicate to existingDuplicates
            await existingDuplicates.push(existingEvent.id);
            // await existingDuplicates.push(existingEvent);
          }
          prevStartTime = existingEvent.start;
        });
        existingCalendarEvents = await existingCalendarEvents.filter(item => !existingDuplicates.includes(item.id));
      }

      // await console.log(`[existingCalendarEvents]`, existingCalendarEvents);

      prevRows = rows; // set current rows to equal prevRows

      let pendingCalendarEvents = [];
      await rows.map(async (row) => {
        var column = {
          index: (row[0]) ? row[0] : '',
          status: (row[1]) ? row[1] : '',
          datetime: (row[2]) ? row[2] : '',
          timezone: defaultTimezone,
          action: (row[4]) ? row[4] : '',
          source: (row[5]) ? row[5] : '',
          line1: (row[6]) ? row[6] : '',
          line2: (row[7]) ? row[7] : '',
          duration: (!isNaN(parseFloat(row[8]))) ? row[8] : '1'
        };
        // row[3] is now twitchID

        column.line1 = column.line1.replace(/\[![^\]]*\]/g, '').trim().replace(/live:/gi, '').trim().replace(/  +/g, ' '); // removes [!xxxx] and LIVE: and extra spaces

        // starts looking at and after this index
        if(column.index >= sheetIndexStart && keepsRowsSorted.includes(column.index)) {
          // checks start time is valid date
          if(!isNaN(Date.parse(column.datetime + ' ' + column.timezone))) {
            // check if action is LIVE, DEMO, VOD, or OFFLINE
            if(column.action !== '' && actionArray.includes(column.action)) {
              if((column.action === 'LIVE' && column.source !== '') || (column.action === 'VOD' && column.source !== '') || (column.action === 'DEMO') || (column.action === 'OFFLINE')) {
                // set line1 if missing (for Cal entry)
                switch(column.action) {
                  case 'OFFLINE':
                  case 'LIVE':
                  case 'VOD':
                    column.line1 = (column.line1 !== '') ? column.line1 : ((column.source !== '') ? column.action : column.action);
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

                  // checks duration is a number
                  if(!isNaN(parseFloat(column.duration))) {
                    // checks duration is under the max allowed time
                    if(!(parseFloat(column.duration) > longestDuration)) {
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


      // console.log(`[existingCalendarEvents.length]`, existingCalendarEvents.length);

      if(existingCalendarEvents.length > 0) {
        let existingUpcomingEvents = [];
        await existingCalendarEvents.map(async (existingEvent) => {
          var newDateNow = new Date(Date.now());
          if(newDateNow.setMinutes(newDateNow.getMinutes() - minutesInPast) <= (new Date(Date.parse(existingEvent.start.split(' ')[0]))).getTime()) {
            await existingUpcomingEvents.push(existingEvent);
          }
        });
        existingCalendarEvents = existingUpcomingEvents;

        // iterate through each of existing to see if pending is new, update, or need remove
        await existingCalendarEvents.map(async (existingEvent) => {
          // check against each pending
          await pendingCalendarEvents.map(async (pendingEvent) => {
            let checkStartTime = (pendingEvent.start.dateTime + ' ' + pendingEvent.start.timeZone === existingEvent.start);
            let checkEndTime = (pendingEvent.end.dateTime + ' ' + pendingEvent.end.timeZone === existingEvent.end);
            let checkAction = (existingEvent.action === pendingEvent.action);
            let checkLine1 = (pendingEvent.line1.replace(/live:/gi, '').trim() === existingEvent.line1);
            let checkLine2 = (pendingEvent.line2 === existingEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkLine1 && checkLine2) {
              await _exactEvent.push(pendingEvent);
            } else if(checkStartTime && !(checkEndTime && checkAction && checkLine1 && checkLine2)) {
              // if start times are the same but other fields are different, update existing event with new info
              await _sameStartTimeEvent.push({
                updateId: existingEvent.id,
                updateInfo: pendingEvent
              });
            } else if(!(checkStartTime && checkEndTime && checkAction && checkLine1 && checkLine2)) {
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


      // console.log(`[_sameStartTimeEvent.length]`, _sameStartTimeEvent.length);

      // check _sameStartTimeEvent against dupes
      if(_sameStartTimeEvent.length > 0) {
        _sameStartTimeEvent = await _sameStartTimeEvent.filter(item => !dupesRowsSorted.includes(item.updateInfo.index));
      } else {
        // console.log(`[_sameStartTimeEvent.length]\t\thowdy`);
      }


      /*
      console.log(`[_newEvents]`, _newEvents);
      console.log(`[_exactEvent]`, _exactEvent);
      console.log(`[_sameStartTimeEvent]`, _sameStartTimeEvent);
      console.log(`[_diffStartTimeEvent]`, _diffStartTimeEvent);
      console.log(`[_other]`, _other);
      console.log(`[_checkEvent]`, _checkEvent);
      */


      let _exactMatches = [];

      // console.log(`[_exactEvent.length]`, _exactEvent.length);

      // check exact events from diffStartTime and remove any from _diffStartTimeEvent (cause if the event is exact... it isnt going to be added again)
      if(_exactEvent.length > 0) {
        await _exactEvent.map(async (exactEvent) => {
          // check against _diffStartTimeEvent array
          await _diffStartTimeEvent.map(async (diffStartTimeEvent) => {
            if(_.isEqual(exactEvent, diffStartTimeEvent)) {
              // console.log('exact match', exactEvent);
              await _exactMatches.push(exactEvent);
            } else if((_.isEqual(exactEvent.start, diffStartTimeEvent.start))
                    && (exactEvent.action === 'VOD') && (diffStartTimeEvent.action === 'VOD')
                    && (_.isEqual(exactEvent.line1, diffStartTimeEvent.line1))
                    && (_.isEqual(exactEvent.line2, diffStartTimeEvent.line2))
                    && (_.isEqual(exactEvent.duration, diffStartTimeEvent.duration))) {
              // console.log('hellllllo');
              // console.log(`diffStartTimeEvent`, diffStartTimeEvent);
              // console.log(`[diffStartTimeEvent]`, diffStartTimeEvent);
              // console.log(`[exactEvent]`, exactEvent);

            } else {
              // console.log('something else');
            }
          })
        });

        // console.log(`[_exactMatches] 2222222`, _exactMatches);

        // remove exactMatches from _diffStartTimeEvent array
        _diffStartTimeEvent = await _diffStartTimeEvent.filter(item => !_exactMatches.includes(item)); // replaces array with only entries that are different (and dont have an exact match already)

        // console.log(`[_diffStartTimeEvent] 2222222`, _diffStartTimeEvent);

        let removeTheseFromDiffArray = [];

        // console.log(`[_sameStartTimeEvent.length]`, _sameStartTimeEvent.length);

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
        } else {
          // console.log(`[_sameStartTimeEvent.length]\t\thowdy`);
        }
      } else {
        // console.log(`[_exactEvent.length]\t\thowdy`);
      }

      let _eventExists = [];
      let deleteExistingEvents = [];

      // console.log(`[_checkEvent.length]`, _checkEvent.length);
      // console.log(`[_checkEvent]`, _checkEvent);

      if(_checkEvent.length > 0) {
        await _checkEvent.map(async (checkEvent) => {
          // check against each array?
          await _newEvents.map(async (newEvent) => {
            let checkStartTime = (newEvent.start.dateTime + ' ' + newEvent.start.timeZone === checkEvent.start);
            let checkEndTime = (newEvent.end.dateTime + ' ' + newEvent.end.timeZone === checkEvent.end);
            let checkAction = (checkEvent.action === newEvent.action);
            let checkLine1 = (newEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (newEvent.line2 === checkEvent.line2);

            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkLine1 && checkLine2) {
              // console.log('exact match');
              await _eventExists.push({
                eventId: checkEvent.id,
                eventDetails: newEvent
              });
            } else {
              /*
              console.log('you are here now..');
              console.log(`checkEvent`, checkEvent.action);
              console.log(`newEvent`, newEvent.action);
              */
            }
          });
          await _exactEvent.map(async (exactEvent) => {
            let checkStartTime = (exactEvent.start.dateTime + ' ' + exactEvent.start.timeZone === checkEvent.start);
            let checkEndTime = (exactEvent.end.dateTime + ' ' + exactEvent.end.timeZone === checkEvent.end);
            let checkAction = (checkEvent.action === exactEvent.action);
            let checkLine1 = (exactEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (exactEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkLine1 && checkLine2) {
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
            let checkAction = (checkEvent.action === diffStartTimeEvent.action);
            let checkLine1 = (diffStartTimeEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (diffStartTimeEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkLine1 && checkLine2) {
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
            let checkAction = (checkEvent.action === otherEvent.action);
            let checkLine1 = (otherEvent.line1.replace(/live:/gi, '').trim() === checkEvent.line1);
            let checkLine2 = (otherEvent.line2 === checkEvent.line2);
            // if all fields exist - event already exists on calendar & no updates needed
            if(checkStartTime && checkEndTime && checkAction && checkLine1 && checkLine2) {
              await _eventExists.push({
                eventId: checkEvent.id,
                eventDetails: otherEvent
              });
            }
          });
        });
        deleteExistingEvents = await _checkEvent.filter(item => !_eventExists.includes(item));
      } else {
        deleteExistingEvents = existingCalendarEvents;
      }

      let mightDeleteTheseEvents = [];
      let _eventExistsIds = [];

      // console.log(`[_eventExists.length]`, _eventExists.length);

      if(_eventExists.length > 0) {
        await _eventExists.map(async (eventExists) => await _eventExistsIds.push(eventExists.eventId));
        await existingCalendarEvents.filter(async (existingEvent) => {
          await _eventExistsIds.map(async (eventId) => {
            if(existingEvent.id !== eventId) await mightDeleteTheseEvents.push(existingEvent.id);
          });
        });
      } else {
        await deleteExistingEvents.map(async (existingEvent) => {
          await mightDeleteTheseEvents.push(existingEvent.id);
        });
      }

      mightDeleteTheseEvents = await [...new Set(mightDeleteTheseEvents)];
      let deleteTheseEvents = await mightDeleteTheseEvents.filter(item => !_eventExistsIds.includes(item));




      // dont delete any that are in the update array
      let dontDeleteEvents = [];
      // console.log(`[_sameStartTimeEvent.length]`, _sameStartTimeEvent.length);
      if(_sameStartTimeEvent.length > 0) {
        await _sameStartTimeEvent.map(async (sameStartTimeEvent) => {
          await deleteTheseEvents.map(async (eventId) => {
            if(_.isEqual(sameStartTimeEvent.updateId, eventId)) {
              await dontDeleteEvents.push(eventId);
            }
          });
        });
        deleteTheseEvents = await deleteTheseEvents.filter(item => !dontDeleteEvents.includes(item));
      } else {
        // console.log(`[_sameStartTimeEvent.length]\t\thowdy`);
      }




      // add the event info into Remove object
      var prepRemoveArray = await deleteTheseEvents.concat(existingDuplicates); // these should be all events to delete
      var newRemoveArrayWithObjects = [];
      if(prepRemoveArray.length > 0) {
        await resultItems.map(async (existingEvent) => {
          await prepRemoveArray.map(async (removeEventId) => {
            if(existingEvent.id === removeEventId) {
              await newRemoveArrayWithObjects.push({
                removeEventId: removeEventId,
                eventDetails: existingEvent
              });
            }
          })
        });
      }
      // console.log(`[newRemoveArrayWithObjects]`, newRemoveArrayWithObjects);


      var insertArray = await _diffStartTimeEvent.concat(_newEvents); // these should be brand new entries
      var updateArray = _sameStartTimeEvent; // these should be events that need updating
      var removeArray = newRemoveArrayWithObjects; // these should be all events to delete




      // console.log(`[_eventExists]`, _eventExists);

      // console.log(`[insertArray]`, insertArray);
      // console.log(`[updateArray]`, updateArray);
      // console.log(`[removeArray]`, removeArray);

      // console.log(`[insertArray.length]`, insertArray.length);
      // console.log(`[updateArray.length]`, updateArray.length);
      // console.log(`[removeArray.length]`, removeArray.length);


      await insert(auth, insertArray); // send new events to insert.js
      await update(auth, updateArray); // send update events to update.js
      await remove(auth, removeArray); // send delete events to remove.js

    } else {
      // console.log('those rows are identical');
    }
  }
}
