export interface TelegramUser {
  id: number;
  username?: string;
  firstName: string;
  lastName?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: {
      id: number;
      username?: string;
      first_name: string;
      last_name?: string;
    };
  };
}

/** Extracts the token from a `/start <token>` command, or null if this update isn't that command. */
export function parseStartCommand(update: TelegramUpdate): string | null {
  const text = update.message?.text?.trim();
  if (!text) return null;
  const match = /^\/start(?:@\w+)?\s+(\S+)$/.exec(text);
  return match?.[1] ?? null;
}

export function extractTelegramUser(update: TelegramUpdate): TelegramUser | null {
  const from = update.message?.from;
  if (!from) return null;
  return {
    id: from.id,
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
  };
}

export function extractChatId(update: TelegramUpdate): number | null {
  return update.message?.chat.id ?? null;
}

export function displayNameFromTelegramUser(user: TelegramUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || `tg_${user.id}`;
}
