CREATE TABLE `desktop_releases` (
  `id` CHAR(36) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `platform` VARCHAR(32) NOT NULL,
  `arch` VARCHAR(32) NOT NULL,
  `change_log_zh` JSON NOT NULL,
  `change_log_en` JSON NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `published_at` DATETIME(3) NULL,
  `withdrawn_at` DATETIME(3) NULL,
  `created_by_admin_id` CHAR(36) NOT NULL,
  `updated_by_admin_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `desktop_releases_version_platform_arch_key`(`version`, `platform`, `arch`),
  INDEX `desktop_releases_platform_arch_status_published_at_idx`(`platform`, `arch`, `status`, `published_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `desktop_release_assets` (
  `id` CHAR(36) NOT NULL,
  `release_id` CHAR(36) NOT NULL,
  `storage_key` VARCHAR(160) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `desktop_release_assets_release_id_key`(`release_id`),
  UNIQUE INDEX `desktop_release_assets_storage_key_key`(`storage_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `desktop_releases` ADD CONSTRAINT `desktop_releases_created_by_admin_id_fkey` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `desktop_releases` ADD CONSTRAINT `desktop_releases_updated_by_admin_id_fkey` FOREIGN KEY (`updated_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `desktop_release_assets` ADD CONSTRAINT `desktop_release_assets_release_id_fkey` FOREIGN KEY (`release_id`) REFERENCES `desktop_releases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
