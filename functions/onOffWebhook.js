const logger = require('./logger/logger.js');
const dotenv = require('dotenv');
dotenv.config();

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));



// Need a twitch API token
var konceptTwitchId = '105287570'; // koncept
// var konceptTwitchId = '179603603'; // anth

// var konceptTwitchClientId = process.env.KONCIERGE_TWITCH_CLIENT_ID; // koncierge_k
// var konceptTwitchOAuth = process.env.KONCIERGE_TWITCH_OAUTH; // koncierge_k
var konceptTwitchClientId = process.env.TEST_TWITCH_CLIENT_ID; // anth
var konceptTwitchOAuth = process.env.TEST_TWITCH_OAUTH; // anth

var webhookURL = process.env.TEST_ONLINE_CHECK_WEBHOOK_URL;

async function sendWebhook() {

  function getRandomContentSentence(roleId) {
    var sentences = [
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `Oh no, <@&${roleId}>! It appears the stream has gone offline. Can you fix it?`,
      `<@&${roleId}>?! Stream is down..`,
      `Can you get the stream back up please? <@&${roleId}>`,
      `We're offline <@&${roleId}>! Someone please get the stream back up!! Thxx`,
      `<@&${roleId}> we're offline`,
      `Attention <@&${roleId}> - the stream is offline!!`,
      `Please get the stream back online, <@&${roleId}>`,
      `.`
    ];
    var maxSentences = sentences.length;
    var index = Math.floor(Math.random() * (maxSentences - 1));
    return sentences[index];
  }

  var iconURL = 'https://i.imgur.com/BpBtNtI.png';
  // 956953388300529715 testing
  // 936150499743371284 koncept-ops
  var roleId = '956953388300529715';
  var content = await getRandomContentSentence(roleId);

  var params = {
    "username": "KONCEPT",
    "avatar_url": iconURL,
    "content": content
  };

  // post webhook
  try {
    // console.log('we here');
    await fetch(webhookURL, {
      method: 'POST',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => {
      logger.log(`[ONLINE CHECK]\tError posting webhook in fetch: ${err}`);
      console.log(`\x1b[33m%s\x1b[0m`, `[ONLINE CHECK]`, `\tError posting webhook in fetch: ${err}`);
    });
  } catch(err) {
    logger.log(`[ONLINE CHECK]\tWas not able to post webhook: ${err}`);
    console.log(`\x1b[33m%s\x1b[0m`, `[ONLINE CHECK]`, `\tWas not able to post webhook.`);
  }
}

// ping role 956391251459080263 in channel 934721294128271380
// ping role koncept-ops in channel #koncept-ops
module.exports = {
  onOffWebhook: async () => {
    // console.log('hello');
    try {
      fetch(`https://api.twitch.tv/helix/streams?user_id=${konceptTwitchId}`, {
          headers: {
            'Client-Id': konceptTwitchClientId,
            'Authorization': `Bearer ${konceptTwitchOAuth}`
          }
        }).then(response => {
            if(response.status === 200) {
              // console.log('200');
              return response.json()
            } else if(response.status === 401) {
              // console.log('Unauthorized - Check token and Client-Id');
              throw new Error(`ERROR: ${response.status} Unauthorized - Check token and Client-Id`);
            } else {
              // console.log('WHOOPS');
              throw new Error(`ERROR: ${response.status} WHOOPS!`);
            }
        }).then(async data => {
            if(data.data.length == undefined || data.data.length === 0) {
              // offline
              // console.log('offline');
              // send webhook to #koncept-ops
              await sendWebhook();
            } else if(data.data.length > 0) {
              // online
              // console.log('online');
              // await sendWebhook(); // for testing
            }
        }).catch(error => console.log(`[ONLINE CHECK]`, error));
    } catch(err) {
      console.log(`Was not able to check online/offline status`, err);
    }

  }
};
