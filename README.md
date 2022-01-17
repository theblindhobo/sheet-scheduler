## Scheduler

*Grabs information from Google Sheet and schedules jobs based on date/time. These jobs always write to a log file (that is used to Switch Scenes in OBS) and they may send Lower Third title information to another application.*


---
**Setup:**
1.  Download repo
2.  Open terminal in folder
3.  run `npm i` to install all the necessary modules
4.  Websocket port used is set to **3124**, if you're wanting to change this port.. you must do so within the **scheduler.js** file on lines 15 & 58.
5.  You need a Google Cloud Platform account setup with Google Sheet API, API Key, Client ID, Client Secret.
6.  In the **.env** file, add `SPREADSHEET_ID=""` with the ID of the spreadsheet you'll be reading from.
7.  If your token isn't working, delete the **token.json** file and run the app `node .` -- follow the directions it gives you.

---
**Running:**
1.  Open a terminal in this folder
2.  Run process `node .`
3.  Leave this process running so scheduler can schedule jobs and talk freely with the websocket server.
4.  Logs to **log.txt** within this same folder.
