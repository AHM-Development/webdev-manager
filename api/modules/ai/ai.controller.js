var taskOrganizer = require('./task-organizer.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function organizeTask(req, res, next) {
  try {
    res.json(
      await taskOrganizer.organizeTask(
        req.body || {},
        req.user,
        context(req)
      )
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  organizeTask: organizeTask,
};
