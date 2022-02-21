const fs = require('fs');
const logger = require('./logger/logger.js');
const imageToBase64 = require('image-to-base64');
var { FormData, File } = require('formdata-node');
const dotenv = require('dotenv');
dotenv.config();

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// for stream preview param
var randResolutions = [
  "557x313", "538x303", "518x291",
  "499x281", "480x270", "461x259",
  "442x249", "422x237", "403x227"
];
let counter = Date.now();

async function cachePreview(twitchPreviewURL) {

  try {
    // save preview to /.cache/ folder
    let finalRes = await fetch(twitchPreviewURL)
        .then(async res => {
          let stream = await fs.createWriteStream(`./functions/.cache/twitchPreview.jpg`)
          await res.body.pipe(stream)
          await stream.on('finish', () => {});

          return new Promise((resolve, reject) => {
              setTimeout(async () => {
                // convert img to base64
                var form = new FormData();
                let imgBase64;
                var file = await imageToBase64(`./functions/.cache/twitchPreview.jpg`)
                  .then(res => { imgBase64 = res; }).catch(err => {
                    logger.log(`[WEBHOOK]\tError converting file to base64: ${err}`);
                    console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tError converting file to base64: ${err}`);
                  });
                await form.set('image', imgBase64);
                // upload base64 img to imgbb
                let results;
                var postFile = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
                  method: 'POST',
                  body: form
                }).then(res => res.json())
                  .then(data => {
                    if(data.status == 200) {
                      results = data.data.url;
                    }
                }).catch(err => {
                  logger.log(`[WEBHOOK]\tError posting file: ${err}`);
                  console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tError posting file: ${err}`);
                });
                resolve(results);
              }, 1000);
          })
        })
        .catch(err => {
          logger.log(`[WEBHOOK]\tError fetching file: ${err}`);
          console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tError fetching file: ${err}`);
        });
    return finalRes;
  } catch(err) {
    logger.log(`[WEBHOOK]\tWas not able to cache and upload preview, resorting to client-based preview process.`)
    console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tWas not able to cache and upload preview, resorting to client-based preview process.`);
    return twitchPreviewURL;
  }
}

module.exports = {
  webhook: async (rowObj) => {
    if(rowObj.action != 'DISPLAY' && rowObj.action != 'DEMO') {
      if(!isNaN(Date.parse(rowObj.datetime))) {
        var timestampDate = new Date();

        var descriptionLine1 = (rowObj.line1.substring(0,5).toLowerCase() == 'live:') ? rowObj.line1.slice(5).trim() : rowObj.line1

        var twitchRegex = /(http:\/\/|https:\/\/|ftp:\/\/)?(www.)?(twitch.tv\/)\w+/gi;
        var twitchUserRegex = /(http:\/\/|https:\/\/|ftp:\/\/)?(www.)?(twitch.tv\/)/gi;
        var line2 = rowObj.line2.replaceAll(twitchRegex, function(match) {
            return '**' + match + '**';
          }).replaceAll(twitchUserRegex, '');
        var descriptionLine2 = (rowObj.line2.includes('twitch.tv/')) ? line2 : rowObj.line2;

        var url = "https://www.twitch.tv/koncept_k";
        var iconURL = "https://i.imgur.com/BpBtNtI.png";
        var content = `Next on **KONCEPT**: ${descriptionLine1}\nhttps://www.twitch.tv/koncept_k`;;

        var showTitle = `${descriptionLine1}`;
        var showDescription = `${descriptionLine2}`;
        var color = 16711770; // KONCEPT pink = hex #ff005a, must be decimal value

        var channelUser = 'koncept_k';
        var streamPreview = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channelUser}-${randResolutions[Math.floor(Math.random()*randResolutions.length)]}.jpg?count=${counter}`;

        var resPreview = await cachePreview(streamPreview);

        counter++;

        // setup embed
        var params = await {
          "username": "KONCEPT",
          "avatar_url": iconURL,
          "content": content,
          "embeds": [
            {
              "author": {
                "name": "KONCEPT",
                "url": url,
                "icon_url": iconURL
              },
              "title": showTitle,
              "url": url,
              "description": showDescription,
              "color": color,
              "image": {
                "url": resPreview
              },
              "footer": {
                "text": "STARTING"
              },
              "timestamp": timestampDate
            }
          ]
        }

        // post webhook
        try {
          await fetch(process.env.LIVE_WEBHOOK_URL, {
            method: 'POST',
            body: JSON.stringify(params),
            headers: { 'Content-Type': 'application/json' }
          }).catch(err => {
            logger.log(`[WEBHOOK]\tError posting webhook in fetch: ${err}`);
            console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tError posting webhook in fetch: ${err}`);
          });
        } catch(err) {
          logger.log(`[WEBHOOK]\tWas not able to post webhook: ${err}`);
          console.log(`\x1b[33m%s\x1b[0m`, `[WEBHOOK]`, `\tWas not able to post webhook.`);
        }

      }

    }
  }
};
