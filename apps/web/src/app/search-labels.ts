/**
 * The `where` a location search puts in the URL, and what the search field shows for it.
 *
 * Two values because the label is not displayed on its own — the results page drops it into
 * sentences: "3 spaces near ___", "No spaces near ___ yet", "Map of spaces near ___". "you" reads
 * correctly in all of them; "Your location" reads as "3 spaces near Your location".
 *
 * These live here rather than in `search-bar.tsx`, and that matters. The search bar is a client
 * module, and a server component importing a non-component export from a `'use client'` file
 * receives a client reference, not the value — so `params.where === NEAR_YOU_LABEL` on the page
 * would be silently, permanently false. The type checker cannot see that.
 */
export const NEAR_YOU_LABEL = 'you';
export const NEAR_YOU_FIELD_TEXT = 'Your location';
