import {
  attachmentConflictHandler,
  attachmentMigrationStrategies,
  attachmentSchema,
  channelConflictHandler,
  channelMigrationStrategies,
  channelSchema,
  embedConflictHandler,
  embedMigrationStrategies,
  embedSchema,
  messageConflictHandler,
  messageMigrationStrategies,
  messageSchema,
} from "@aside/shared";

/**
 * Collection definitions built from the shared schema. Keeping this separate
 * from database creation makes the contract surface obvious: every collection
 * here is mirrored by a table the server knows how to sync.
 */
export const collections = {
  messages: {
    schema: messageSchema,
    migrationStrategies: messageMigrationStrategies,
    conflictHandler: messageConflictHandler,
  },
  channels: {
    schema: channelSchema,
    migrationStrategies: channelMigrationStrategies,
    conflictHandler: channelConflictHandler,
  },
  embeds: {
    schema: embedSchema,
    migrationStrategies: embedMigrationStrategies,
    conflictHandler: embedConflictHandler,
  },
  attachments: {
    schema: attachmentSchema,
    migrationStrategies: attachmentMigrationStrategies,
    conflictHandler: attachmentConflictHandler,
  },
};
