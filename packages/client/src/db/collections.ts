import { messageSchema } from "@aside/shared";

/**
 * Collection definitions built from the shared schema. Keeping this separate
 * from database creation makes the contract surface obvious: every collection
 * here is mirrored by a table the server knows how to sync.
 */
export const collections = {
  messages: { schema: messageSchema },
};
