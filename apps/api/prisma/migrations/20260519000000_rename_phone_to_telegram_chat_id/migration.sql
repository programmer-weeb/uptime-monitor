-- Rename phone column to telegram_chat_id on users table
ALTER TABLE "users" RENAME COLUMN "phone" TO "telegram_chat_id";
