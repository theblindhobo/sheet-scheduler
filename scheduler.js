const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

const schedule = require('node-schedule');
const dotenv = require('dotenv');
dotenv.config();

const refresh = 10000; // milliseconds

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = 'token.json';

fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  authorize(JSON.parse(content), searchSheet);
});

function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function searchSheet(auth) {
  let jobs = []; // only used to compare lists

  const sheets = google.sheets({version: 'v4', auth});
  sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'SCHEDULE!A2:D',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const rows = res.data.values;
    if (rows.length) {

      rows.map((row) => {
        function toTimestamp(strDate) {
          var datum = Date.parse(strDate);
          return datum/1000;
        }
        let timestamp = toTimestamp(`${row[0]} ${row[1]}`); // formats based on Timezone added on sheet
        let date = new Date(timestamp * 1000);

        let now = Date.parse(new Date);


        if(timestamp * 1000 < now) {
          // don't schedule job, time has passed already
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
          var j = schedule.scheduleJob(`${timestamp}`,date, function(){
            console.log(row[0]);

            fs.writeFile('log.txt', `${row[2]}:${row[3]}`, err => {
              if(err) {
                console.log(err);
                return
              }
              console.log(`File written successfully as: ${row[2]}:${row[3]}`);
            });

          });

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
      console.log(`Number of scheduled jobs: ${Object.keys(schedule.scheduledJobs).length}`);
    } else {
      console.log('No data found.');
    }
  });

  setTimeout(() => {
    console.log(`refreshing... `);
    searchSheet(auth);
  }, refresh);
}
