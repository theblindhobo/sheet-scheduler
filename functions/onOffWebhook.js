const logger = require('./logger/logger.js');
const dotenv = require('dotenv');
dotenv.config();

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


var konceptTwitchId = '105287570'; // koncept
// var konceptTwitchId = '179603603'; // anth


var environmentals = {
  webhookURL: process.env.TEST_CHECK_ONLINE_WEBHOOK_URL,
  notifyDiscordUser: process.env.NOTIFY_DISCORD_USER,
  notifyWebhookURL: process.env.NOTIFY_WEBHOOK_URL
};

let state = 'TESTING CIRCUIT';
switch(state) {
  case 'LIVE':
    environmentals.twitchClientId = process.env.TWITCH_KONCIERGE_CLIENT_ID;
    environmentals.twitchOAuth = process.env.TWITCH_KONCIERGE_OAUTH;
    break;
  case 'TESTING':
    environmentals.twitchClientId = process.env.TEST_TWITCH_CLIENT_ID; // anth
    environmentals.twitchOAuth = process.env.TEST_TWITCH_OAUTH; // anth
    break;
  case 'TESTING CIRCUIT':
    environmentals.twitchClientId = process.env.TEST_CIRCUIT_TWITCH_CLIENT_ID; // testing outdated
    environmentals.twitchOAuth = process.env.TEST_CIRCUIT_TWITCH_OAUTH; // testing outdated
    break;
  default:
    environmentals.twitchClientId = '';
    environmentals.twitchOAuth = '';
}




var remindAfterMinutes = 14; // remind after 14mins (ends up being 15mins)

let offlineCounter = 0;
async function sendWebhook() {
  var webhookURL = environmentals.webhookURL;

  function getRandomContentSentence(roleId) {
    var sentences = [
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> The stream is offline. Please restart stream.`,
      `<@&${roleId}> It appears the stream has gone offline. Can you fix it?`,
      `<@&${roleId}> Stream is down..`,
      `<@&${roleId}> Can you get the stream back up please?`,
      `<@&${roleId}> We're offline! Someone please get the stream back up!`,
      `<@&${roleId}> we're offline`,
      `<@&${roleId}> Attention - the stream is offline!`,
      `<@&${roleId}> Please get the stream back online.`,
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


async function sendWebhookInvalidOAuth() {
  var iconURL = 'https://i.imgur.com/BpBtNtI.png';
  var kitschId = environmentals.notifyDiscordUser;

  var oauthLink = `https://id.twitch.tv/oauth2/authorize?client_id=${environmentals.twitchClientId}&redirect_uri=http://localhost&response_type=token&scope=channel:manage:broadcast+channel:moderate+chat:edit+chat:read+whispers:read+whispers:edit`;
  var content = `<@${kitschId}>\nPlease update the \`TWITCH_KONCIERGE_OAUTH\` token in the **.env** file of the **Scheduler** app\n<${oauthLink}>\n\nWhen updating the **.env** file, only include the *value* of the *access_token* parameter from the response of the above link.`;

  var params = {
    "username": "KONCEPT",
    "avatar_url": iconURL,
    "content": content
  };

  // post webhook
  try {
    await fetch(environmentals.notifyWebhookURL, {
      method: 'POST',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => {
      logger.log(`[TWITCH OAUTH]\tError posting webhook in fetch: ${err}`);
      console.log(`\x1b[33m%s\x1b[0m`, `[TWITCH OAUTH]`, `\tError posting webhook in fetch: ${err}`);
    });
  } catch(err) {
    logger.log(`[TWITCH OAUTH]\tWas not able to post webhook: ${err}`);
    console.log(`\x1b[33m%s\x1b[0m`, `[TWITCH OAUTH]`, `\tWas not able to post webhook.`);
  }
}

// 15min cooldown on sending OAuth Webhook
let webhookCooldown = false;

// ping role 956391251459080263 in channel 934721294128271380
// ping role koncept-ops in channel #koncept-ops
module.exports = {
  onOffWebhook: async () => {
    try {
      fetch(`https://api.twitch.tv/helix/streams?user_id=${konceptTwitchId}`, {
          headers: {
            'Client-Id': environmentals.twitchClientId,
            'Authorization': `Bearer ${environmentals.twitchOAuth}`
          }
        }).then(async response => {

            let responseObj = {};

            if(response.status === 200) {
              return response.json()
            } else if(response.status === 401) {
              responseObj = await response.json().then(data=>data);
              if(responseObj.message === 'Invalid OAuth token') {
                if(!webhookCooldown) {
                  webhookCooldown = true
                  // send webhook telling to update OAuth token in .env file
                  await sendWebhookInvalidOAuth();
                  setTimeout(() => {
                    webhookCooldown = false;
                  }, remindAfterMinutes * 60 * 1000);
                }
              }
              throw new Error(`ERROR: ${responseObj.status} ${responseObj.error} - ${responseObj.message}`);
            } else {
              responseObj = await response.json().then(data=>data);
              // console.log('WHOOPS');
              throw new Error(`ERROR: ${response} WHOOPS!`);
            }
        }).then(async data => {
            if(data.data.length == undefined || data.data.length === 0) {
              // offline
              // console.log('offline');

              // send webhook to #koncept-ops
              offlineCounter++;
              if(offlineCounter > 2) {
                offlineCounter = 0;
                await sendWebhook();
              }
            } else if(data.data.length > 0) {
              // online
              // console.log('online');

              var onlineData = {
                "id": data.data[0].id,
                "user_id": data.data[0].user_id,
                "user_login": data.data[0].user_login,
                "user_name": data.data[0].user_name,
                "game_id": data.data[0].game_id,
                "game_name": data.data[0].game_name,
                "type": data.data[0].type,
                "title": data.data[0].title,
                "viewer_count": data.data[0].viewer_count,
                "started_at": data.data[0].started_at,
                "language": data.data[0].language,
                "thumbnail_url": data.data[0].thumbnail_url,
                "tag_ids": data.data[0].tag_ids,
                "is_mature": data.data[0].is_mature
              };

              // await sendWebhook(); // for testing purposes
            }
        }).catch(error => {
            if(error.toString().includes('ERROR: 401 Unauthorized - Invalid OAuth token')) {
              logger.log(`[ONLINE CHECK] Error: Invalid OAuth token`);
              console.log(`[ONLINE CHECK] Error: Invalid OAuth token`);
            } else {
              logger.log(`[ONLINE CHECK] ${error}`);
              console.log(`[ONLINE CHECK]`, error);
            }
        });
    } catch(err) {
      logger.log(`Was not able to check online/offline status ${err}`);
      console.log(`Was not able to check online/offline status`, err);
    }

  }
};
