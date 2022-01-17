const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

const schedule = require('node-schedule');
const dotenv = require('dotenv');
dotenv.config();

const refresh = 10000; // milliseconds


const WebSocket = require('ws');
var client;
function connectWebsocket() {
  client = new WebSocket('ws://localhost:3124');
  client.on('open', function open() {
    console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Connected at ws://localhost:3124`);
  });
  function heartbeat(client) {
    clearTimeout(client.pingTimeout);
    client.pingTimeout = setTimeout(() => {
      client.close(1000, 'Terminated');
    }, 30000 + 1000);
  }
  client.on('message', async function(event) {
    const data = JSON.parse(event);
    if(data.event === 'ping') {
      heartbeat(client);
      client.send(JSON.stringify({ "event": "pong" }));
    }
  });

  client.on('error', (err) => {
    // console.log(`\x1b[32m%s\x1b[0m`, `[WEBSOCKET]`, `Error:`, err.errno);
  });
  client.on('close', function(event) {
    clearTimeout(client.pingTimeout);
    client = null; // connection died, discard old and create new
    console.log(`\x1b[35m%s\x1b[31m%s\x1b[33m%s\x1b[31m%s\x1b[0m`, `[WEBSOCKET]`, ` Error: `, event, `\t Disconnected from WebSocket..`, `reconnecting..`);
    setTimeout(function () {
      connectWebsocket(); // Reconnect
    }, 10000);
  });
  return client;
}
connectWebsocket();
var ws;
const wsOpenListener = (event) => {
  console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Connected.`);
};
const wsMessageListener = (event) => {
  console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Received message.`);
};
const wsCloseListener = (event) => {
  if(ws) {
    console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Disconnected.`);
  }
  ws = new WebSocket('ws://localhost:3124');
  ws.on('open', wsOpenListener);
  ws.on('message', wsMessageListener);
  ws.on('close', wsCloseListener);
};



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
    range: 'MASTER SCHEDULE!A2:K',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const rows = res.data.values;
    if (rows.length) {

      rows.map((row) => {
        function toTimestamp(strDate) {
          var datum = Date.parse(strDate);
          return datum/1000;
        }
        // Checks if there is an ACTION & FILE/ETC
        if(row.length >= 4) {
          let rowObj = {
            datetime: row[0],
            timezone: row[1] ? row[1] : 'UTC',
            action: row[2],
            uri: row[2] == 'LIVE' ? row[3] : '',
            name: row[4],
            line1: row[5] ? row[5] : '',
            line2: row[6] ? row[6] : ''
          };

          if(rowObj.action == '' || rowObj.name == '') {
            // partial row
          } else {
            let timestamp = toTimestamp(`${rowObj.datetime} ${rowObj.timezone}`); // formats based on Timezone added on sheet
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

                if(rowObj.action == 'LIVE') {
                  let socket = client ? client : 'closed';
                  if(socket == 'closed') {
                    console.log(`\x1b[35m%s\x1b[0m`, `[WEBSOCKET]`, `Cannot send titles because websocket is closed.`);
                  } else {
                    socket.send(JSON.stringify({
                        "event": "titles",
                        "data": {
                          "action": rowObj.action,
                          "name": rowObj.name,
                          "line1": rowObj.line1,
                          "line2": rowObj.line2
                        }
                    }));
                  }
                }
                let content = (rowObj.action == 'LIVE') ? `${rowObj.uri}:${rowObj.name}` : `${rowObj.action}:${rowObj.name}`;
                fs.writeFile('log.txt', content, err => {
                  if(err) {
                    console.log(`\x1b[31m%s\x1b[0m`, `[SCHEDULER]`, err);
                    return
                  }
                  console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[0m`, `\n[SCHEDULER]`, ` Successfully logged to file as: ${content}`, `\t ${rowObj.datetime} ${rowObj.timezone}\n`);
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
    } else {
      console.log(`\x1b[33m%s\x1b[0m`, `[SCHEDULER]`, `\x1b[33m%s\x1b[0m`, 'No data found.');
    }
  });

  setTimeout(() => {
    console.log(`\x1b[36m%s\x1b[0m%s\x1b[33m%s\x1b[32m%s\x1b[0m`, `[SCHEDULER]`, `\t Scheduled jobs: `, Object.keys(schedule.scheduledJobs).length, `\t refreshing... `);
    searchSheet(auth);
  }, refresh);
}
