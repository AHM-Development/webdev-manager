var db = require('../../db/pool');

async function logActivity(input) {
  await db.query(
    `INSERT INTO activity_logs
      (user_id, user_name, user_email, event_type, action, description,
       target_type, target_id, target_name, severity, ip_address, user_agent, metadata)
     VALUES
      (:userId, :userName, :userEmail, :eventType, :action, :description,
       :targetType, :targetId, :targetName, :severity, :ip, :userAgent, :metadata)`,
    {
      userId: input.userId || null,
      userName: input.userName || (input.user && input.user.name) || null,
      userEmail: input.userEmail || (input.user && input.user.email) || null,
      eventType: input.eventType,
      action: input.action || input.eventType,
      description: input.description || null,
      targetType: input.targetType || null,
      targetId: input.targetId || null,
      targetName: input.targetName || null,
      severity: input.severity || 'info',
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      metadata: JSON.stringify(input.metadata || {}),
    }
  );
}

module.exports = {
  logActivity: logActivity,
};
