const fs = require('fs');
const logger = require('./logger/logger.js');
const schedule = require('node-schedule');
const _ = require('lodash');
const dotenv = require('dotenv');
dotenv.config();

var konceptSpacerEmote = 'koncep2SWING'; // !schedule separator
var multiLinedVariable = ' '; // remove duplicate word from !schedule and place once in beginning
var defaultTimezone = 'UTC';

const { calendar } = require('./calendar/sortEvents.js');
let calendarCounter = 0; // to determine sending rows information to calendar app
var calendarRefreshStaysSame = 5; // 5 refreshes before sending information to calendar.js

const {
  toTimestamp, clearDisplayDone,
  sendDisplay, writeStatusDone,
  writeStatusScheduled, cleanupStatus,
  sendTitle, writeNowDatetime,
  switchWebhookAlert } = require('./functions.js');

const webhook = require('./webhook.js').webhook; // event announcements
var minsBeforeCacheStreamPreview = 2; // wait 2 mins before caching stream preview then post announcement

const twitchSetTitle = require('./twitch/setTitle.js').setTitle; // auto set stream title when event gets triggered



let nowIndex; // 'NOW'
var actionArray = [
  'DEMO', 'LIVE', 'VOD',
  'ONLINE', 'OFFLINE'
];

let notifyUserCooldown = false;
var notifyUserCooldownHours = 5; // will send another discord message after 5 hours when access token needs replaced
async function notifyUser(err) {
  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  var params = {
    "username": "KONCEPT",
    "avatar_url": "https://i.imgur.com/BpBtNtI.png",
    "content": `<@${process.env.NOTIFY_DISCORD_USER}>\n**[ACCESS TOKEN]** The API returned an error: \`${err.toString().split(':')[1].trim()}\`\nPlease retrieve a new access token to continue.`
  }
  try {
    await fetch(process.env.NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => {
      logger.log(`[WEBHOOK]\tError posting webhook in fetch: ${err}`);
      console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tError posting webhook in fetch: ${err}`);
    });
    notifyUserCooldown = true;
    setTimeout(() => {
      notifyUserCooldown = false;
    }, notifyUserCooldownHours * 60 * 60 * 1000);
  } catch(err) {
    logger.log(`[WEBHOOK]\tWas not able to post webhook: ${err}`);
    console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tWas not able to post webhook.`);
  }

}


let prevScheduledJobCount; // for reducing duplicate logs to file
let prevRows; // for checking to send to calendar


// !schedule.txt
let prevFinalContent; // !schedule.txt
async function writeSchedule(schedule) {
  var sortedSchedule = schedule.sort(function(a,b) {
    return Date.parse(a[2])-Date.parse(b[2]);
  });
  sortedSchedule = sortedSchedule.slice(0, 5);
  let scheduleLog = [];
  await sortedSchedule.map(async (sortedRow) => {
    var sortedColumn = {
      index: (sortedRow[0]) ? sortedRow[0] : '',
      status: (sortedRow[1]) ? sortedRow[1] : '',
      datetime: (sortedRow[2]) ? sortedRow[2] : '',
      timezone: (sortedRow[3] == defaultTimezone) ? sortedRow[3] : defaultTimezone,
      action: (sortedRow[4]) ? sortedRow[4] : '',
      source: (sortedRow[5]) ? sortedRow[5] : '',
      line1: (sortedRow[6]) ? sortedRow[6] : '',
      line2: (sortedRow[7]) ? sortedRow[7] : '',
    };
    let sortedDate = sortedColumn.datetime + ' ' + sortedColumn.timezone;
    if(sortedColumn.action != undefined && sortedColumn.action !== '') {
      sortedColumn.timezone = (sortedColumn.timezone == defaultTimezone) ? sortedColumn.timezone : defaultTimezone;
      switch(sortedColumn.action) {
        case 'DEMO':
          // push datetime and 'Demoscene' to log array
          scheduleLog.push([sortedDate, `Demoscene`]);
          break;
        case 'VOD':
          // push datetime and ''
          scheduleLog.push([sortedDate, (sortedColumn.line1 != undefined && sortedColumn.line1 !== '') ? sortedColumn.line1.replace(/\[![^\]]*\]/g, '').trim().replace(/  +/g, ' ') : `VOD`]);
          break;
        case 'LIVE':
          // push datetime and remove 'LIVE:' from line1, then push formatted line1 to log array
          if(sortedColumn.line1 != undefined && sortedColumn.line1 !== '') {
            scheduleLog.push([sortedDate, sortedColumn.line1.replace(/\[![^\]]*\]/g, '').trim().replace(/live:/gi, '').trim().replace(/  +/g, ' ')]); // replaces any [!xxxx] with '', and replaces LIVE: with ''
          } else {
            scheduleLog.push([sortedDate, sortedColumn.action]);
          }
          break;
        case 'OFFLINE':
          if(sortedColumn.line1 !== undefined && sortedColumn.line1 !== '' && sortedColumn.line1 !== ' ') {
            scheduleLog.push([sortedDate, sortedColumn.line1]);
          } else {
            scheduleLog.push([sortedDate, sortedColumn.action]);
          }
          break;
        default:
          if(sortedColumn.line1 !== undefined && sortedColumn.line1 !== '') {
            scheduleLog.push([sortedDate, sortedColumn.line1]);
          }
      }
    }
  });
  let finalScheduleLog = [];
  if(scheduleLog.length > 0) {
    let prevDate;
    let tz = '';

    await scheduleLog.map(async (scheduleEntry) => {
      let schDate = scheduleEntry[0];
      let schLine1 = scheduleEntry[1];
      if(!isNaN(Date.parse(schDate))) {
        let nowDateEST = (new Date()).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
         }).split(',')[0];
        const dEST = new Intl.DateTimeFormat(undefined, {
          timeZone: 'America/New_York',
          timeZoneName: 'short',
          hourCycle: 'h24',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }).format(Date.parse(schDate));
        switch(dEST.split(',')[2].trim().split(' ')[1]) {
          case 'GMT+9':
            tz = `(JST) `;
            break;
          default:
            tz = `(${dEST.split(',')[2].trim().split(' ')[1]}) `;
        }
        let currDate = dEST.split(',')[1].trim();
        let hour = dEST.split(',')[2].trim().split(' ')[0].trim().replace(':', '');
        hour = (hour.substring(0,2) == '24') ? hour.replace(/^.{2}/g, '00') : hour;
        // if scheduled job is on same day, only write date once to log
        if(prevDate == currDate) {
          finalScheduleLog.push(' ' + hour + ': ' + schLine1)
        } else {
          let dayName = dEST.split(',')[0].trim();
          let monthDay = new Date(dEST.split(',')[1].trim()).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          if(currDate === nowDateEST) {
            // same date as today, write 'Today' instead
            finalScheduleLog.push(`| TODAY - ${dayName} ${monthDay} - ${hour}: ${schLine1}`);
          } else {
            finalScheduleLog.push(`| ${dayName} ${monthDay} - ${hour}: ${schLine1}`);
          }
          prevDate = currDate;
        }
      }
    })



    // write to schedule.txt
    try {
      if(finalScheduleLog.length > 0) {
        let scheduleContent;
        if(finalScheduleLog[0].includes(`${multiLinedVariable} `)) {
          scheduleContent = ((tz !== '') ? tz : '') + `${multiLinedVariable} ` + finalScheduleLog.join(' |').slice(2).replaceAll(`${multiLinedVariable} `, '');
        } else {
          scheduleContent = ((tz !== '') ? tz : '') + finalScheduleLog.join(' |').slice(2);
        }
        var finalContent = await scheduleContent.replaceAll('||', konceptSpacerEmote);
        // check if same or different
        if(finalContent !== prevFinalContent) {
          prevFinalContent = finalContent;
          fs.writeFileSync('schedule.txt', finalContent); // write to file on changes to schedule (next 5 events)
        }
      }
    } catch(err) {
      logger.log(`[LOGGER] Could not write schedule to text file.`);
      console.log(`\x1b[33m%s\x1b[0m`, `[LOGGER]`, `Could not write schedule to text file.`);
    }
  }
}

var webhookAlertSwitch = {};


let prevDupe = [];

let prevOnOffStatus; // writing to json file

module.exports = {
  sheetLogic: (google, auth, client) => {
    let jobs = []; // only used to compare lists
    let currSchedule = []; // used to find next 5 scheduled jobs and log to schedule.txt
    let scheduledRows = [];

    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${process.env.SHEET_NAME}!A2:H`,
    }, async (err, res) => {

      // checks for errors
      if(err) {
        if(err == 'Error: invalid_grant' || err == 'Error: Invalid Credentials') {
          if(!notifyUserCooldown) {
            logger.log(`[ACCESS TOKEN] The API returned an error: ${err.toString().split(':')[1].trim()}`);
            logger.log(`[ACCESS TOKEN] Please retrieve a new access token to continue.`);
            // send webhook to notify user of expired token
            try {
              notifyUser(err);
            } catch(err) {
              logger.log(`[ACCESS TOKEN] Was not able to send webhook to notify the user of expired access token.`);
              console.log(`\x1b[31m%s\x1b[33m%s\x1b[0m`, `[ACCESS TOKEN]`, `\tWas not able to send webhook to notify the user of expired access token.`);
            }
          }
          console.log(`\x1b[31m%s\x1b[33m%s\x1b[0m`, `[ACCESS TOKEN]`, `\tThe API returned an error: ${err.toString().split(':')[1].trim()}`);
          console.log(`\x1b[31m%s\x1b[33m%s\x1b[0m`, `[ACCESS TOKEN]`, `\tPlease retrieve a new access token to continue.`);
        } else {
          var stringErr = err.toString();
          if(stringErr.includes('Error 502 (Server Error)') || stringErr.includes('The server encountered a temporary error and could not complete your request.')) {
            logger.log(`[READ] The API returned an error: ERROR 502: The server encountered a temporary error and could not complete your request. Please try again in 30 seconds.`);
            console.log(`\x1b[33m%s\x1b[0m`, `[READ]`, ` The API returned an error: ERROR 502: The server encountered a temporary error and could not complete your request. Please try again in 30 seconds.`);
          } else {
            logger.log(`[READ] The API returned an error: ${err}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[READ]`, ` The API returned an error: ` + err);
          }
        }
      }

      // checks res isnt undefined
      if(res != undefined) {
        const rows = res.data.values;
        if (rows.length) {

          let rowIndex = 0;
          let rowsFiltered = [];

          // maps through each row individually
          await rows.map(async (row) => {
            row.unshift(rowIndex + 2); // sets index at beginning of each row array
            rowIndex++;

            var column = {
              index: (row[0]) ? row[0] : '',
              status: (row[1]) ? row[1] : '',
              datetime: (row[2]) ? row[2] : '',
              timezone: defaultTimezone,
              action: (row[4]) ? row[4] : '',
              source: (row[5]) ? row[5] : '',
              line1: (row[6]) ? row[6] : '',
              line2: (row[7]) ? row[7] : '',
            };
            // row[3] is now twitchID

            webhookAlertSwitch.index = 3;

            // just for the alert button ON/OFF for onOffWebhook
            if(column.index == webhookAlertSwitch.index) {
              // check if prev value is the same, if not.. then write to json file
              if(column.status !== undefined || column.status !== '') {
                var onOffOptions = ['ON','OFF'];
                if(onOffOptions.includes(column.status) && column.status !== prevOnOffStatus) {
                  prevOnOffStatus = column.status;
                  try {
                    fs.writeFileSync('./functions/json/onOff.json', JSON.stringify({
                      "status": column.status
                    }))
                  } catch(error) {
                    console.log(`[ON/OFF] Catch Error`);
                  }
                }
              }
            }

            //      ~~~ I D E A ~~~
            // idea: what if we logged the highest number of viewers recorded for whoever is in row[3]
            // check that the twitchID stays the same during refreshes, and then check viewers against previous viewers
            // if that number is higher, keep that number, otherwise keep the previous number.
            //
            // if the twitchID changes, store the previous number viewer count as that previous twitchID
            // then reset everything fresh for new twitchID
            //
            // if '' dont bother storing anything

            if(column.datetime !== '' && !isNaN(Date.parse(column.datetime))) {
              let tempDate = (new Date(Date.parse(column.datetime + ' ' + column.timezone)));
              let weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
              column.datetime = tempDate.toISOString().replace('T', ' ').split('.')[0];
              column.datetime = column.datetime + ' (' + weekday[tempDate.getDay()].substring(0,3) + ')';
            }

            if(column.index) await rowsFiltered.push(column);

            if(column.datetime == 'DISPLAY' && column.index == 2) {
              // send Quick Display titles without logging to file
              column.line1 = (column.line1 !== '') ? column.line1 : ' ';
              column.line2 = (column.line2 !== '') ? column.line2 : ' ';

              try {
                fs.writeFileSync('title1.txt', column.line1);
                fs.writeFileSync('title2.txt', column.line2);
              } catch(err) {
                logger.log(`[TITLES] Could not write to title text file.`);
                console.log(`\x1b[33m%s\x1b[0m`, `[TITLES]`, `Could not write to title text file.`);
              }

              let displayObj;
              let socket = client ? client : 'closed';
              if(socket == 'closed') {
                logger.log(`[WEBSOCKET] Couldn't send titles to websocket. Socket is closed.`);
                console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed.`);
              } else {
                displayObj = {
                    "event": "titles",
                    "data": {
                      "action": 'DISPLAY',
                      "source": '',
                      "name": 'Quick Display',
                      "line1": column.line1,
                      "line2": column.line2
                    }
                };
                if(socket.readyState == 1) {
                  await sendDisplay(socket, displayObj);
                } else {
                  logger.log(`[WEBSOCKET] Couldn't send Quick Display to websocket. Socket is closed, closing, or reconnecting. Try again later.`);
                  console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send Quick Display to websocket. Socket is closed, closing, or reconnecting. Try again later.`);
                }
                await clearDisplayDone(sheets, column.index);
              }
            }

            if(column.status == 'SCHEDULED') {
              if(column.datetime == undefined || column.datetime == '') {
                await cleanupStatus(sheets, column.index);
              }
            } else if(column.status == 'DONE') {
              if(column.datetime != undefined || column.datetime !== '') { // datetime not blank '' or undefined
                if(new Date(column.datetime) instanceof Date) { // datetime is a valid date
                  if((toTimestamp(`${column.datetime} ${defaultTimezone}`)) * 1000 < Date.parse(new Date)) { // datetime is in the past
                    // date in past
                  }
                }
              } else {
                await cleanupStatus(sheets, column.index);
              }
            }
          });

          // filter rows and remove duplicate start times from array, then pass to *logic inside 'rows.map'*
          rowsFiltered = rowsFiltered.filter(obj => {
            return (obj.datetime !== '' && obj.action !== '');
          });
          let rowsSorted = await rowsFiltered.sort((a,b) => (a.datetime > b.datetime) ? 1 : ((b.datetime > a.datetime) ? -1 : 0))
          rowsSorted = await rowsSorted.map(a => [a.index, a.datetime]);
          rowsSorted = await rowsSorted.sort((a,b) => b[1].localeCompare(a[1]));
          rowsSorted = await rowsSorted.sort((a, b) => {
            if(a[1] == b[1]) {
              return b[0] - a[0];
            } else {
              return a[1] - b[1];
            }
          });
          rowsSorted = await rowsSorted;

          let dupesRowsSorted = [];
          let keepsRowsSorted = [];
          let prevRowsSorted = null;
          await rowsSorted.map(async (job) => {
            if(job[1] === prevRowsSorted) {
              await dupesRowsSorted.push(job[0]);
            } else {
              prevRowsSorted = job[1];
              await keepsRowsSorted.push(job[0]);
            }
          });

          await rowsFiltered.map(async (row) => {
            if(dupesRowsSorted.includes(row.index)) {
              // remove 'SCHEDULED'
              if(row.status == 'SCHEDULED') {
                await cleanupStatus(sheets, row.index);
              }
            } else {
              let column = row;
              if((column.index >= 5 && !isNaN(new Date(column.datetime)) && actionArray.includes(column.action)) || (column.index >= 5 && column.datetime == 'NOW' && actionArray.includes(column.action))) {
                // Checks if action LIVE, DEMO, VOD, ONLINE, or OFFLINE
                // Check DATETIME is a date or 'NOW'

                // console.log(`${column.index}: `, column);

                // sets nowIndex
                if(column.datetime == 'NOW') {
                  nowIndex = column.index;
                }

                let now = Date.parse(new Date); // timestamp of the time right now

                column.source = (column.source !== undefined) ? ((column.action == 'DEMO') ? ' ' : column.source) : ' ';
                switch (column.action) {
                  case 'DEMO':
                    const d = new Date(Date.now()).toLocaleDateString('en-US',
                      {
                        timeZone: 'Asia/Tokyo',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      }
                    ).replace(',','').split(' ');
                    let dT = `NOW: Demoscene | ${d[1]} ${d[0]} ${d[2]}`;
                    column.line1 = (column.line1 !== '') ? column.line1 : dT;
                    column.line2 = (column.line2 !== '') ? column.line2 : ' ';
                    break;
                  default:
                    column.line1 = (column.line1 !== '') ? column.line1 : ' ';
                    column.line2 = (column.line2 !== '') ? column.line2 : ' ';
                }

                if(new Date(column.datetime) instanceof Date || column.datetime == 'NOW') {
                  let timestamp = (column.datetime == 'NOW') ? (now + 1000)/1000 : toTimestamp(`${column.datetime} ${column.timezone}`);
                  let date = (column.datetime == 'NOW') ? new Date(timestamp * 1000) : new Date(timestamp * 1000);

                  if(timestamp * 1000 < now) {
                    // don't schedule job, time has passed already
                    var outsider = Object.keys(schedule.scheduledJobs).filter(b => !jobs.some(a => a.toString() === b));
                    for(let i = 0; i < outsider.length; i++) {
                      var myJob = schedule.scheduledJobs[outsider[i]];
                      myJob.cancel();
                    }
                  } else {
                    // check if LIVE has a URI && if VOD has a NAME
                    if((column.action === 'LIVE' && column.source !== '') || (column.action === 'VOD' && column.source !== '') || (column.action === 'DEMO') || (column.action === 'ONLINE') || (column.action === 'OFFLINE')) {

                      jobs.push(timestamp);

                      let myObject = [schedule.scheduledJobs];
                      if(myObject.find(e => e[timestamp.toString()])) {
                        // cancel and reschedule every prev job
                        var myJob = schedule.scheduledJobs[timestamp.toString()];
                        myJob.cancel();
                        const index = jobs.indexOf(timestamp);
                        if(index > -1) {
                          jobs.splice(index, 1);
                        }
                        // re-add to array for comparison
                        jobs.push(timestamp);

                      }


                      if(column.status !== 'SCHEDULED' && column.datetime !== '' && column.action !== '' && !(timestamp * 1000 < now)) {
                        // check if not dupe start time (keep highest index)
                        // push to array and check outside of the 'map' function
                        if(column.datetime !== 'NOW') {
                          await writeStatusScheduled(sheets, column.index);
                        }
                      }



                      // schedule job
                      var j = schedule.scheduleJob(`${timestamp}`, date, async function() {

                        // send column info to setTitle.js
                        await twitchSetTitle(column);

                        switch(column.action) {
                          case 'LIVE':
                          case 'VOD':
                            let socket = client ? client : 'closed';
                            if(socket == 'closed') {
                              logger.log(`[WEBSOCKET] Couldn't send titles to websocket. Socket is closed.`);
                              console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed.`);
                            } else {
                              titleObj = {
                                  "event": "titles",
                                  "data": {
                                    "action": column.action,
                                    "source": column.source,
                                    "name": (column.action == 'DISPLAY') ? 'Quick Display' : '',
                                    "line1": column.line1,
                                    "line2": column.line2
                                  }
                              };

                              if(socket.readyState == 1) {
                                sendTitle(socket, titleObj);
                              } else {
                                logger.log(`[WEBSOCKET] Couldn't send titles to websocket. Socket is closed, closing, or reconnecting.`);
                                console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed, closing, or reconnecting.`);
                              }
                            }
                            break;
                          case 'ONLINE':
                            // turn onOffWebhook Alert to 'ON'
                            await switchWebhookAlert(sheets, webhookAlertSwitch.index, 'ON');
                            break;
                          case 'OFFLINE':
                            // turn onOffWebhook Alert to 'OFF'
                            await switchWebhookAlert(sheets, webhookAlertSwitch.index, 'OFF');
                            break;
                          default:
                            //
                            logger.log(`[SCHEDULER] ONLINE / OFFLINE`);
                            console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, `ONLINE / OFFLINE`);
                        }

                        // write to title file
                        try {
                          fs.writeFileSync('title1.txt', `${column.line1}`);
                          fs.writeFileSync('title2.txt', `${column.line2}`);
                        } catch(err) {
                          logger.log(`[TITLES] Could not write to title text file.`);
                          console.log(`\x1b[33m%s\x1b[0m`, `[TITLES]`, `Could not write to title text file.`);
                        }

                        // write to log file
                        let content;
                        switch (column.action) {
                          case 'LIVE':
                            content = `${column.source}`;
                            break;
                          case 'VOD':
                            content = `${column.action}:${column.source}`;
                            break;
                          case 'DEMO':
                          case 'ONLINE':
                          case 'OFFLINE':
                            content = `${column.action}`;
                            break;
                          default:
                            logger.log(`[SCHEDULER] There's an error in the *content switch*.`);
                            console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, `There's an error in the *content switch*.`);
                        }
                        try {
                          fs.writeFile('log.txt', content, err => {
                            if(err) {
                              logger.log(`[SCHEDULER] Error in writing to log.txt for DEMO, LIVE, VOD, ONLINE, OFFLINE: ${err}`);
                              console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, err);
                              return
                            }
                            logger.log(`[SCHEDULER]\tSuccessfully logged to file as: ${content} - ${column.datetime} ${column.timezone}`);
                            console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `\n[SCHEDULER]`, `\t Successfully logged to file as: ${content}  `, `  ${column.datetime} ${column.timezone}\n`);
                          });
                        } catch(err) {
                          logger.log(`[SCHEDULER] Error in writing to log.txt: ${err}`);
                          console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, err);
                        }

                        if(column.datetime == 'NOW') {
                          column.datetime = (date.getUTCMonth()+1) + '/' + date.getUTCDate() + '/' + date.getUTCFullYear() + ' ' + date.getUTCHours() + ':' + date.getUTCMinutes() + ':' + date.getUTCSeconds();
                          await writeNowDatetime(sheets, rows.length, nowIndex, column.datetime, date);
                        }

                        await writeStatusDone(sheets, column.index);

                        // webhook announcements - leave last so it doesn't hold up any other code
                        try {
                          await new Promise(resolve => setTimeout(resolve, minsBeforeCacheStreamPreview * 60 * 1000)); // 2 minute timeout to make sure twitch preview is of streamer
                          await webhook(column);
                        } catch(err) {
                          logger.log(`[WEBHOOK] Could not send webhook to discord.`);
                          console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `Could not send webhook to discord.`);
                        }

                      });





                    }
                  }
                }
              }
              // only push recent entries and non-duplicates to 'scheduledRows'
              if((toTimestamp(`${column.datetime} ${defaultTimezone}`)) * 1000 > Date.parse(new Date)) {
                await scheduledRows.push(column);
              }

              // for !schedule
              if(column.status == 'SCHEDULED') {
                if(column.datetime != undefined || column.datetime !== '') {
                  if(!jobs.includes(toTimestamp(`${column.datetime} ${defaultTimezone}`))) {
                    // how to check if theres multiple exact times
                    if(column.datetime !== 'NOW') {
                      await cleanupStatus(sheets, column.index);
                    }
                  } else {
                    if(!isNaN(Date.parse(column.datetime))) {
                      if(actionArray.includes(column.action) && column.action !== 'ONLINE') {
                        await currSchedule.push(Object.values(column));
                      }
                    }
                  }
                } else {
                  await cleanupStatus(sheets, column.index);
                }
              } else if(column.status == 'DONE') {
                if(column.datetime != undefined || column.datetime !== '') { // datetime not blank '' or undefined
                  if(new Date(column.datetime) instanceof Date) { // datetime is a valid date
                    if((toTimestamp(`${column.datetime} ${defaultTimezone}`)) * 1000 < Date.parse(new Date)) { // datetime is in the past
                      // date in past
                    } else {
                      // shouldnt need this function here at all
                      if(column.datetime === 'NOW') {
                        await cleanupStatus(sheets, column.index);
                      }
                      // await cleanupStatus(sheets, column.index, 'said done'); // date not in past
                    }
                  }
                } else {
                  await cleanupStatus(sheets, column.index);
                }
              }
            }
          })

          // check if two dates are same, and remove the one with the lower index number
          scheduledRows = await scheduledRows.map(function(item){ return [item.index, item.datetime] });
          scheduledRows = await scheduledRows.sort((a,b) => b[1].localeCompare(a[1]));
          scheduledRows = await scheduledRows.sort((a, b) => {
            if(a[1] == b[1]) {
              return b[0] - a[0];
            } else {
              return a[0] - b[0];
            }
          }); // 2nd element ascending order, then if those are the same, sort descending 1st element

          // go through and find duplicate values, and remove the 'SCHEDULED' from that index
          let dupes = [];
          let keeps = [];
          let prevRow = null;
          await scheduledRows.map(async (job) => {
            if(job[1] === prevRow) {
              await dupes.push(job[0]);
            } else {
              prevRow = job[1];
              await keeps.push(job[0]);
            }
          });

          // now send dupes to be removed `SCHEDULED`
          await dupes.forEach(async dupe => {
            await cleanupStatus(sheets, dupe);
          });
          prevDupe = dupes;

          // Check and remove any entries that may have changed their scheduled time
          if(Object.keys(schedule.scheduledJobs).length !== jobs.length) {
            // they don't equal, means an already scheduled job changed time
            var outsider = Object.keys(schedule.scheduledJobs).filter(b => !jobs.some(a => a.toString() === b));
            for(let i = 0; i < outsider.length; i++) {
              var myJob = schedule.scheduledJobs[outsider[i]];
              myJob.cancel();
            }
          }

          // Send to calendar logic, and counter (also for logging to text file)
           if(_.isEqual(rows, prevRows)) {
             calendarCounter++;
             if(calendarCounter >= calendarRefreshStaysSame) {
               calendarCounter = 0;
               calendar(auth, rows, dupesRowsSorted, keepsRowsSorted); // send 'rows' information to calendar app
             }
          } else if(!_.isEqual(rows, prevRows)) {
            prevRows = rows;
            calendarCounter = 0; // reset calendarCounter if scheduled jobs change
          }

          if(Object.keys(schedule.scheduledJobs).length != prevScheduledJobCount) {
            prevScheduledJobCount = Object.keys(schedule.scheduledJobs).length;
            logger.log(`[SCHEDULER]\tScheduled jobs: ${Object.keys(schedule.scheduledJobs).length}\trefreshing... `);
          }
          console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[32m%s\x1b[0m`, `[SCHEDULER]`, `\t Scheduled jobs: `, Object.keys(schedule.scheduledJobs).length, `\t refreshing... `);

        } else {
          logger.log(`[SCHEDULER] No data found.`);
          console.log(`\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\x1b[33m%s\x1b[0m`, 'No data found.');
        }

        // !schedule
        await writeSchedule(currSchedule);


      }

    });
  }
}
