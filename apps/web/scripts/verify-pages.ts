import { getPayload } from "payload";
import config from "../payload.config";
import { createLogger } from "../lib/logger";

const logger = createLogger("verify-pages");

async function verifyPages() {
  const payload = await getPayload({
    config,
  });

  logger.info("Verifying 'about' page...");
  const aboutPage = await payload.find({
    collection: "pages",
    where: {
      slug: {
        equals: "about",
      },
    },
  });

  if (aboutPage.docs.length > 0) {
    logger.info("'about' page found successfully!");
  } else {
    logger.error("'about' page not found.");
  }

  logger.info("Verifying 'contact' page...");
  const contactPage = await payload.find({
    collection: "pages",
    where: {
      slug: {
        equals: "contact",
      },
    },
  });

  if (contactPage.docs.length > 0) {
    logger.info("'contact' page found successfully!");
  } else {
    logger.error("'contact' page not found.");
  }

  // Clean up payload instance
  if (payload.db && typeof payload.db.destroy === "function") {
    await payload.db.destroy();
  }
}

verifyPages().catch((error) => {
  logger.error("Error during page verification:", error);
  process.exit(1);
});
