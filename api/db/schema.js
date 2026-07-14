var db = require('./pool');

async function alterIgnoreDuplicate(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    if (
      err &&
      (err.code === 'ER_DUP_FIELDNAME' ||
        err.code === 'ER_DUP_KEYNAME' ||
        err.code === 'ER_CANT_DROP_FIELD_OR_KEY')
    ) {
      return;
    }
    throw err;
  }
}

async function ensureFinalRoles(tableName) {
  var rows = await db.query("SHOW COLUMNS FROM " + tableName + " LIKE 'role'");
  var expected = "enum('superadmin','developer','spectator')";
  if (rows[0] && String(rows[0].Type).toLowerCase() === expected) return;

  await db.query(
    "ALTER TABLE " + tableName +
      " MODIFY role ENUM('superadmin', 'admin', 'developer', 'viewer', 'spectator') NOT NULL DEFAULT 'spectator'"
  );
  await db.query("UPDATE " + tableName + " SET role = 'developer' WHERE role = 'admin'");
  await db.query("UPDATE " + tableName + " SET role = 'spectator' WHERE role = 'viewer'");
  await db.query(
    "ALTER TABLE " + tableName +
      " MODIFY role ENUM('superadmin', 'developer', 'spectator') NOT NULL DEFAULT 'spectator'"
  );
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(160) NOT NULL,
      role ENUM('superadmin', 'developer', 'spectator') NOT NULL DEFAULT 'spectator',
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureFinalRoles('users');

  await alterIgnoreDuplicate(
    "ALTER TABLE users MODIFY status ENUM('active', 'invited', 'disabled') NOT NULL DEFAULT 'active'"
  );
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NULL AFTER name');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN phone_e164 VARCHAR(40) NULL AFTER last_name');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN phone_country VARCHAR(8) NULL AFTER phone_e164');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN discord_id VARCHAR(120) NULL AFTER phone_country');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN discord_verified_at DATETIME NULL AFTER discord_id');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN date_of_birth DATE NULL AFTER discord_verified_at');
  await alterIgnoreDuplicate("ALTER TABLE users ADD COLUMN gender ENUM('male', 'female') NULL AFTER date_of_birth");
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL AFTER gender');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN invited_at DATETIME NULL AFTER avatar_url');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN invite_accepted_at DATETIME NULL AFTER invited_at');
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL AFTER updated_at');

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id CHAR(36) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      refresh_token_hash CHAR(64) NOT NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      revoke_reason VARCHAR(160) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY user_sessions_user_idx (user_id),
      KEY user_sessions_refresh_idx (refresh_token_hash),
      CONSTRAINT user_sessions_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      requested_ip VARCHAR(64) NULL,
      requested_user_agent VARCHAR(512) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY password_resets_token_unique (token_hash),
      KEY password_resets_user_idx (user_id),
      CONSTRAINT password_resets_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      user_name VARCHAR(190) NULL,
      user_email VARCHAR(255) NULL,
      event_type VARCHAR(80) NOT NULL,
      action VARCHAR(160) NULL,
      description TEXT NULL,
      target_type VARCHAR(80) NULL,
      target_id VARCHAR(80) NULL,
      target_name VARCHAR(190) NULL,
      severity ENUM('info', 'success', 'warning', 'danger') NOT NULL DEFAULT 'info',
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY activity_logs_user_idx (user_id),
      KEY activity_logs_event_idx (event_type),
      CONSTRAINT activity_logs_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN user_name VARCHAR(190) NULL AFTER user_id');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN user_email VARCHAR(255) NULL AFTER user_name');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN action VARCHAR(160) NULL AFTER event_type');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN description TEXT NULL AFTER action');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN target_type VARCHAR(80) NULL AFTER description');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN target_id VARCHAR(80) NULL AFTER target_type');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD COLUMN target_name VARCHAR(190) NULL AFTER target_id');
  await alterIgnoreDuplicate("ALTER TABLE activity_logs ADD COLUMN severity ENUM('info', 'success', 'warning', 'danger') NOT NULL DEFAULT 'info' AFTER target_name");
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD KEY activity_logs_created_idx (created_at)');
  await alterIgnoreDuplicate('ALTER TABLE activity_logs ADD KEY activity_logs_severity_idx (severity)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_invites (
      id CHAR(36) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      email VARCHAR(255) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      role ENUM('superadmin', 'developer', 'spectator') NOT NULL DEFAULT 'spectator',
      invited_by BIGINT UNSIGNED NULL,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY user_invites_token_unique (token_hash),
      KEY user_invites_user_idx (user_id),
      KEY user_invites_email_idx (email),
      CONSTRAINT user_invites_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT user_invites_invited_by_fk FOREIGN KEY (invited_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureFinalRoles('user_invites');

  await db.query(`
    CREATE TABLE IF NOT EXISTS system_bootstrap (
      id TINYINT UNSIGNED NOT NULL,
      superadmin_bootstrapped_at DATETIME NULL,
      superadmin_user_id BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT system_bootstrap_superadmin_fk FOREIGN KEY (superadmin_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    INSERT IGNORE INTO system_bootstrap (id) VALUES (1)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS profile_password_otps (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      otp_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      requested_ip VARCHAR(64) NULL,
      requested_user_agent VARCHAR(512) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY profile_password_otps_user_idx (user_id),
      KEY profile_password_otps_hash_idx (otp_hash),
      CONSTRAINT profile_password_otps_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      client_name VARCHAR(190) NOT NULL,
      type ENUM('One Pager', 'Full Web Dev') NOT NULL DEFAULT 'Full Web Dev',
      assignee_name VARCHAR(160) NOT NULL,
      status ENUM('Live', 'Staging', 'Churned', 'In Progress', 'Site Handed Over') NOT NULL DEFAULT 'In Progress',
      priority ENUM('High', 'Medium', 'Low') NOT NULL DEFAULT 'Medium',
      figma_link VARCHAR(512) NULL,
      domain_management ENUM('Client Domain', 'Cloudflare') NOT NULL DEFAULT 'Cloudflare',
      server_location ENUM('Client', 'Hetzner', 'AWS') NOT NULL DEFAULT 'Hetzner',
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY projects_priority_idx (priority),
      KEY projects_status_idx (status),
      KEY projects_assignee_idx (assignee_name),
      KEY projects_created_by_idx (created_by),
      CONSTRAINT projects_created_by_fk FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT projects_updated_by_fk FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS project_websites (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(190) NOT NULL,
      url VARCHAR(512) NOT NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY project_websites_project_idx (project_id),
      CONSTRAINT project_websites_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      checklist JSON NULL,
      attachments JSON NULL,
      status ENUM('Backlog', 'To Do', 'In Progress', 'Review', 'Blocked', 'Done') NOT NULL DEFAULT 'Backlog',
      priority ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium',
      assignee_user_id BIGINT UNSIGNED NULL,
      assignee_name VARCHAR(160) NOT NULL DEFAULT 'Unassigned',
      start_date DATE NULL,
      due_date DATE NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY tasks_project_idx (project_id),
      KEY tasks_status_idx (status),
      KEY tasks_priority_idx (priority),
      KEY tasks_assignee_user_idx (assignee_user_id),
      KEY tasks_assignee_name_idx (assignee_name),
      KEY tasks_due_date_idx (due_date),
      KEY tasks_deleted_idx (deleted_at),
      CONSTRAINT tasks_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT tasks_assignee_user_fk FOREIGN KEY (assignee_user_id)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT tasks_created_by_fk FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT tasks_updated_by_fk FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      color ENUM('white', 'blue', 'green', 'yellow', 'pink') NOT NULL DEFAULT 'white',
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY notes_user_updated_idx (user_id, updated_at),
      KEY notes_user_deleted_idx (user_id, deleted_at),
      CONSTRAINT notes_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS workspace_settings (
      id TINYINT UNSIGNED NOT NULL,
      workspace_name VARCHAR(190) NOT NULL DEFAULT 'AHM Web Manager',
      support_email VARCHAR(255) NOT NULL DEFAULT 'support@localhost',
      timezone VARCHAR(80) NOT NULL DEFAULT 'Dubai',
      default_sender_name VARCHAR(160) NOT NULL DEFAULT 'AHM Web Team',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    INSERT IGNORE INTO workspace_settings
      (id, workspace_name, support_email, timezone, default_sender_name)
    VALUES
      (1, 'AHM Web Manager', 'support@localhost', 'Dubai', 'AHM Web Team')
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_connectors (
      id TINYINT UNSIGNED NOT NULL,
      provider ENUM('google') NOT NULL DEFAULT 'google',
      status ENUM('disconnected', 'connected') NOT NULL DEFAULT 'disconnected',
      client_id VARCHAR(255) NULL,
      client_secret_encrypted TEXT NULL,
      redirect_uri VARCHAR(512) NULL,
      connected_email VARCHAR(255) NULL,
      access_token_encrypted TEXT NULL,
      refresh_token_encrypted TEXT NULL,
      token_expires_at DATETIME NULL,
      last_test_status ENUM('not_tested', 'ready', 'failed') NOT NULL DEFAULT 'not_tested',
      last_tested_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    INSERT IGNORE INTO email_connectors
      (id, provider, status, redirect_uri)
    VALUES
      (1, 'google', 'disconnected', 'http://localhost:3000/api/auth/google/callback')
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id TINYINT UNSIGNED NOT NULL,
      task_assignments_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'email',
      health_alerts_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'both',
      password_age_alerts_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'discord',
      daily_user_summary_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'email',
      pre_shift_briefing_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'both',
      weekly_digest_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'off',
      in_app_realtime_enabled TINYINT(1) NOT NULL DEFAULT 1,
      daily_summary_time TIME NOT NULL DEFAULT '18:00:00',
      pre_shift_briefing_time TIME NOT NULL DEFAULT '08:30:00',
      manager_notes TEXT NULL,
      discord_webhook_url VARCHAR(512) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    INSERT IGNORE INTO notification_settings (id) VALUES (1)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_prompt_settings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      prompt_key VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      system_prompt TEXT NULL,
      user_prompt_template TEXT NULL,
      model VARCHAR(120) NULL,
      temperature DECIMAL(3,2) NOT NULL DEFAULT 0.20,
      max_tokens INT UNSIGNED NOT NULL DEFAULT 1400,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY ai_prompt_settings_key_unique (prompt_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    INSERT IGNORE INTO ai_prompt_settings
      (prompt_key, name, system_prompt, user_prompt_template, model, temperature, max_tokens, enabled)
    VALUES
      ('task_organizer', 'Task Organizer', '', '', NULL, 0.20, 1400, 1)
  `);

  await db.query(`
    UPDATE ai_prompt_settings
    SET model = 'claude-sonnet-4-6'
    WHERE model IN ('claude-3-5-sonnet-latest', 'claude-3-5-sonnet-20241022')
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id CHAR(36) NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      audience_type ENUM('user', 'role', 'workspace') NOT NULL DEFAULT 'workspace',
      audience_value VARCHAR(120) NULL,
      type VARCHAR(80) NOT NULL,
      title VARCHAR(190) NOT NULL,
      message TEXT NOT NULL,
      action_url VARCHAR(512) NULL,
      metadata JSON NULL,
      read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY notifications_user_idx (user_id),
      KEY notifications_audience_idx (audience_type, audience_value),
      KEY notifications_created_idx (created_at),
      CONSTRAINT notifications_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      notification_id CHAR(36) NOT NULL,
      channel ENUM('in_app', 'email', 'discord') NOT NULL,
      status ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
      error_message TEXT NULL,
      attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY notification_delivery_attempts_notification_idx (notification_id),
      CONSTRAINT notification_delivery_attempts_notification_fk FOREIGN KEY (notification_id)
        REFERENCES notifications(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_activity_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NULL,
      project_name VARCHAR(190) NULL,
      website_id BIGINT UNSIGNED NULL,
      website_name VARCHAR(190) NULL,
      website_url VARCHAR(512) NULL,
      actor_user_id BIGINT UNSIGNED NULL,
      actor_name VARCHAR(190) NULL,
      actor_email VARCHAR(255) NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      action VARCHAR(160) NOT NULL,
      description TEXT NULL,
      severity ENUM('info', 'success', 'warning', 'danger') NOT NULL DEFAULT 'info',
      source ENUM('user', 'system', 'wordpress_connector', 'scanner', 'scheduler', 'api', 'import') NOT NULL DEFAULT 'user',
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY website_activity_project_idx (project_id),
      KEY website_activity_website_idx (website_id),
      KEY website_activity_actor_idx (actor_user_id),
      KEY website_activity_action_idx (action),
      KEY website_activity_created_idx (created_at),
      KEY website_activity_severity_idx (severity),
      CONSTRAINT website_activity_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE SET NULL,
      CONSTRAINT website_activity_website_fk FOREIGN KEY (website_id)
        REFERENCES project_websites(id) ON DELETE SET NULL,
      CONSTRAINT website_activity_actor_fk FOREIGN KEY (actor_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_credentials (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(190) NOT NULL,
      project_id BIGINT UNSIGNED NULL,
      website_id BIGINT UNSIGNED NULL,
      external_site VARCHAR(255) NULL,
      environment ENUM('Live', 'Staging') NOT NULL DEFAULT 'Live',
      username VARCHAR(255) NOT NULL,
      password_encrypted TEXT NOT NULL,
      password_updated_at DATE NOT NULL,
      note TEXT NULL,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY website_credentials_name_idx (name),
      KEY website_credentials_project_idx (project_id),
      KEY website_credentials_website_idx (website_id),
      KEY website_credentials_external_idx (external_site),
      KEY website_credentials_deleted_idx (deleted_at),
      CONSTRAINT website_credentials_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE SET NULL,
      CONSTRAINT website_credentials_website_fk FOREIGN KEY (website_id)
        REFERENCES project_websites(id) ON DELETE SET NULL,
      CONSTRAINT website_credentials_created_by_fk FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT website_credentials_updated_by_fk FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      status ENUM('Open', 'In Progress', 'Fixed') NOT NULL DEFAULT 'Open',
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY issues_status_idx (status),
      KEY issues_deleted_idx (deleted_at),
      KEY issues_created_by_idx (created_by),
      CONSTRAINT issues_created_by_fk FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT issues_updated_by_fk FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS issue_applications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      issue_id BIGINT UNSIGNED NOT NULL,
      project_id BIGINT UNSIGNED NOT NULL,
      target_type ENUM('task', 'checklist') NOT NULL,
      fixed TINYINT(1) NOT NULL DEFAULT 0,
      fixed_at DATETIME NULL,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY issue_applications_unique (issue_id, project_id, target_type),
      KEY issue_applications_issue_idx (issue_id),
      KEY issue_applications_project_idx (project_id),
      KEY issue_applications_target_idx (target_type),
      KEY issue_applications_fixed_idx (fixed),
      CONSTRAINT issue_applications_issue_fk FOREIGN KEY (issue_id)
        REFERENCES issues(id) ON DELETE CASCADE,
      CONSTRAINT issue_applications_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT issue_applications_created_by_fk FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT issue_applications_updated_by_fk FOREIGN KEY (updated_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Issues now behave as task templates: they carry a checklist + priority, and
  // each application links to the real task it created on the board.
  await alterIgnoreDuplicate('ALTER TABLE issues ADD COLUMN checklist JSON NULL AFTER description');
  await alterIgnoreDuplicate("ALTER TABLE issues ADD COLUMN priority ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium' AFTER status");
  await alterIgnoreDuplicate('ALTER TABLE issue_applications ADD COLUMN task_id BIGINT UNSIGNED NULL AFTER project_id');
  await alterIgnoreDuplicate('ALTER TABLE issue_applications ADD KEY issue_applications_task_idx (task_id)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_health_profiles (
      website_id BIGINT UNSIGNED NOT NULL,
      approved_identity JSON NULL,
      essential_plugins JSON NULL,
      form_test_policy JSON NULL,
      max_pages INT UNSIGNED NOT NULL DEFAULT 25,
      figma_comparison_enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (website_id),
      CONSTRAINT website_health_profiles_website_fk FOREIGN KEY (website_id)
        REFERENCES project_websites(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS wordpress_connections (
      website_id BIGINT UNSIGNED NOT NULL,
      connection_id CHAR(36) NOT NULL,
      secret_encrypted TEXT NOT NULL,
      status ENUM('connected', 'warning', 'disconnected', 'revoked') NOT NULL DEFAULT 'connected',
      plugin_version VARCHAR(40) NULL,
      capabilities JSON NULL,
      snapshot JSON NULL,
      last_heartbeat_at DATETIME NULL,
      last_error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (website_id),
      UNIQUE KEY wordpress_connections_id_unique (connection_id),
      CONSTRAINT wordpress_connections_website_fk FOREIGN KEY (website_id)
        REFERENCES project_websites(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS wordpress_pairing_codes (
      id CHAR(36) NOT NULL,
      website_id BIGINT UNSIGNED NOT NULL,
      code_hash CHAR(64) NOT NULL,
      created_by BIGINT UNSIGNED NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY wordpress_pairing_codes_hash_unique (code_hash),
      KEY wordpress_pairing_codes_website_idx (website_id),
      CONSTRAINT wordpress_pairing_codes_website_fk FOREIGN KEY (website_id)
        REFERENCES project_websites(id) ON DELETE CASCADE,
      CONSTRAINT wordpress_pairing_codes_user_fk FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_health_scans (
      id CHAR(36) NOT NULL,
      website_id BIGINT UNSIGNED NOT NULL,
      status ENUM('queued', 'running', 'completed', 'partial', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
      stage VARCHAR(80) NOT NULL DEFAULT 'queued',
      progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
      checklist_versions JSON NULL,
      summary JSON NULL,
      site_result JSON NULL,
      error_message TEXT NULL,
      requested_by BIGINT UNSIGNED NULL,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY website_health_scans_website_idx (website_id),
      KEY website_health_scans_status_idx (status),
      KEY website_health_scans_created_idx (created_at),
      CONSTRAINT website_health_scans_website_fk FOREIGN KEY (website_id)
        REFERENCES project_websites(id) ON DELETE CASCADE,
      CONSTRAINT website_health_scans_user_fk FOREIGN KEY (requested_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_health_scan_pages (
      id CHAR(36) NOT NULL,
      scan_id CHAR(36) NOT NULL,
      page_url VARCHAR(1024) NOT NULL,
      page_name VARCHAR(255) NOT NULL,
      path VARCHAR(512) NOT NULL,
      http_status SMALLINT UNSIGNED NULL,
      lighthouse JSON NULL,
      seo_result JSON NULL,
      design_result JSON NULL,
      forms_result JSON NULL,
      evidence JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY website_health_scan_pages_scan_idx (scan_id),
      CONSTRAINT website_health_scan_pages_scan_fk FOREIGN KEY (scan_id)
        REFERENCES website_health_scans(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_health_findings (
      id CHAR(36) NOT NULL,
      scan_id CHAR(36) NOT NULL,
      page_id CHAR(36) NULL,
      category ENUM('lighthouse', 'technical_seo', 'design', 'content', 'forms', 'wordpress', 'security') NOT NULL,
      check_id VARCHAR(120) NOT NULL,
      severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'warning',
      viewport ENUM('mobile', 'tablet', 'desktop', 'all') NOT NULL DEFAULT 'all',
      title VARCHAR(255) NOT NULL,
      detail TEXT NOT NULL,
      evidence TEXT NULL,
      recommendation TEXT NULL,
      confidence ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
      resolution_status ENUM('open', 'addressed', 'ignored') NOT NULL DEFAULT 'open',
      resolution_note TEXT NULL,
      resolved_by BIGINT UNSIGNED NULL,
      resolved_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY website_health_findings_scan_idx (scan_id),
      KEY website_health_findings_page_idx (page_id),
      KEY website_health_findings_status_idx (resolution_status),
      CONSTRAINT website_health_findings_scan_fk FOREIGN KEY (scan_id)
        REFERENCES website_health_scans(id) ON DELETE CASCADE,
      CONSTRAINT website_health_findings_page_fk FOREIGN KEY (page_id)
        REFERENCES website_health_scan_pages(id) ON DELETE CASCADE,
      CONSTRAINT website_health_findings_user_fk FOREIGN KEY (resolved_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Website-health scans are now configurable: a saved sitemap URL + which
  // checks to run, remembered per website and recorded on each scan.
  await alterIgnoreDuplicate('ALTER TABLE website_health_profiles ADD COLUMN sitemap_url VARCHAR(1024) NULL AFTER max_pages');
  await alterIgnoreDuplicate('ALTER TABLE website_health_profiles ADD COLUMN default_checks JSON NULL AFTER sitemap_url');
  await alterIgnoreDuplicate('ALTER TABLE website_health_profiles ADD COLUMN content_staleness_days INT UNSIGNED NULL AFTER default_checks');
  await alterIgnoreDuplicate('ALTER TABLE website_health_scans ADD COLUMN selected_checks JSON NULL AFTER checklist_versions');
  await alterIgnoreDuplicate('ALTER TABLE website_health_scans ADD COLUMN sitemap_url VARCHAR(1024) NULL AFTER selected_checks');

  await db.query(`
    INSERT IGNORE INTO ai_prompt_settings
      (prompt_key, name, system_prompt, user_prompt_template, model, temperature, max_tokens, enabled)
    VALUES
      ('website_technical_seo', 'Website Technical SEO',
       'You are a rigorous technical SEO QA reviewer. Use only supplied evidence and the checklist. Return no finding without evidence.',
       'Review this page evidence against the checklist and return the required JSON.\n\nCHECKLIST:\n{{checklist}}\n\nEVIDENCE:\n{{evidence}}',
       NULL, 0.10, 3000, 1),
      ('website_design_content_qa', 'Website Design QA (visual)',
       'You are a rigorous website visual QA reviewer. Judge layout distortion, mobile/tablet responsiveness, and design consistency using the supplied screenshots and browser measurements. Do not review content, grammar, or identity. Do not invent defects or contradict the deterministic measurements.',
       'Review this page against the visual checklist and return the required JSON (visual/layout/consistency findings only).\n\nCHECKLIST:\n{{checklist}}\n\nEVIDENCE:\n{{evidence}}',
       NULL, 0.10, 3000, 1),
      ('website_lighthouse_review', 'Website Lighthouse Review',
       'You are a web performance engineer. Use only the supplied Lighthouse metrics and page evidence; recommend concrete fixes. Do not invent metrics.',
       'Interpret these Lighthouse results for the page and return the required JSON findings (category performance). Prioritise the highest-impact fixes.\n\nMETRICS:\n{{metrics}}\n\nEVIDENCE:\n{{evidence}}',
       NULL, 0.10, 3000, 1),
      ('website_placeholder_content', 'Website Placeholder Content',
       'You detect placeholder, dummy, filler, or unfinished website copy (e.g. lorem ipsum, "insert tagline here", half-written sentences, template leftovers). Use only the supplied page text. Flag only text that is clearly not final, production content. Return no finding without quoting the offending text as evidence.',
       'Analyse the visible page text and return the required JSON findings (checkId "seo.placeholder-content") for any placeholder or unfinished content. If the copy looks like finished, real content, return an empty findings array.\n\nEVIDENCE:\n{{evidence}}',
       NULL, 0.10, 2000, 1)
  `);
}

module.exports = {
  ensureSchema: ensureSchema,
};
