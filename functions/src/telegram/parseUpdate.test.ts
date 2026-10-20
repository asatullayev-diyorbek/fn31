import { describe, expect, it } from "vitest";
import {
  displayNameFromTelegramUser,
  extractChatId,
  extractTelegramUser,
  parseStartCommand,
} from "./parseUpdate.js";
import type { TelegramUpdate } from "./parseUpdate.js";

function makeUpdate(text: string): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      chat: { id: 555 },
      text,
      from: { id: 42, username: "diyor", first_name: "Diyor", last_name: "A." },
    },
  };
}

describe("parseStartCommand", () => {
  it("extracts the token from a well-formed /start command", () => {
    expect(parseStartCommand(makeUpdate("/start abc123XYZ"))).toBe("abc123XYZ");
  });

  it("handles the /start@BotName variant Telegram uses in group chats", () => {
    expect(parseStartCommand(makeUpdate("/start@MyPuzzleBot abc123XYZ"))).toBe("abc123XYZ");
  });

  it("returns null for unrelated messages, bare /start, and malformed input", () => {
    expect(parseStartCommand(makeUpdate("hello there"))).toBeNull();
    expect(parseStartCommand(makeUpdate("/start"))).toBeNull();
    expect(parseStartCommand(makeUpdate("/start two tokens"))).toBeNull();
    expect(parseStartCommand({ update_id: 1 })).toBeNull();
  });
});

describe("extractTelegramUser / extractChatId", () => {
  it("pulls the verified Telegram identity straight from Telegram's own update payload", () => {
    const update = makeUpdate("/start tok");
    expect(extractTelegramUser(update)).toEqual({
      id: 42,
      username: "diyor",
      firstName: "Diyor",
      lastName: "A.",
    });
    expect(extractChatId(update)).toBe(555);
  });

  it("returns null when there is no message/from (never fabricates an identity)", () => {
    expect(extractTelegramUser({ update_id: 1 })).toBeNull();
    expect(extractChatId({ update_id: 1 })).toBeNull();
  });
});

describe("displayNameFromTelegramUser", () => {
  it("joins first and last name, falling back to a tg_<id> placeholder", () => {
    expect(displayNameFromTelegramUser({ id: 1, firstName: "Ali", lastName: "Vali" })).toBe("Ali Vali");
    expect(displayNameFromTelegramUser({ id: 7, firstName: "" })).toBe("tg_7");
  });
});
