CREATE TABLE `license_policy` (
  `id` VARCHAR(32) NOT NULL,
  `mode` ENUM('SINGLE_DEVICE', 'MULTI_DEVICE_SINGLE_SESSION') NOT NULL DEFAULT 'SINGLE_DEVICE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `license_policy` (`id`, `mode`, `updated_at`)
VALUES ('default', 'SINGLE_DEVICE', CURRENT_TIMESTAMP(3));

CREATE INDEX `entitlements_device_id_idx` ON `entitlements`(`device_id`);
ALTER TABLE `entitlements` DROP INDEX `entitlements_device_id_key`;
