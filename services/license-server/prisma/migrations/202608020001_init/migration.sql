-- LogicNest WorkHub license-server initial schema (MySQL 8.0+)
CREATE TABLE `users` (
  `id` CHAR(36) NOT NULL,
  `uid` VARCHAR(24) NOT NULL,
  `phone_normalized` VARCHAR(20) NOT NULL,
  `phone_last4` CHAR(4) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `token_version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `last_login_at` DATETIME(3) NULL,
  `password_reset_at` DATETIME(3) NULL,
  UNIQUE INDEX `users_uid_key`(`uid`),
  UNIQUE INDEX `users_phone_normalized_key`(`phone_normalized`),
  INDEX `users_status_created_at_idx`(`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `devices` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `fingerprint_digest` CHAR(64) NOT NULL,
  `fingerprint_hint` VARCHAR(16) NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'UNBOUND') NOT NULL DEFAULT 'ACTIVE',
  `token_version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `bound_at` DATETIME(3) NULL,
  `unbound_at` DATETIME(3) NULL,
  `last_seen_at` DATETIME(3) NULL,
  `client_version` VARCHAR(64) NULL,
  `last_ip_hash` CHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `devices_fingerprint_digest_key`(`fingerprint_digest`),
  INDEX `devices_user_id_status_idx`(`user_id`, `status`),
  INDEX `devices_last_seen_at_idx`(`last_seen_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plans` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `duration_days` INTEGER UNSIGNED NOT NULL,
  `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `plans_code_key`(`code`),
  INDEX `plans_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admins` (
  `id` CHAR(36) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('SUPER_ADMIN', 'OPERATOR', 'AUDITOR') NOT NULL DEFAULT 'OPERATOR',
  `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `must_change_password` BOOLEAN NOT NULL DEFAULT true,
  `login_failures` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME(3) NULL,
  `session_version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `last_login_at` DATETIME(3) NULL,
  UNIQUE INDEX `admins_username_key`(`username`),
  INDEX `admins_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `license_batches` (
  `id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `created_by_admin_id` CHAR(36) NOT NULL,
  `count` INTEGER UNSIGNED NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `license_batches_plan_id_created_at_idx`(`plan_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `entitlements` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `device_id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `status` ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `starts_at` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `revoked_at` DATETIME(3) NULL,
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `entitlements_user_id_key`(`user_id`),
  UNIQUE INDEX `entitlements_device_id_key`(`device_id`),
  INDEX `entitlements_status_expires_at_idx`(`status`, `expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `license_keys` (
  `id` CHAR(36) NOT NULL,
  `batch_id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `digest` CHAR(64) NOT NULL,
  `last_four` CHAR(4) NOT NULL,
  `status` ENUM('UNUSED', 'REDEEMED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'UNUSED',
  `expires_at` DATETIME(3) NULL,
  `redeemed_at` DATETIME(3) NULL,
  `redeemed_by_user_id` CHAR(36) NULL,
  `redeemed_by_device_id` CHAR(36) NULL,
  `entitlement_id` CHAR(36) NULL,
  `revoked_at` DATETIME(3) NULL,
  `revoke_reason` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `license_keys_digest_key`(`digest`),
  INDEX `license_keys_status_created_at_idx`(`status`, `created_at`),
  INDEX `license_keys_batch_id_idx`(`batch_id`),
  INDEX `license_keys_plan_id_status_idx`(`plan_id`, `status`),
  INDEX `license_keys_redeemed_by_user_id_idx`(`redeemed_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `refresh_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `device_id` CHAR(36) NULL,
  `token_digest` CHAR(64) NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `replaced_by` CHAR(64) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_used_at` DATETIME(3) NULL,
  `created_ip_hash` CHAR(64) NULL,
  UNIQUE INDEX `refresh_tokens_token_digest_key`(`token_digest`),
  INDEX `refresh_tokens_user_id_family_id_idx`(`user_id`, `family_id`),
  INDEX `refresh_tokens_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_sessions` (
  `id` CHAR(36) NOT NULL,
  `admin_id` CHAR(36) NOT NULL,
  `session_digest` CHAR(64) NOT NULL,
  `csrf_digest` CHAR(64) NOT NULL,
  `session_version` INTEGER UNSIGNED NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NULL,
  `created_ip_hash` CHAR(64) NULL,
  UNIQUE INDEX `admin_sessions_session_digest_key`(`session_digest`),
  INDEX `admin_sessions_admin_id_expires_at_idx`(`admin_id`, `expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_type` ENUM('USER', 'ADMIN', 'SYSTEM') NOT NULL,
  `actor_id` CHAR(36) NULL,
  `action` VARCHAR(80) NOT NULL,
  `target_type` VARCHAR(64) NOT NULL,
  `target_id` VARCHAR(64) NULL,
  `result` VARCHAR(32) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `ip_hash` CHAR(64) NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `audit_logs_created_at_idx`(`created_at`),
  INDEX `audit_logs_actor_type_actor_id_created_at_idx`(`actor_type`, `actor_id`, `created_at`),
  INDEX `audit_logs_target_type_target_id_created_at_idx`(`target_type`, `target_id`, `created_at`),
  INDEX `audit_logs_action_created_at_idx`(`action`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `devices` ADD CONSTRAINT `devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `license_batches` ADD CONSTRAINT `license_batches_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `license_batches` ADD CONSTRAINT `license_batches_created_by_admin_id_fkey` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `entitlements` ADD CONSTRAINT `entitlements_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `license_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_redeemed_by_user_id_fkey` FOREIGN KEY (`redeemed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_redeemed_by_device_id_fkey` FOREIGN KEY (`redeemed_by_device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `license_keys` ADD CONSTRAINT `license_keys_entitlement_id_fkey` FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
