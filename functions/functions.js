const dotenv = require('dotenv');
dotenv.config();
var sheetName = process.env.SHEET_NAME
var sheetColumn = {
  status: 'A',
  datetime: 'B',
  line1: 'F',
  line2: 'G'
};

module.exports = {
  toTimestamp: (strDate) => {
    var datum = Date.parse(strDate);
    return datum/1000;
  },
  clearDisplayDone: (sheets, index) => {
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
        console.log(err);
      } else {
        console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DISPLAYED titles immediately and CLEARED cells at `, `${sheetColumn.datetime}${index}, ${sheetColumn.line1}${index}, ${sheetColumn.line2}${index}`);
      }
    });
  },
  sendDisplay: (socket, displayObj) => {
    setTimeout(() => {
      socket.send(JSON.stringify(displayObj));
    }, 2000);
  },
  writeStatusDone: (sheets, index) => {
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
          console.log(err);
        } else {
          console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `${sheetColumn.status}${index}`);
        }
      });
    }, 1000);
  },
  writeStatusScheduled: (sheets, index) => {
    // check if STATUS says scheduled already, if not.. write it
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!${sheetColumn.status}${index}`,
    }, (err, res) => {
      if(err) return console.log('[WRITE STATUS]', index, ' The API returned an error: ' + err);
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
            console.log(err);
          } else {
            // console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
          }
        });
      }
    });
  },
  cleanupStatus: (sheets, index) => {
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!${sheetColumn.status}${index}`,
    }, (err, res) => {
      if(err) return console.log('[CLEANUP STATUS] The API returned an error: ' + err);

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
          console.log(err);
        } else {
          // console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t STATUS updated at cell `, `A${index}`);
        }
      });

    });
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
        console.log(err);
      } else {
        console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\t DATETIME updated at cell `, `${sheetColumn.datetime}${index}`);
      }
    });
  }
};
