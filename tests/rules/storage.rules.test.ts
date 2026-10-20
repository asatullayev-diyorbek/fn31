import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

/** Runs against the real Storage emulator: `firebase emulators:exec --only storage "npm run test:rules"`. */
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-puzzletogether-rules-test",
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function pngBytes(sizeBytes: number): Uint8Array {
  return new Uint8Array(sizeBytes);
}

/** `UploadTask` is thenable but not a strict `Promise` (missing `.finally`); this gives assertSucceeds/assertFails a real Promise to await, without depending on the compat SDK's Reference/UploadTask types directly. */
function uploadAsync(task: {
  then: (onFulfilled: (value: unknown) => void, onRejected: (reason: unknown) => void) => unknown;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    task.then(resolve, reject);
  });
}

describe("Storage: /images/{uid}/{imageId}", () => {
  it("lets a user upload a small PNG/JPEG/WebP to their own path", async () => {
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertSucceeds(
      uploadAsync(alice.ref("images/alice/photo1.png").put(pngBytes(1024), { contentType: "image/png" })),
    );
  });

  it("rejects an oversized upload", async () => {
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertFails(
      uploadAsync(
        alice.ref("images/alice/huge.png").put(pngBytes(16 * 1024 * 1024), { contentType: "image/png" }),
      ),
    );
  });

  it("rejects a disallowed content type regardless of file extension", async () => {
    const alice = testEnv.authenticatedContext("alice").storage();
    await assertFails(
      // .png extension, but the real content-type is not an image
      uploadAsync(
        alice.ref("images/alice/script.png").put(pngBytes(1024), { contentType: "application/javascript" }),
      ),
    );
  });

  it("never lets a user upload or delete under another user's path", async () => {
    const mallory = testEnv.authenticatedContext("mallory").storage();
    await assertFails(
      uploadAsync(
        mallory.ref("images/alice/overwrite.png").put(pngBytes(1024), { contentType: "image/png" }),
      ),
    );
  });

  it("denies all writes from an unauthenticated client", async () => {
    const anon = testEnv.unauthenticatedContext().storage();
    await assertFails(
      uploadAsync(anon.ref("images/alice/anon.png").put(pngBytes(1024), { contentType: "image/png" })),
    );
  });

  it("lets any signed-in user read an uploaded image (privacy boundary is the room invite, not the file)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadAsync(
        ctx.storage().ref("images/alice/shared.png").put(pngBytes(1024), { contentType: "image/png" }),
      );
    });
    const bob = testEnv.authenticatedContext("bob").storage();
    await assertSucceeds(bob.ref("images/alice/shared.png").getDownloadURL());
  });
});
