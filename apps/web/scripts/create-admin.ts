/**
 * Create an admin user on a running deployment.
 *
 * A fresh deployment has no users at all: the `deploy` seed preset deliberately
 * seeds no users, and Payload's built-in `first-register` endpoint cannot help
 * either -- the users collection forces `role: "user"` on every unauthenticated
 * REST create, so that endpoint can only ever produce a non-admin. Without this
 * script an operator has no supported way into their own installation.
 *
 * Runs through the Local API on purpose. The REST hooks that force the role are
 * scoped to `req.payloadAPI === "REST"`, and the collection's own comment names
 * the Local API as the path for creating admins.
 *
 * Invoked by `timetiles create-admin`, which supplies the credentials through
 * the environment rather than argv so they stay out of the process list.
 *
 * @module
 * @category Scripts
 */
import { getPayload } from "payload";

import config from "../payload.config";

// Inlined rather than routed through a helper: control-flow narrowing only
// follows `process.exit` directly, so a `never`-returning wrapper would leave
// the values typed as possibly undefined below.
const fail = (message: string): never => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const run = async (): Promise<void> => {
  const email = process.env.TIMETILES_ADMIN_EMAIL?.trim();
  const password = process.env.TIMETILES_ADMIN_PASSWORD;

  if (email == null || email === "") {
    fail("TIMETILES_ADMIN_EMAIL is not set");
    return;
  }
  if (password == null || password === "") {
    fail("TIMETILES_ADMIN_PASSWORD is not set");
    return;
  }

  const payload = await getPayload({ config });

  try {
    const existing = await payload.find({
      collection: "users",
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.totalDocs > 0) {
      // Refuse rather than update: silently changing an existing account's role
      // or password from a bootstrap command would be a privilege-escalation
      // primitive for anyone who can run it.
      fail(`a user with email ${email} already exists`);
    }

    const user = await payload.create({
      collection: "users",
      overrideAccess: true,
      // The verification mail is pointless here and actively harmful: a
      // deployment without SMTP would fail the whole create on the send.
      disableVerificationEmail: true,
      data: {
        email,
        password,
        role: "admin",
        // Required field. UNLIMITED, matching what the seed gives its admin --
        // quota limits on the operator's own account would be nonsense.
        trustLevel: "5",
        isActive: true,
        // Pre-verified because there is no inbox to confirm from yet, and an
        // unverified admin cannot log in.
        _verified: true,
      },
    });

    console.log(`Created admin user ${user.email} (id ${user.id}).`);
  } finally {
    // Without this the process hangs on the open pool instead of exiting.
    await payload.destroy();
  }
};

await run();
