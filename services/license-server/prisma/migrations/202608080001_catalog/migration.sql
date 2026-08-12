CREATE TABLE `catalog_items` (
  `id` CHAR(36) NOT NULL,
  `kind` ENUM('SKILL', 'KIT', 'CONNECTOR') NOT NULL,
  `slug` VARCHAR(96) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `catalog_items_kind_slug_key`(`kind`, `slug`),
  INDEX `catalog_items_kind_sort_order_idx`(`kind`, `sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `catalog_releases` (
  `id` CHAR(36) NOT NULL,
  `item_id` CHAR(36) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `name_zh` VARCHAR(120) NOT NULL,
  `name_en` VARCHAR(120) NULL,
  `description_zh` TEXT NOT NULL,
  `description_en` TEXT NULL,
  `tags` JSON NULL,
  `metadata` JSON NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `published_at` DATETIME(3) NULL,
  `created_by_admin_id` CHAR(36) NOT NULL,
  `updated_by_admin_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `catalog_releases_item_id_version_key`(`item_id`, `version`),
  INDEX `catalog_releases_status_published_at_idx`(`status`, `published_at`),
  INDEX `catalog_releases_item_id_status_idx`(`item_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `catalog_assets` (
  `id` CHAR(36) NOT NULL,
  `release_id` CHAR(36) NOT NULL,
  `role` VARCHAR(48) NOT NULL,
  `storage_key` VARCHAR(160) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `catalog_assets_storage_key_key`(`storage_key`),
  UNIQUE INDEX `catalog_assets_release_id_role_key`(`release_id`, `role`),
  INDEX `catalog_assets_release_id_idx`(`release_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `catalog_releases` ADD CONSTRAINT `catalog_releases_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `catalog_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `catalog_releases` ADD CONSTRAINT `catalog_releases_created_by_admin_id_fkey` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `catalog_releases` ADD CONSTRAINT `catalog_releases_updated_by_admin_id_fkey` FOREIGN KEY (`updated_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `catalog_assets` ADD CONSTRAINT `catalog_assets_release_id_fkey` FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
