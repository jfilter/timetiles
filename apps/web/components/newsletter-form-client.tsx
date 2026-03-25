"use client";

/**
 * Client-side wrappers for newsletter components.
 *
 * Server Components cannot pass event handlers (onSubmit) to Client Components.
 * These wrappers provide the onSubmit callback on the client side instead.
 *
 * @module
 * @category Components
 */
import { NewsletterCTA, type NewsletterCTAProps, NewsletterForm, type NewsletterFormProps } from "@timetiles/ui";

import { submitNewsletterSubscription } from "@/lib/blocks/newsletter";

type FormProps = Omit<NewsletterFormProps, "onSubmit">;

export const NewsletterFormClient = (props: FormProps) => {
  return <NewsletterForm {...props} onSubmit={submitNewsletterSubscription} />;
};

type CTAProps = Omit<NewsletterCTAProps, "onSubmit">;

export const NewsletterCTAClient = (props: CTAProps) => {
  return <NewsletterCTA {...props} onSubmit={submitNewsletterSubscription} />;
};
