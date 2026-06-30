var realtime = require('../../realtime/socket');
var events = require('../../realtime/events');

function emitNotification(notification) {
  var payload = { notification: notification };

  if (notification.audienceType === 'user' && notification.userId) {
    return realtime.emitToUser(notification.userId, events.NOTIFICATION_CREATED, payload);
  }

  if (notification.audienceType === 'role' && notification.audienceValue) {
    return realtime.emitToRole(
      notification.audienceValue,
      events.NOTIFICATION_CREATED,
      payload
    );
  }

  return realtime.emitToWorkspace(events.NOTIFICATION_CREATED, payload);
}

module.exports = {
  emitNotification: emitNotification,
};
