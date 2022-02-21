module.exports = {
  dateRightNow: () => {
    var dateNow = new Date();
    const dEST = new Intl.DateTimeFormat(undefined, {
      timeZone: 'UTC',
      timeZoneName: 'short',
      hourCycle: 'h24',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(Date.parse(dateNow));
    let hourNow = dEST.split(',')[2].trim().split(' ')[0].trim();
    hourNow = (hourNow.substring(0,2) == '24') ? hourNow.replace(/^.{2}/g, '00') : hourNow;
    let formattedDate = dEST.split(',')[1].trim().split('/')
    formattedDate = formattedDate[2] + '-' + formattedDate[0] + '-' + formattedDate[1];
    var logDate = formattedDate + ' ' + hourNow + ' ' + dEST.split(',')[2].trim().split(' ')[1];
    return logDate;
  }
};
