CREATE DATABASE IF NOT EXISTS `more_see`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `more_see`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_super` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME,
  `updated_at` DATETIME,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `users` (`username`, `password_hash`, `is_super`, `created_at`, `updated_at`)
VALUES (
  'admin',
  '$pbkdf2-sha256$29000$g5Ay5pxzjvH.PwfAOKf03g$liovv6UJAKXVLL4gbVoeFE4xPSs6voDx7ezdqPVR.3U',
  1,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `is_super` = VALUES(`is_super`),
  `updated_at` = VALUES(`updated_at`);
