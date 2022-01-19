const fs = require('fs');
const schedule = require('node-schedule');
const dotenv = require('dotenv');
dotenv.config();

let nowIndex; // 'NOW'

module.exports = {
  sheetLogic: (google, auth, client) => {
    let jobs = []; // only used to compare lists

    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'MASTER SCHEDULE!B2:K',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
      const rows = res.data.values;
      if (rows.length) {
        // A:STATUS, B:DATEIMTE, C:TIME, D:ACTION, E:URI, F:NAME, G:LINE1, H:LINE2

        for(let i = 0; i < rows.length; i++) {
          rows[i].unshift(i + 2); // sets index at beginning of each row array
          if(rows[i][1] == 'NOW') {
            nowIndex = i + 2;
          }
        }

        rows.map((row) => {

          let rowObj = {
            index: row[0]
          };

          function toTimestamp(strDate) {
            var datum = Date.parse(strDate);
            return datum/1000;
          }

          if(row[1] == 'DISPLAY' && row[0] == 2) {
            // send Quick Display titles without logging to file
            function clearDisplayDone(index) {
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
                  range: `MASTER SCHEDULE!G${index}`,
                  values,
                },
                {
                  range: `MASTER SCHEDULE!H${index}`,
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
                  console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DISPLAYED titles immediately and CLEARED cells at `, `B${index}, G${index}, H${index}`);
                }
              });
            }
            rowObj.datetime = row[1];
            rowObj.line1 = row[6] ? row[6] : '';
            rowObj.line2 = row[7] ? row[7] : '';
            let displayObj;
            let socket = client ? client : 'closed';
            if(socket == 'closed') {
              console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed.`);
            } else {
              displayObj = {
                  "event": "titles",
                  "data": {
                    "action": 'DISPLAY',
                    "uri": '',
                    "name": 'Quick Display',
                    "line1": rowObj.line1,
                    "line2": rowObj.line2
                  }
              };
              function sendDisplay() {
                setTimeout(() => {
                  socket.send(JSON.stringify(displayObj));
                }, 2000);
              }

              if(socket.readyState == 1) {
                sendDisplay();
              } else {
                console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send Quick Display to websocket. Socket is closed, closing, or reconnecting. Try again later.`);
              }
              clearDisplayDone(rowObj.index);
          }
        } else if((row[0] >= 5 && row.length >= 5 && !isNaN(new Date(row[1]))) || (row[0] >= 5 && row.length >= 5 && row[1] == 'NOW')) {
            rowObj.datetime = row[1];
            rowObj.timezone = (row[2] == 'UTC') ? row[2] : 'UTC';
            rowObj.action = row[3];
            rowObj.uri = (row[3] == 'LIVE') ? row[4] : '';
            rowObj.name = row[5];
            rowObj.line1 = row[6] ? row[6] : '';
            rowObj.line2 = row[7] ? row[7] : '';

            // Checks if there is an ACTION & FILE/ETC
            if(rowObj.action == '' || rowObj.name == '') {
              // partial row
            } else if(new Date(rowObj.datetime) instanceof Date || rowObj.datetime == 'NOW') {
              let now = Date.parse(new Date);
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
                jobs.push(timestamp);

                let myObject = [schedule.scheduledJobs];
                if(myObject.find(e => e[timestamp.toString()])) {
                  // cancel and reschedule
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

                  // add DONE to STATUS column
                  function writeStatusDone(index) {
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
                  }

                  if(rowObj.datetime == 'NOW') {
                    rowObj.datetime = (date.getUTCMonth()+1) + '/' + date.getUTCDate() + '/' + date.getUTCFullYear() + ' ' + date.getUTCHours() + ':' + date.getUTCMinutes() + ':' + date.getUTCSeconds();
                    function writeNowDatetime(index, datetime, date) {
                      let range = (index != undefined) ? `MASTER SCHEDULE!B${index}` : `MASTER SCHEDULE!B${rows.length + 3}`;
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
                    writeNowDatetime(nowIndex, rowObj.datetime, date);
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
                            "uri": (rowObj.uri !== undefined) ? rowObj.uri : '',
                            "name": (rowObj.name !== undefined) ? rowObj.name : 'Quick Display',
                            "line1": rowObj.line1,
                            "line2": rowObj.line2
                          }
                      };
                      function sendTitle() {
                        // send title, then mark as DONE
                        socket.send(JSON.stringify(titleObj));
                        writeStatusDone(rowObj.index)
                      }
                      if(socket.readyState == 1) {
                        sendTitle();
                      } else {
                        console.log(`\x1b[35m%s\x1b[0m`, `\n[WEBSOCKET]`, `Couldn't send titles to websocket. Socket is closed, closing, or reconnecting.`);
                      }
                    }
                  }
                  if(rowObj.action == 'DEMO') {
                    writeStatusDone(rowObj.index);
                  }

                  // write to log file
                  let content = (rowObj.action == 'LIVE') ? `${rowObj.uri}:${rowObj.name}` : `${rowObj.action}:${rowObj.name}`;
                  fs.writeFile('log.txt', content, err => {
                    if(err) {
                      console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, err);
                      return
                    }

                    console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `\n[SCHEDULER]`, `\t Successfully logged to file as: ${content}  `, `  ${rowObj.datetime} ${rowObj.timezone}\n`);
                  });
                });
              }
            }
          }
        });

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
    });
  }
}
