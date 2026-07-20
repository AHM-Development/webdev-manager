'use strict';

// Real-time task fan-out. Broadcasts task changes so open Tasks pages update
// without a refresh. Visibility mirrors the REST rules:
//   - approved tasks + deletions -> whole workspace (everyone sees the board/summary)
//   - pending/rejected requests   -> only the requester + managers (SA/Dev),
//     so staff never see other people's pending requests via realtime.
// Best-effort: never throws into the caller.

var realtime = require('../../realtime/socket');
var events = require('../../realtime/events');

function emitTaskChange(action, task) {
  try {
    if (!task || !task.id) return;
    var payload = { action: action, task: task };

    if (action === 'deleted' || task.requestStatus === 'approved') {
      realtime.emitToWorkspace(events.TASK_CHANGED, payload);
      return;
    }
    // Pending / rejected request: scope to who can see it.
    if (task.requestedBy) realtime.emitToUser(task.requestedBy, events.TASK_CHANGED, payload);
    realtime.emitToRole('superadmin', events.TASK_CHANGED, payload);
    realtime.emitToRole('developer', events.TASK_CHANGED, payload);
  } catch (err) {
    /* realtime is best-effort */
  }
}

module.exports = { emitTaskChange: emitTaskChange };
