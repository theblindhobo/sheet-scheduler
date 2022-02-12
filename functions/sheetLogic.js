const fs = require('fs');
const schedule = require('node-schedule');
const dotenv = require('dotenv');
dotenv.config();

var konceptSpacerEmote = 'koncep2P';

let nowIndex; // 'NOW'

var actionArray = ['DEMO', 'LIVE', 'VOD'];

function toTimestamp(strDate) {
  var datum = Date.parse(strDate);
  return datum/1000;
}
function clearDisplayDone(sheets, index) {
  let status = ''
  let values = [
    [
      status
    ],
  ];
  let data = [
    {
      range: `MASTER SCHEDULE!B${index}`,
      values,
    },
    {
      range: `MASTER SCHEDULE!F${index}`,
      values,
    },
    {
      range: `MASTER SCHEDULE!G${index}`,
      values,
    }];
  const resource = {
    data,
    valueInputOption: "USER_ENTERED"
  };
  sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    resource
  }, (err, result) => {
    if(err) {
      console.log(err);
    } else {
      console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DISPLAYED titles immediately and CLEARED cells at `, `B${index}, F${index}, G${index}`);
    }
  });
}
function sendDisplay(socket, displayObj) {
  setTimeout(() => {
    socket.send(JSON.stringify(displayObj));
  }, 2000);
}
function writeStatusDone(sheets, index) {
  setTimeout(() => {
    let range = `MASTER SCHEDULE!A${index}`;
    let status = 'DONE'
    let values = [
      [
        status
      ],
    ];
    const resource = {
      values,
    };
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource
    }, (err, result) => {
      if(err) {
        console.log(err);
      } else {
        console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
      }
    });
  }, 1000);
}
function writeStatusScheduled(sheets, index) {
  // check if STATUS says scheduled already, if not.. write it
  sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `MASTER SCHEDULE!A${index}`,
  }, (err, res) => {
    if(err) return console.log('[WRITE STATUS]', index, ' The API returned an error: ' + err);
    if(res.data.values == undefined || res.data.values[0][0] !== 'SCHEDULED') {
      let range = `MASTER SCHEDULE!A${index}`;
      let status = 'SCHEDULED'
      let values = [
        [
          status
        ],
      ];
      const resource = {
        values,
      };
      sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: range,
        valueInputOption: "USER_ENTERED",
        resource
      }, (err, result) => {
        if(err) {
          console.log(err);
        } else {
          // console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
        }
      });
    }
  });
}
function cleanupStatus(sheets, index) {
  sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `MASTER SCHEDULE!A${index}`,
  }, (err, res) => {
    if(err) return console.log('[CLEANUP STATUS] The API returned an error: ' + err);

    let range = `MASTER SCHEDULE!A${index}`;
    let status = ''
    let values = [
      [
        status
      ],
    ];
    const resource = {
      values,
    };
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource
    }, (err, result) => {
      if(err) {
        console.log(err);
      } else {
        // console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
      }
    });

  });
}
function sendTitle(socket, titleObj) {
  socket.send(JSON.stringify(titleObj));
}
function writeNowDatetime(sheets, rowsLength, index, datetime, date) {
  let range = (index != undefined) ? `MASTER SCHEDULE!B${index}` : `MASTER SCHEDULE!B${rowsLength + 3}`;
  let values = [
    [
      datetime
    ],
  ];
  const resource = {
    values,
  };
  // change cell on spreadsheet from NOW to current datetime
  sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: range,
    valueInputOption: "USER_ENTERED",
    resource
  }, (err, result) => {
    if(err) {
      console.log(err);
    } else {
      console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DATETIME updated at cell `, `B${index}`);
    }
  });
}

module.exports = {
  sheetLogic: (google, auth, client) => {
    let jobs = []; // only used to compare lists
    let currSchedule = []; // used to find next 5 scheduled jobs and log to schedule.txt


    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'MASTER SCHEDULE!A2:H',
    }, (err, res) => {
      if (err) return console.log('[READ] The API returned an error: ' + err);
      const rows = res.data.values;
      if (rows.length) {

        // Adds index # to each row array
        for(let i = 0; i < rows.length; i++) {
          rows[i].unshift(i + 2); // sets index at beginning of each row array
        }

        // maps through each row individually
        rows.map((row) => {
          let rowObj = { index: row[0] };


          if(row[2] == 'DISPLAY' && row[0] == 2) {
            // send Quick Display titles without logging to file

            rowObj.datetime = row[2];
            rowObj.line1 = row[6] ? row[6] : ' ';
            rowObj.line2 = row[7] ? row[7] : ' ';

            try {
              fs.writeFileSync('title1.txt', rowObj.line1);
              fs.writeFileSync('title2.txt', rowObj.line2);
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
                    "line1": rowObj.line1,
                    "line2": rowObj.line2
                  }
              };
              if(socket.readyState == 1) {
                sendDisplay(socket, displayObj);
              } else {
                console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send Quick Display to websocket. Socket is closed, closing, or reconnecting. Try again later.`);
              }
              clearDisplayDone(sheets, rowObj.index);
          }
        } else if((row[0] >= 5 && row.length >= 4 && !isNaN(new Date(row[2])) && actionArray.includes(row[4])) || (row[0] >= 5 && row.length >= 4 && row[2] == 'NOW' && actionArray.includes(row[4]))) {
            // Checks if action LIVE, DEMO, or VOD
            // Check DATETIME is a date or 'NOW'

            // sets nowIndex
            if(row[2] == 'NOW') {
              nowIndex = row[0];
            }

            let now = Date.parse(new Date); // timestamp of the time right now

            // Creates row Object
            rowObj.status = row[1];
            rowObj.datetime = row[2];
            rowObj.timezone = (row[3] == 'UTC') ? row[3] : 'UTC';
            rowObj.action = row[4];
            rowObj.source = (row[5] !== undefined) ? ((row[4] == 'DEMO') ? ' ' : row[5]) : ' ';
            switch (rowObj.action) {
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
                rowObj.line1 = (row[6] !== undefined) ? ((row[6] !== '') ? row[6] : dT) : dT;
                rowObj.line2 = (row[7] !== undefined) ? ((row[7] !== '') ? row[7] : ' ') : ' ';
                break;
              default:
                rowObj.line1 = row[6] ? row[6] : ' ';
                rowObj.line2 = row[7] ? row[7] : ' ';
            }

            if(new Date(rowObj.datetime) instanceof Date || rowObj.datetime == 'NOW') {
              let timestamp = (rowObj.datetime == 'NOW') ? (now + 1000)/1000 : toTimestamp(`${rowObj.datetime} ${rowObj.timezone}`);
              let date = (rowObj.datetime == 'NOW') ? new Date(timestamp * 1000) : new Date(timestamp * 1000);

              if(timestamp * 1000 < now) {
                // don't schedule job, time has passed already
                var outsider = Object.keys(schedule.scheduledJobs).filter(b => !jobs.some(a => a.toString() === b));
                for(let i = 0; i < outsider.length; i++) {
                  var myJob = schedule.scheduledJobs[outsider[i]];
                  myJob.cancel();
                }
              } else {
                // check if LIVE has a URI && if VOD has a NAME
                if((rowObj.action === 'LIVE' && rowObj.source !== '') || (rowObj.action === 'VOD' && rowObj.source !== '') || (rowObj.action === 'DEMO')) {

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

                    if(rowObj.datetime == 'NOW') {
                      rowObj.datetime = (date.getUTCMonth()+1) + '/' + date.getUTCDate() + '/' + date.getUTCFullYear() + ' ' + date.getUTCHours() + ':' + date.getUTCMinutes() + ':' + date.getUTCSeconds();
                      writeNowDatetime(sheets, rows.length, nowIndex, rowObj.datetime, date);
                    }

                    if(rowObj.action == 'LIVE' || rowObj.action == 'VOD') {
                      let socket = client ? client : 'closed';
                      if(socket == 'closed') {
                        console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed.`);
                      } else {
                        titleObj = {
                            "event": "titles",
                            "data": {
                              "action": (rowObj.action !== undefined) ? rowObj.action : '',
                              "source": (rowObj.source !== undefined) ? rowObj.source : '',
                              "name": (rowObj.action == 'DISPLAY') ? 'Quick Display' : '',
                              "line1": rowObj.line1,
                              "line2": rowObj.line2
                            }
                        };

                        if(socket.readyState == 1) {
                          sendTitle(socket, titleObj);
                        } else {
                          console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed, closing, or reconnecting.`);
                        }
                      }
                    }

                    try {
                      // write to title file
                      fs.writeFileSync('title1.txt', `${rowObj.line1}`);
                      fs.writeFileSync('title2.txt', `${rowObj.line2}`);
                    } catch(err) {
                      console.log(`\x1b[33m%s\x1b[0m`, `[TITLES]`, `Could not write to title text file.`);
                    }

                    // write to log file
                    let content;
                    switch (rowObj.action) {
                      case 'LIVE':
                        content = `${rowObj.source}`;
                        break;
                      case 'VOD':
                        content = `${rowObj.action}:${rowObj.source}`;
                        break;
                      case 'DEMO':
                        content = `${rowObj.action}`;
                        break;
                      default:
                        console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, `There's an error in the *content switch*.`);
                    }
                    fs.writeFile('log.txt', content, err => {
                      if(err) {
                        console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, err);
                        return
                      }
                      console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `\n[SCHEDULER]`, `\t Successfully logged to file as: ${content}  `, `  ${rowObj.datetime} ${rowObj.timezone}\n`);
                    });
                    writeStatusDone(sheets, rowObj.index);
                  });

                  if(rowObj.status !== 'SCHEDULED') {
                    writeStatusScheduled(sheets, rowObj.index);
                  }

                }
              }
            }
          }
          if(row[1] == 'SCHEDULED') {
            if(row[2] != undefined || row[2] !== '') {
              if(!jobs.includes(toTimestamp(`${row[2]} UTC`))) {
                // how to check if theres multiple exact times
                cleanupStatus(sheets, row[0]);
              } else {
                if(Date.parse(row[2]) !== NaN) {
                  currSchedule.push(row);
                }
              }
            } else {
              cleanupStatus(sheets, row[0]);
            }
          } else if(row[1] == 'DONE') {
            if(row[2] != undefined || row[2] !== '') { // datetime not blank '' or undefined
              if(new Date(row[2]) instanceof Date) { // datetime is a valid date
                if((toTimestamp(`${row[2]} UTC`)) * 1000 < Date.parse(new Date)) { // datetime is in the past
                  // date in past
                } else {
                  cleanupStatus(sheets, row[0]); // date not in past
                }
              }
            } else {
              cleanupStatus(sheets, row[0]);
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
          switch(sortedSchedule[i][4]) {
            case 'DEMO':
              // push datetime and 'Demoscene' to log array
              scheduleLog.push([sortedSchedule[i][2] + sortedSchedule[i][3], `Demoscene`]);
              break;
            case 'VOD':
              // push datetime and ''
              scheduleLog.push([sortedSchedule[i][2] + sortedSchedule[i][3], (sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') ? sortedSchedule[i][6].trim() : `VOD`]);
              break;
            case 'LIVE':
              // push datetime and remove 'LIVE:' from line1, then push formatted line1 to log array
              if(sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') {
                // console.log(sortedSchedule[i][6]);
                if(sortedSchedule[i][6].includes('LIVE:')) {
                  scheduleLog.push([sortedSchedule[i][2] + sortedSchedule[i][3], (sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') ? sortedSchedule[i][6].replace('LIVE:', '').trim() : `LIVE`]);
                }
              }
              break;
            default:
              if(sortedSchedule[i][6] != undefined && sortedSchedule[i][6] !== '') {
                scheduleLog.push([sortedSchedule[i][2] + sortedSchedule[i][3], sortedSchedule[i][6]]);
              }
          }
        }
      }
      let finalScheduleLog = [];
      if(scheduleLog.length > 0) {
        let prevDate;
        let tz = '';
        for(let i = 0; i < scheduleLog.length; i++) {
          // turn from UTC to EST
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
        // write to schedule.txt
        try {
          if(finalScheduleLog.length > 0) {
            let scheduleContent = ((tz !== '') ? tz : '') + finalScheduleLog.join(' |').slice(2);
            fs.writeFileSync('schedule.txt', scheduleContent.replaceAll('||', konceptSpacerEmote));
          }
        } catch(err) {
          console.log(`\x1b[33m%s\x1b[0m`, `[LOGGER]`, `Could not write schedule to text file.`);
        }
      }

    });
  }
}
