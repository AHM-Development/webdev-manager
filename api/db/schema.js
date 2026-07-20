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
  var expected = "enum('superadmin','developer','staff')";
  if (rows[0] && String(rows[0].Type).toLowerCase() === expected) return;

  // Expand to a superset of every legacy + current value so no row is truncated,
  // migrate the retired values, then collapse to the canonical role set.
  // Retired: admin, web_dev_manager, designer, client_success_manager, viewer,
  // spectator. Staff is now the base role (spectator folds into it).
  await db.query(
    "ALTER TABLE " + tableName +
      " MODIFY role ENUM('superadmin', 'admin', 'web_dev_manager', 'developer', 'designer', 'client_success_manager', 'staff', 'viewer', 'spectator') NOT NULL DEFAULT 'staff'"
  );
  await db.query("UPDATE " + tableName + " SET role = 'superadmin' WHERE role IN ('admin', 'web_dev_manager')");
  await db.query("UPDATE " + tableName + " SET role = 'staff' WHERE role IN ('viewer', 'designer', 'client_success_manager', 'spectator')");
  await db.query(
    "ALTER TABLE " + tableName +
      " MODIFY role ENUM('superadmin', 'developer', 'staff') NOT NULL DEFAULT 'staff'"
  );
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(160) NOT NULL,
      role ENUM('superadmin', 'developer', 'staff') NOT NULL DEFAULT 'staff',
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Staff job title (client_success_manager | designer | seo | operations) —
  // a per-user designation, not a permission role. Added before the role
  // migration so a retiring designer/CSM keeps their designation as a title.
  await alterIgnoreDuplicate('ALTER TABLE users ADD COLUMN title VARCHAR(40) NULL AFTER role');
  await db.query("UPDATE users SET title = 'designer' WHERE role = 'designer' AND (title IS NULL OR title = '')");
  await db.query("UPDATE users SET title = 'client_success_manager' WHERE role = 'client_success_manager' AND (title IS NULL OR title = '')");

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
      role ENUM('superadmin', 'developer', 'staff') NOT NULL DEFAULT 'staff',
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
  await alterIgnoreDuplicate('ALTER TABLE user_invites ADD COLUMN title VARCHAR(40) NULL AFTER role');

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
      status ENUM('Backlog', 'In Progress', 'Review', 'Blocked', 'Done') NOT NULL DEFAULT 'Backlog',
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
      reviews_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'both',
      client_logs_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'both',
      issues_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'email',
      security_channel ENUM('off', 'email', 'discord', 'both') NOT NULL DEFAULT 'both',
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

  // Tracks the last run of each scheduled digest job (daily summary, pre-shift,
  // weekly digest) so the scheduler fires each at most once per day/week even
  // across API restarts. last_run_date is a CHAR(10) 'YYYY-MM-DD' in the
  // configured timezone to keep due-comparisons free of DB-timezone drift.
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_job_runs (
      kind VARCHAR(40) NOT NULL,
      last_run_at DATETIME NULL,
      last_run_date CHAR(10) NULL,
      last_summary JSON NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (kind)
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

  // ===================== Client Logs (per-client / project stages) =====================

  // Client Logs were re-scoped from website to project (client). If ANY of the
  // Client Logs tables still carry a legacy `website_id` column (a new feature
  // with no production data, possibly partially migrated), drop and recreate them
  // all keyed by project_id. Stage templates are client-agnostic and preserved.
  var legacyCheckTables = ['client_log_stages', 'client_log_stage_history', 'website_checks', 'meetings', 'launch_readiness'];
  var clientLogsLegacy = false;
  for (var lc = 0; lc < legacyCheckTables.length; lc += 1) {
    var legacyCols = await db.query("SHOW COLUMNS FROM " + legacyCheckTables[lc] + " LIKE 'website_id'").catch(function() { return []; });
    if (legacyCols && legacyCols[0]) { clientLogsLegacy = true; break; }
  }
  if (clientLogsLegacy) {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    var legacyDrop = [
      'meeting_actions', 'meetings', 'website_check_items', 'website_checks', 'launch_readiness',
      'client_log_stage_history', 'client_log_stage_evidence', 'client_log_stage_approvals',
      'client_log_stage_participants', 'client_log_stage_dependencies', 'client_log_stages',
    ];
    for (var d = 0; d < legacyDrop.length; d += 1) {
      await db.query('DROP TABLE IF EXISTS ' + legacyDrop[d]);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_templates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(190) NOT NULL,
      description TEXT NULL,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY client_log_templates_default_idx (is_default),
      KEY client_log_templates_deleted_idx (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_template_stages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      template_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(190) NOT NULL,
      description TEXT NULL,
      position INT UNSIGNED NOT NULL DEFAULT 0,
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      is_milestone TINYINT(1) NOT NULL DEFAULT 0,
      is_launch_blocker TINYINT(1) NOT NULL DEFAULT 0,
      default_owner_role VARCHAR(64) NULL,
      estimated_duration_days INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY client_log_template_stages_template_idx (template_id),
      CONSTRAINT client_log_template_stages_template_fk FOREIGN KEY (template_id)
        REFERENCES client_log_templates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_stages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      template_id BIGINT UNSIGNED NULL,
      name VARCHAR(190) NOT NULL,
      description TEXT NULL,
      position INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('not_started','in_progress','awaiting_review','blocked','completed','verified','on_hold') NOT NULL DEFAULT 'not_started',
      progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
      planned_start DATE NULL,
      planned_end DATE NULL,
      actual_start DATE NULL,
      actual_end DATE NULL,
      estimated_duration_days INT UNSIGNED NULL,
      owner_user_id BIGINT UNSIGNED NULL,
      reviewer_user_id BIGINT UNSIGNED NULL,
      priority ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
      risk_level ENUM('Low','Medium','High') NOT NULL DEFAULT 'Low',
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      is_milestone TINYINT(1) NOT NULL DEFAULT 0,
      is_launch_blocker TINYINT(1) NOT NULL DEFAULT 0,
      is_on_hold TINYINT(1) NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY client_log_stages_project_idx (project_id),
      KEY client_log_stages_status_idx (status),
      KEY client_log_stages_owner_idx (owner_user_id),
      KEY client_log_stages_reviewer_idx (reviewer_user_id),
      KEY client_log_stages_planned_end_idx (planned_end),
      KEY client_log_stages_deleted_idx (deleted_at),
      CONSTRAINT client_log_stages_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT client_log_stages_owner_fk FOREIGN KEY (owner_user_id)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT client_log_stages_reviewer_fk FOREIGN KEY (reviewer_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_stage_dependencies (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      stage_id BIGINT UNSIGNED NOT NULL,
      depends_on_stage_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY client_log_stage_dep_unique (stage_id, depends_on_stage_id),
      KEY client_log_stage_dep_depends_idx (depends_on_stage_id),
      CONSTRAINT client_log_stage_dep_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE CASCADE,
      CONSTRAINT client_log_stage_dep_target_fk FOREIGN KEY (depends_on_stage_id)
        REFERENCES client_log_stages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_stage_participants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      stage_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY client_log_stage_participant_unique (stage_id, user_id),
      KEY client_log_stage_participant_user_idx (user_id),
      CONSTRAINT client_log_stage_participant_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE CASCADE,
      CONSTRAINT client_log_stage_participant_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_stage_approvals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      stage_id BIGINT UNSIGNED NOT NULL,
      type ENUM('reviewer','internal','client') NOT NULL DEFAULT 'reviewer',
      decision ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      approved_by BIGINT UNSIGNED NULL,
      approved_by_name VARCHAR(190) NULL,
      note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY client_log_stage_approval_stage_idx (stage_id),
      CONSTRAINT client_log_stage_approval_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE CASCADE,
      CONSTRAINT client_log_stage_approval_user_fk FOREIGN KEY (approved_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_stage_evidence (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      stage_id BIGINT UNSIGNED NOT NULL,
      task_id BIGINT UNSIGNED NULL,
      type ENUM('link','file','image','note') NOT NULL DEFAULT 'link',
      url VARCHAR(1024) NULL,
      description TEXT NULL,
      uploaded_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY client_log_stage_evidence_stage_idx (stage_id),
      CONSTRAINT client_log_stage_evidence_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE CASCADE,
      CONSTRAINT client_log_stage_evidence_user_fk FOREIGN KEY (uploaded_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS client_log_stage_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      stage_id BIGINT UNSIGNED NOT NULL,
      project_id BIGINT UNSIGNED NULL,
      user_id BIGINT UNSIGNED NULL,
      user_name VARCHAR(190) NULL,
      action VARCHAR(96) NOT NULL,
      field VARCHAR(96) NULL,
      old_value TEXT NULL,
      new_value TEXT NULL,
      reason TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY client_log_stage_history_stage_idx (stage_id),
      KEY client_log_stage_history_created_idx (created_at),
      CONSTRAINT client_log_stage_history_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_checks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      stage_id BIGINT UNSIGNED NULL,
      name VARCHAR(190) NOT NULL,
      status ENUM('in_progress','passed','failed','completed') NOT NULL DEFAULT 'in_progress',
      performed_by BIGINT UNSIGNED NULL,
      performed_by_name VARCHAR(190) NULL,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY website_checks_project_idx (project_id),
      KEY website_checks_stage_idx (stage_id),
      KEY website_checks_deleted_idx (deleted_at),
      CONSTRAINT website_checks_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT website_checks_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS website_check_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      check_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(96) NOT NULL,
      name VARCHAR(255) NOT NULL,
      result ENUM('pending','pass','fail','na') NOT NULL DEFAULT 'pending',
      comment TEXT NULL,
      checked_by BIGINT UNSIGNED NULL,
      checked_at DATETIME NULL,
      evidence_url VARCHAR(1024) NULL,
      related_url VARCHAR(1024) NULL,
      created_task_id BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY website_check_items_check_idx (check_id),
      KEY website_check_items_result_idx (result),
      CONSTRAINT website_check_items_check_fk FOREIGN KEY (check_id)
        REFERENCES website_checks(id) ON DELETE CASCADE,
      CONSTRAINT website_check_items_task_fk FOREIGN KEY (created_task_id)
        REFERENCES tasks(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      stage_id BIGINT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      meeting_date DATE NULL,
      participants JSON NULL,
      fathom_url VARCHAR(1024) NULL,
      recording_url VARCHAR(1024) NULL,
      transcript_url VARCHAR(1024) NULL,
      summary TEXT NULL,
      status ENUM('pending','confirmed') NOT NULL DEFAULT 'pending',
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY meetings_project_idx (project_id),
      KEY meetings_stage_idx (stage_id),
      KEY meetings_deleted_idx (deleted_at),
      CONSTRAINT meetings_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT meetings_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS meeting_actions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      meeting_id BIGINT UNSIGNED NOT NULL,
      stage_id BIGINT UNSIGNED NULL,
      task_id BIGINT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      priority ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
      risk TEXT NULL,
      affected_areas JSON NULL,
      acceptance_criteria JSON NULL,
      suggested_owner_id BIGINT UNSIGNED NULL,
      suggested_reviewer_id BIGINT UNSIGNED NULL,
      due_date DATE NULL,
      source_timestamp VARCHAR(32) NULL,
      confirmation_status ENUM('awaiting_confirmation','confirmed','rejected') NOT NULL DEFAULT 'awaiting_confirmation',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY meeting_actions_meeting_idx (meeting_id),
      KEY meeting_actions_confirmation_idx (confirmation_status),
      KEY meeting_actions_stage_idx (stage_id),
      CONSTRAINT meeting_actions_meeting_fk FOREIGN KEY (meeting_id)
        REFERENCES meetings(id) ON DELETE CASCADE,
      CONSTRAINT meeting_actions_stage_fk FOREIGN KEY (stage_id)
        REFERENCES client_log_stages(id) ON DELETE SET NULL,
      CONSTRAINT meeting_actions_task_fk FOREIGN KEY (task_id)
        REFERENCES tasks(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS launch_readiness (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('not_ready','at_risk','almost_ready','ready','live','post_launch_review') NOT NULL DEFAULT 'not_ready',
      blockers JSON NULL,
      calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY launch_readiness_project_unique (project_id),
      CONSTRAINT launch_readiness_project_fk FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Link tasks to Client Log stages/websites (additive; no FK constraints so the
  // migration stays idempotent — integrity is enforced in the service layer).
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN website_id BIGINT UNSIGNED NULL AFTER project_id');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN stage_id BIGINT UNSIGNED NULL AFTER website_id');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN reviewer_user_id BIGINT UNSIGNED NULL AFTER assignee_user_id');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN acceptance_criteria JSON NULL');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN affected_urls JSON NULL');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN is_critical TINYINT(1) NOT NULL DEFAULT 0');
  await alterIgnoreDuplicate("ALTER TABLE tasks ADD COLUMN verification_status ENUM('unverified','awaiting_review','changes_required','verified','client_confirmed') NOT NULL DEFAULT 'unverified'");
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN origin_meeting_action_id BIGINT UNSIGNED NULL');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD KEY tasks_stage_idx (stage_id)');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD KEY tasks_website_idx (website_id)');

  // Task-request approval flow: Staff-created tasks start as 'pending' requests
  // (requested_by set) and only join the board/summary once a Super Admin or
  // Developer approves. Tasks created directly by SA/Dev default to 'approved'.
  await alterIgnoreDuplicate("ALTER TABLE tasks ADD COLUMN request_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER status");
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN requested_by BIGINT UNSIGNED NULL AFTER created_by');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN reviewed_by BIGINT UNSIGNED NULL AFTER requested_by');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD KEY tasks_request_status_idx (request_status)');
  await alterIgnoreDuplicate('ALTER TABLE tasks ADD KEY tasks_requested_by_idx (requested_by)');

  // Additional notification categories (existing DBs).
  await alterIgnoreDuplicate("ALTER TABLE notification_settings ADD COLUMN reviews_channel ENUM('off','email','discord','both') NOT NULL DEFAULT 'both'");
  await alterIgnoreDuplicate("ALTER TABLE notification_settings ADD COLUMN client_logs_channel ENUM('off','email','discord','both') NOT NULL DEFAULT 'both'");
  await alterIgnoreDuplicate("ALTER TABLE notification_settings ADD COLUMN issues_channel ENUM('off','email','discord','both') NOT NULL DEFAULT 'email'");
  await alterIgnoreDuplicate("ALTER TABLE notification_settings ADD COLUMN security_channel ENUM('off','email','discord','both') NOT NULL DEFAULT 'both'");

  // Retire the legacy 'To Do' task status: fold existing rows into 'Backlog',
  // then drop it from the enum. Order matters — migrate rows before MODIFY.
  await db.query("UPDATE tasks SET status = 'Backlog' WHERE status = 'To Do'").catch(function() {});
  await db.query("ALTER TABLE tasks MODIFY status ENUM('Backlog', 'In Progress', 'Review', 'Blocked', 'Done') NOT NULL DEFAULT 'Backlog'").catch(function() {});

  // Seed the default 17-stage template once.
  var existingTemplate = await db.query('SELECT id FROM client_log_templates WHERE is_default = 1 LIMIT 1');
  if (!existingTemplate[0]) {
    var seededTemplate = await db.query(
      'INSERT INTO client_log_templates (name, description, is_default) VALUES (:name, :description, 1)',
      { name: 'Standard Website Project', description: 'Default 17-stage website delivery timeline.' }
    );
    var seedTemplateId = seededTemplate.insertId;
    var defaultStages = [
      { name: 'Client Onboarding', owner: 'client_success_manager', required: 1 },
      { name: 'Web Design', owner: 'designer', required: 1 },
      { name: 'Web Design Handover', owner: 'designer', required: 1 },
      { name: 'Development Started', owner: 'developer', required: 1 },
      { name: 'Content Collection', owner: 'client_success_manager', required: 1 },
      { name: 'Content Upload', owner: 'developer', required: 1 },
      { name: 'Internal Website Review', owner: 'web_dev_manager', required: 1 },
      { name: 'Corrections', owner: 'developer', required: 0 },
      { name: 'Client Demo Meeting', owner: 'client_success_manager', required: 1, milestone: 1 },
      { name: 'Client Changes', owner: 'web_dev_manager', required: 0 },
      { name: 'Final Internal Review', owner: 'web_dev_manager', required: 1 },
      { name: 'Client Approval', owner: 'client_success_manager', required: 1, milestone: 1, blocker: 1 },
      { name: 'Pre-Launch Checks', owner: 'web_dev_manager', required: 1, blocker: 1 },
      { name: 'Ready for Launch', owner: 'web_dev_manager', required: 1, milestone: 1, blocker: 1 },
      { name: 'Website Live', owner: 'web_dev_manager', required: 1, milestone: 1 },
      { name: 'Post-Launch Review', owner: 'developer', required: 1 },
      { name: 'Maintenance', owner: null, required: 0 },
    ];
    for (var stageIndex = 0; stageIndex < defaultStages.length; stageIndex += 1) {
      var seedStage = defaultStages[stageIndex];
      await db.query(
        `INSERT INTO client_log_template_stages
           (template_id, name, position, is_required, is_milestone, is_launch_blocker, default_owner_role)
         VALUES (:templateId, :name, :position, :required, :milestone, :blocker, :owner)`,
        {
          templateId: seedTemplateId,
          name: seedStage.name,
          position: stageIndex,
          required: seedStage.required ? 1 : 0,
          milestone: seedStage.milestone ? 1 : 0,
          blocker: seedStage.blocker ? 1 : 0,
          owner: seedStage.owner || null,
        }
      );
    }
  }

  // ---- Viktor AI agent: OAuth delegation grants + propose/confirm proposals ----
  await db.query(
    `CREATE TABLE IF NOT EXISTS agent_grants (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      agent VARCHAR(40) NOT NULL DEFAULT 'viktor',
      scope VARCHAR(255) NOT NULL DEFAULT 'agent:read agent:write',
      refresh_token_hash CHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME NULL,
      revoked_at DATETIME NULL,
      CONSTRAINT fk_agent_grants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      KEY agent_grants_user_idx (user_id),
      KEY agent_grants_refresh_idx (refresh_token_hash),
      KEY agent_grants_revoked_idx (revoked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS agent_proposals (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      grant_id CHAR(36) NULL,
      agent VARCHAR(40) NOT NULL DEFAULT 'viktor',
      action_key VARCHAR(80) NOT NULL,
      args JSON NULL,
      summary VARCHAR(500) NULL,
      status ENUM('pending', 'executed', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
      proposal_hash CHAR(64) NOT NULL,
      result JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      executed_at DATETIME NULL,
      CONSTRAINT fk_agent_proposals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      KEY agent_proposals_user_idx (user_id),
      KEY agent_proposals_status_idx (status),
      KEY agent_proposals_expires_idx (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  // Client-credentials agent API keys (no user redirect). Each key acts AS a
  // designated service-account user, so the role ceiling + allowlist + propose→
  // confirm still apply. Only the sha256 hash is stored; keys are revocable.
  await db.query(
    `CREATE TABLE IF NOT EXISTS agent_api_keys (
      id CHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      key_hash CHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      scope VARCHAR(120) NOT NULL DEFAULT 'agent:read agent:write',
      created_by BIGINT UNSIGNED NULL,
      last_used_at DATETIME NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY agent_api_keys_hash_uk (key_hash),
      KEY agent_api_keys_user_idx (user_id),
      CONSTRAINT fk_agent_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_agent_api_keys_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  // Let the activity feed attribute actions to the AI agent.
  await db
    .query(
      "ALTER TABLE website_activity_logs MODIFY source ENUM('user', 'system', 'wordpress_connector', 'scanner', 'scheduler', 'api', 'import', 'ai_agent') NOT NULL DEFAULT 'user'"
    )
    .catch(function() {});

  // Manual, evidence-backed forms test verification (durable per website+form).
  await db.query(
    `CREATE TABLE IF NOT EXISTS website_form_verifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      website_id BIGINT UNSIGNED NOT NULL,
      form_key VARCHAR(191) NOT NULL,
      status ENUM('passed', 'failed') NOT NULL,
      note TEXT NULL,
      screenshots JSON NULL,
      form_signature VARCHAR(64) NULL,
      tested_by BIGINT UNSIGNED NULL,
      tested_by_name VARCHAR(190) NULL,
      tested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_form_verifications_website FOREIGN KEY (website_id) REFERENCES project_websites(id) ON DELETE CASCADE,
      CONSTRAINT fk_form_verifications_user FOREIGN KEY (tested_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE KEY form_verifications_website_form_uk (website_id, form_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  // Manual per-page Design QA sign-off (approved / changes requested), durable
  // on the website so it survives re-scans. Mirrors website_form_verifications.
  await db.query(
    `CREATE TABLE IF NOT EXISTS website_design_verifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      website_id BIGINT UNSIGNED NOT NULL,
      page_key VARCHAR(191) NOT NULL,
      status ENUM('approved', 'rejected') NOT NULL,
      note TEXT NULL,
      screenshots JSON NULL,
      design_signature VARCHAR(64) NULL,
      tested_by BIGINT UNSIGNED NULL,
      tested_by_name VARCHAR(190) NULL,
      tested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_design_verifications_website FOREIGN KEY (website_id) REFERENCES project_websites(id) ON DELETE CASCADE,
      CONSTRAINT fk_design_verifications_user FOREIGN KEY (tested_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE KEY design_verifications_website_page_uk (website_id, page_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

module.exports = {
  ensureSchema: ensureSchema,
};
