const fs = require('fs');
const schedule = require('node-schedule');
const dotenv = require('dotenv');
dotenv.config();

var konceptSpacerEmote = 'koncep2SWING';
var multiLinedVariable = ' ';
var defaultTimezone = 'UTC';

const {
  toTimestamp, clearDisplayDone,
  sendDisplay, writeStatusDone,
  writeStatusScheduled, cleanupStatus,
  sendTitle, writeNowDatetime } = require('./functions.js');


let nowIndex; // 'NOW'
var actionArray = ['DEMO', 'LIVE', 'VOD'];

module.exports = {
  sheetLogic: (google, auth, client) => {
    let jobs = []; // only used to compare lists
    let currSchedule = []; // used to find next 5 scheduled jobs and log to schedule.txt

    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${process.env.SHEET_NAME}!A2:H`,
    }, (err, res) => {
      if (err) return console.log('[READ] The API returned an error: ' + err);
      const rows = res.data.values;
      if (rows.length) {

        let rowIndex = 0;
        // maps through each row individually
        rows.map(async (row) => {
          row.unshift(rowIndex + 2); // sets index at beginning of each row array
          rowIndex++;

          var column = {
            index: (row[0]) ? row[0] : '',
            status: (row[1]) ? row[1] : '',
            datetime: (row[2]) ? row[2] : '',
            timezone: (row[3] == defaultTimezone) ? row[3] : defaultTimezone,
            action: (row[4]) ? row[4] : '',
            source: (row[5]) ? row[5] : '',
            line1: (row[6]) ? row[6] : '',
            line2: (row[7]) ? row[7] : '',
          }

          if(column.datetime == 'DISPLAY' && column.index == 2) {
            // send Quick Display titles without logging to file
            column.line1 = (column.line1 !== '') ? column.line1 : ' ';
            column.line2 = (column.line2 !== '') ? column.line2 : ' ';

            try {
              fs.writeFileSync('title1.txt', column.line1);
              fs.writeFileSync('title2.txt', column.line2);
            } catch(err) {
              console.log(`\x1b[33m%s\x1b[0m`, `[TITLES]`, `Could not write to title text file.`);
            }

            let displayObj;
            let socket = client ? client : 'closed';
            if(socket == 'closed') {
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
                sendDisplay(socket, displayObj);
              } else {
                console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send Quick Display to websocket. Socket is closed, closing, or reconnecting. Try again later.`);
              }
              clearDisplayDone(sheets, column.index);
          }
        } else if((column.index >= 5 && !isNaN(new Date(column.datetime)) && actionArray.includes(column.action)) || (column.index >= 5 && column.datetime == 'NOW' && actionArray.includes(column.action))) {
            // Checks if action LIVE, DEMO, or VOD
            // Check DATETIME is a date or 'NOW'

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
                if((column.action === 'LIVE' && column.source !== '') || (column.action === 'VOD' && column.source !== '') || (column.action === 'DEMO')) {

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

                  // schedule job
                  var j = schedule.scheduleJob(`${timestamp}`, date, function() {

                    if(column.datetime == 'NOW') {
                      column.datetime = (date.getUTCMonth()+1) + '/' + date.getUTCDate() + '/' + date.getUTCFullYear() + ' ' + date.getUTCHours() + ':' + date.getUTCMinutes() + ':' + date.getUTCSeconds();
                      writeNowDatetime(sheets, rows.length, nowIndex, column.datetime, date);
                    }

                    if(column.action == 'LIVE' || column.action == 'VOD') {
                      let socket = client ? client : 'closed';
                      if(socket == 'closed') {
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
                          console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed, closing, or reconnecting.`);
                        }
                      }
                    }

                    // write to title file
                    try {
                      fs.writeFileSync('title1.txt', `${column.line1}`);
                      fs.writeFileSync('title2.txt', `${column.line2}`);
                    } catch(err) {
                      console.log(`\x1b[33m%s\x1b[0m`, `[TITLES]`, `Could not write to title text file.`);
                    }

                    try {
                      setTimeout(() => {
                        require('./webhook.js').webhook(column);
                      }, 1 * 60 * 1000); // 1 minute timeout to make sure twitch preview is of streamer
                    } catch(err) {
                      console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `Could not send webhook to discord.`);
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
                        content = `${column.action}`;
                        break;
                      default:
                        console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, `There's an error in the *content switch*.`);
                    }
                    fs.writeFile('log.txt', content, err => {
                      if(err) {
                        console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, err);
                        return
                      }
                      console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `\n[SCHEDULER]`, `\t Successfully logged to file as: ${content}  `, `  ${column.datetime} ${column.timezone}\n`);
                    });
                    writeStatusDone(sheets, column.index);
                  });

                  if(column.status !== 'SCHEDULED') {
                    writeStatusScheduled(sheets, column.index);
                  }

                }
              }
            }
          }
          if(column.status == 'SCHEDULED') {
            if(column.datetime != undefined || column.datetime !== '') {
              if(!jobs.includes(toTimestamp(`${column.datetime} ${defaultTimezone}`))) {
                // how to check if theres multiple exact times
                cleanupStatus(sheets, column.index);
              } else {
                if(!isNaN(Date.parse(column.datetime))) {
                  currSchedule.push(Object.values(column));
                }
              }
            } else {
              cleanupStatus(sheets, column.index);
            }
          } else if(column.status == 'DONE') {
            if(column.datetime != undefined || column.datetime !== '') { // datetime not blank '' or undefined
              if(new Date(column.datetime) instanceof Date) { // datetime is a valid date
                if((toTimestamp(`${column.datetime} ${defaultTimezone}`)) * 1000 < Date.parse(new Date)) { // datetime is in the past
                  // date in past
                } else {
                  cleanupStatus(sheets, column.index); // date not in past
                }
              }
            } else {
              cleanupStatus(sheets, column.index);
            }
          }
        });

        // Check and remove any entries that may have changed their scheduled time
        if(Object.keys(schedule.scheduledJobs).length !== jobs.length) {
          // they don't equal, means an already scheduled job changed time
          var outsider = Object.keys(schedule.scheduledJobs).filter(b => !jobs.some(a => a.toString() === b));
          for(let i = 0; i < outsider.length; i++) {
            var myJob = schedule.scheduledJobs[outsider[i]];
            myJob.cancel();
          }
        }

        console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[32m%s\x1b[0m`, `[SCHEDULER]`, `\t Scheduled jobs: `, Object.keys(schedule.scheduledJobs).length, `\t refreshing... `);

      } else {
        console.log(`\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\x1b[33m%s\x1b[0m`, 'No data found.');
      }

      // Sort currSchedule and keep next 5 events
      var sortedSchedule = currSchedule.sort(function(a,b) {
        return Date.parse(a[2])-Date.parse(b[2]);
      });
      sortedSchedule = sortedSchedule.slice(0, 5)
      let scheduleLog = [];
      for(let i = 0; i < sortedSchedule.length; i++) {
        if(sortedSchedule[i][4] != undefined && sortedSchedule[i][4] !== '') {
          sortedSchedule[i][3] = (sortedSchedule[i][3] == defaultTimezone) ? sortedSchedule[i][3] : defaultTimezone;
          switch(sortedSchedule[i][4]) {
            case 'DEMO':
              // push datetime and 'Demoscene' to log array
              scheduleLog.push([sortedSchedule[i][2] + ' ' + sortedSchedule[i][3], `Demoscene`]);
              break;
            case 'VOD':
              // push datetime and ''
              scheduleLog.push([sortedSchedule[i][2] + ' ' + sortedSchedule[i][3], (sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') ? sortedSchedule[i][6].trim() : `VOD`]);
              break;
            case 'LIVE':
              // push datetime and remove 'LIVE:' from line1, then push formatted line1 to log array
              if(sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') {
                if(sortedSchedule[i][6].includes('LIVE:')) {
                  scheduleLog.push([sortedSchedule[i][2] + ' ' + sortedSchedule[i][3], (sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') ? sortedSchedule[i][6].replace('LIVE:', '').trim() : `LIVE`]);
                } else {
                  scheduleLog.push([sortedSchedule[i][2] + ' ' + sortedSchedule[i][3], (sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') ? sortedSchedule[i][6].trim() : `LIVE`]);
                }
              }
              break;
            default:
              if(sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') {
                scheduleLog.push([sortedSchedule[i][2] + ' ' + sortedSchedule[i][3], sortedSchedule[i][6]]);
              }
          }
        }
      }
      let finalScheduleLog = [];
      if(scheduleLog.length > 0) {
        let prevDate;
        let tz = '';
        for(let i = 0; i < scheduleLog.length; i++) {
          // turn from defaultTimezone to EST
          if(!isNaN(Date.parse(scheduleLog[i][0]))) {
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
            }).format(Date.parse(scheduleLog[i][0]));
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
              finalScheduleLog.push(' ' + hour + ': ' + scheduleLog[i][1])
            } else {
              let dayName = dEST.split(',')[0].trim();
              let monthDay = new Date(dEST.split(',')[1].trim()).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
              finalScheduleLog.push('| ' + dayName + ' ' + monthDay + ' - ' + hour + ': ' + scheduleLog[i][1])
              prevDate = currDate;
            }
          }
        }
        // write to schedule.txt
        try {
          if(finalScheduleLog.length > 0) {
            let scheduleContent;
            if(finalScheduleLog[0].includes(`${multiLinedVariable} `)) {
              scheduleContent = ((tz !== '') ? tz : '') + `${multiLinedVariable} ` + finalScheduleLog.join(' |').slice(2).replaceAll(`${multiLinedVariable} `, '');
            } else {
              scheduleContent = ((tz !== '') ? tz : '') + finalScheduleLog.join(' |').slice(2);
            }
            fs.writeFileSync('schedule.txt', scheduleContent.replaceAll('||', konceptSpacerEmote));
          }
        } catch(err) {
          console.log(`\x1b[33m%s\x1b[0m`, `[LOGGER]`, `Could not write schedule to text file.`);
        }
      }

    });
  }
}
