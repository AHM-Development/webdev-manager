var service = require('./tasks.service');
var comments = require('./task-comments.service');
var uploads = require('../../lib/uploads');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function list(req, res, next) {
  try {
    res.json({
      tasks: await service.listTasks(
        {
          projectId: req.query.projectId,
          status: req.query.status,
          assignee: req.query.assignee,
          mine: req.query.mine === 'true',
          requests: req.query.requests === 'true',
          requestStatus: req.query.requestStatus,
        },
        req.user
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function mine(req, res, next) {
  try {
    res.json({
      tasks: await service.listTasks({ mine: true, projectId: req.query.projectId }, req.user),
    });
  } catch (err) {
    next(err);
  }
}

async function assignees(req, res, next) {
  try {
    res.json({ assignees: await service.listAssignees() });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    res.json({ task: await service.getTask(req.params.taskId) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json({
      task: await service.createTask(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    res.json({
      task: await service.updateTask(
        req.params.taskId,
        req.body || {},
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    res.json({
      task: await service.updateStatus(
        req.params.taskId,
        req.body && req.body.status,
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function move(req, res, next) {
  try {
    res.json({
      tasks: await service.moveTasks(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteTask(req.params.taskId, req.user, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}


async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) {
      var err = new Error('No file was uploaded.');
      err.status = 400;
      err.code = 'NO_FILE';
      throw err;
    }
    res.status(201).json({
      attachment: {
        id: 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        name: req.file.originalname,
        type: 'file',
        url: uploads.taskFileUrl(req.file.filename),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function listComments(req, res, next) {
  try {
    res.json({ comments: await comments.listComments(req.params.taskId) });
  } catch (err) {
    next(err);
  }
}

async function createComment(req, res, next) {
  try {
    res.status(201).json({
      comment: await comments.createComment(
        req.params.taskId,
        req.body || {},
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    await comments.deleteComment(req.params.taskId, req.params.commentId, req.user);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list: list,
  mine: mine,
  assignees: assignees,
  get: get,
  uploadAttachment: uploadAttachment,
  listComments: listComments,
  createComment: createComment,
  deleteComment: deleteComment,
  create: create,
  update: update,
  updateStatus: updateStatus,
  move: move,
  remove: remove,
};
