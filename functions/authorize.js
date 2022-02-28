const fs = require('fs');
const logger = require('./logger/logger.js');
const { google } = require('googleapis');
const readline = require('readline');

// If modifying these scopes, delete token.json.
// const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'];
const TOKEN_PATH = 'token.json';

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  logger.log(`[AUTHORIZE]\tAuthorize this app by visiting this url: ${authUrl}`);
  console.log(`[AUTHORIZE]\tAuthorize this app by visiting this url: ${authUrl}`);
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
        if (err) {
          logger.log(`[AUTHORIZE]\tError writing token to file: ${err}`);
          return console.error(`[AUTHORIZE]\tError writing token to file: ${err}`);
        }
        logger.log(`[AUTHORIZE]\tToken stored to: ${TOKEN_PATH}`);
        console.log(`[AUTHORIZE]\tToken stored to: ${TOKEN_PATH}`);
      });
      callback(oAuth2Client);
    });
  });
}

module.exports = {
  authorize: (credentials, callback) => {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    try {
      // Check if we have previously stored a token.
      fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
      });
    } catch(err) {
      logger.log(`[AUTHORIZE]\tError parsing JSON: ${err}`);
      console.log(`[AUTHORIZE]\tError parsing JSON: ${err}`);
    }
  }
};
