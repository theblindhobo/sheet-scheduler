const logger = require('./logger/logger.js');
const dotenv = require('dotenv');
dotenv.config();
var sheetName = process.env.SHEET_NAME
var sheetColumn = {
  status: 'A',
  datetime: 'B',
  line1: 'F',
  line2: 'G'
};

// DISABLING COUNTERS ON EVERYTHING
let clearDisplayDoneCounter = 0; //
let writeStatusDoneCounter = 0; //
let writeStatusScheduledCounter = 0; //
let cleanupStatusCounter = 0; //

module.exports = {
  toTimestamp: (strDate) => {
    var datum = Date.parse(strDate);
    return datum/1000;
  },
  clearDisplayDone: (sheets, index) => {
    if(clearDisplayDoneCounter >= 10) clearDisplayDoneCounter = 0;
    // clearDisplayDoneCounter++;
    setTimeout(() => {
      let status = ''
      let values = [
        [
          status
        ],
      ];
      let data = [
        {
          range: `${sheetName}!${sheetColumn.datetime}${index}`,
          values,
        },
        {
          range: `${sheetName}!${sheetColumn.line1}${index}`,
          values,
        },
        {
          range: `${sheetName}!${sheetColumn.line2}${index}`,
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
          logger.log(`[CLEAR DISPLAY] Error: ${err}`);
          console.log(`[CLEAR DISPLAY] Error: `, err);
        } else {
          logger.log(`[SCHEDULER]\tDISPLAYED titles immediately and CLEARED cells at ${sheetColumn.datetime}${index}, ${sheetColumn.line1}${index}, ${sheetColumn.line2}${index}`);
          console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DISPLAYED titles immediately and CLEARED cells at `, `${sheetColumn.datetime}${index}, ${sheetColumn.line1}${index}, ${sheetColumn.line2}${index}`);
        }
      });
    }, clearDisplayDoneCounter * 500);
  },
  sendDisplay: (socket, displayObj) => {
    setTimeout(() => {
      socket.send(JSON.stringify(displayObj));
    }, 2000);
  },
  writeStatusDone: (sheets, index) => {
    if(writeStatusDoneCounter >= 10) writeStatusDoneCounter = 0;
    // writeStatusDoneCounter++;
    setTimeout(() => {
      let range = `${sheetName}!${sheetColumn.status}${index}`;
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
          logger.log(`[WRITE STATUS DONE] Error: ${err}`);
          console.log(`[WRITE STATUS DONE] Error: `, err);
        } else {
          logger.log(`[SCHEDULER]\tSTATUS updated at cell ${sheetColumn.status}${index}`);
          console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `${sheetColumn.status}${index}`);
        }
      });
    }, writeStatusDoneCounter * 1000);
  },
  writeStatusScheduled: (sheets, index) => {
    if(writeStatusScheduledCounter >= 10) writeStatusScheduledCounter = 0;
    // writeStatusScheduledCounter++;
    // check if STATUS says scheduled already, if not.. write it
    setTimeout(() => {
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!${sheetColumn.status}${index}`,
      }, (err, res) => {
        if(err) {
          logger.log(`[WRITE STATUS] INDEX: ${index}\tThe API returned an error: ${err}`);
          return console.log('[WRITE STATUS]', index, ' The API returned an error: ' + err);
        }
        if(res.data.values == undefined || res.data.values[0][0] !== 'SCHEDULED') {
          let range = `${sheetName}!${sheetColumn.status}${index}`;
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
              logger.log(`[WRITE STATUS SCHEDULED] Error: ${err}`);
              console.log(`[WRITE STATUS SCHEDULED] Error: `, err);
            } else {
              // logger.log(`[SCHEDULER]\tSTATUS updated at cell A${index}`);
              // console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
            }
          });
        }
      });
    }, writeStatusScheduledCounter * 500);
  },
  cleanupStatus: async (sheets, index) => {
    if(cleanupStatusCounter >= 10) cleanupStatusCounter = 0;
    // cleanupStatusCounter++;
    setTimeout(() => {
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!${sheetColumn.status}${index}`,
      }, (err, res) => {
        if(err) {
          logger.log(`[CLEANUP STATUS] The API returned an error: ${err}`);
          return console.log(`[CLEANUP STATUS] The API returned an error: `, err);
        }

        let range = `${sheetName}!${sheetColumn.status}${index}`;
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
            logger.log(`[CLEANUP STATUS] Error: ${err}`);
            console.log(`[CLEANUP STATUS] Error: `, err);
          } else {
            // logger.log(`[SCHEDULER]\tSTATUS updated at cell A${index}`);
            // console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
          }
        });

      });
    }, cleanupStatusCounter * 500);
  },
  sendTitle: (socket, titleObj) => {
    socket.send(JSON.stringify(titleObj));
  },
  writeNowDatetime: (sheets, rowsLength, index, datetime, date) => {
    let range = (index != undefined) ? `${sheetName}!${sheetColumn.datetime}${index}` : `${sheetName}!${sheetColumn.datetime}${rowsLength + 3}`;
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
        logger.log(`[WRITE NOW DATETIME] Error: ${err}`);
        console.log(`[WRITE NOW DATETIME] Error: `, err);
      } else {
        logger.log(`[SCHEDULER]\tDATETIME updated at cell ${sheetColumn.datetime}${index}`);
        console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DATETIME updated at cell `, `${sheetColumn.datetime}${index}`);
      }
    });
  }
};
