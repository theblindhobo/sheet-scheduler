const logger = require('../../functions/logger/logger.js');
const dotenv = require('dotenv');
dotenv.config();

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


let state = 'TESTING';
let konceptTwitchId;
let konciergeClientId;
let konciergeOAuth;
switch(state) {
  case 'LIVE':
    // koncierge
    konceptTwitchId = '105287570';
    konciergeClientId = process.env.TWITCH_KONCIERGE_CLIENT_ID;
    konciergeOAuth = process.env.TWITCH_KONCIERGE_OAUTH;
    break;
  case 'TESTING':
    // circuit__bot

    konceptTwitchId = '528967860'; // circuitaz twitch ID
    // konceptTwitchId = '26301881'; // TEST - unauthorized

    konciergeClientId = process.env.TEST_CIRCUIT_TWITCH_CLIENT_ID; // circuit__bot
    konciergeOAuth = process.env.TEST_CIRCUIT_TWITCH_OAUTH; // circuit__bot
    break;
  case 'TESTING CIRCUIT__BOT SELF':
    // for testing self
    konceptTwitchId = '554674093'; // circuit__bot twitch ID
    konciergeClientId = process.env.TEST_CIRCUIT_TWITCH_CLIENT_ID; // circuit__bot
    konciergeOAuth = process.env.TEST_CIRCUIT_TWITCH_OAUTH; // circuit__bot
    break;
  default:
    // circuit__bot
    konceptTwitchId = '528967860'; // circuitaz twitch ID
    konciergeClientId = process.env.TEST_CIRCUIT_TWITCH_CLIENT_ID; // circuit__bot
    konciergeOAuth = process.env.TEST_CIRCUIT_TWITCH_OAUTH; // circuit__bot
}

console.log(`\x1b[33m%s\x1b[0m`, `[STATE]`, state);



module.exports = {
  setTitle: async (column) => {

    if(column !== undefined && column.action !== undefined) {
      async function getTitle(column) {

        let title;
        let header = `//< `;
        let footer = ` [!now] [!schedule]`;
        switch(column.action) {
          case 'LIVE':
            title = header + ((column.line1 !== undefined || column.line1 !== '') ? column.line1 : 'LIVE') + footer;
            break;
          case 'VOD':
            title = header + ((column.line1 !== undefined || column.line1 !== '') ? column.line1 : 'REVIBE') + footer;
            break;
          case 'DEMO':
            title = header + ((column.line1 !== undefined || column.line1 !== '') ? column.line1 : 'NOW: Demoscene') + footer;
            break;
          default:
            title = header + 'KONCEPT';
        }
        return title;
      }
      try {
        var title = await getTitle(column);

        await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${konceptTwitchId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: title,
          }),
          headers: {
            'Authorization': `Bearer ${konciergeOAuth}`,
            'Client-Id': konciergeClientId,
            'Content-Type': 'application/json'
          },
        }).then(async response => {
          let responseObj;
          switch(response.status) {
            case 204:
              /*
              // success
              logger.log(`[SET TITLE] Success!`);
              console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `Success!`);
              */
              break;
            case 400:
              // missing or invalid parameter
              logger.log(`[SET TITLE] Response Code: ${response.status}`);
              console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `Response Code: `, response.status);
              break;
            case 401:
              responseObj = await response.json().then(data=>data);
              // unauthorized
              if(responseObj.error === 'Unauthorized' && responseObj.message === 'incorrect user authorization') {
                logger.log(`[SET TITLE] UNAUTHORIZED - INCORRECT USER AUTHORIZATION: This token does not have the correct access to make this request. Be sure you're granting access to the proper twitch channel. Verify the token is for correct user, has the correct scopes needed for its tasks, and is getting access to change stream titles in the channel(s) of your choosing.`);
                console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `UNAUTHORIZED - INCORRECT USER AUTHORIZATION: This token does not have the correct access to make this request. Be sure you're granting access to the proper twitch channel. Verify the token is for correct user, has the correct scopes needed for its tasks, and is getting access to change stream titles in the channel(s) of your choosing.`);
              } else {
                logger.log(`[SET TITLE] ${responseObj.error} ${responseObj.status}: ${responseObj.message}`);
                console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `Response Code: ${responseObj.error} ${responseObj.status}: `, responseObj.message);
              }
              break;
            case 500:
              // internal server error; failed to update channel
              logger.log(`[SET TITLE] Internal Server Error: ${response.status}`);
              console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `Internal Server Error: `, response.status);
              break;
            default:
              logger.log(`[SET TITLE] ??? ???`);
              console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `??? ???`);
          }
        }).catch(error => {
            logger.log(`[SET TITLE] ${error}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, error);
          });
      } catch(error) {
        logger.log(`[SET TITLE] Caught Error: ${error}`);
        console.log(`\x1b[33m%s\x1b[0m`, `[SET TITLE]`, `Caught Error: `, error);
      }
    }
  }
}
