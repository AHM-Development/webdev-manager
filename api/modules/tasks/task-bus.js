'use strict';

// Real-time task fan-out. Broadcasts task changes so open Tasks pages update
// without a refresh. Every task is on the board now (no approval flow), so
// changes go to the whole workspace. Best-effort: never throws into the caller.

var realtime = require('../../realtime/socket');
var events = require('../../realtime/events');

function emitTaskChange(action, task) {
  try {
    if (!task || !task.id) return;
    realtime.emitToWorkspace(events.TASK_CHANGED, { action: action, task: task });
  } catch (err) {
    /* realtime is best-effort */
  }
}

module.exports = { emitTaskChange: emitTaskChange };
