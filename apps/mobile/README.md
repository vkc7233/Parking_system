# apps/mobile - placeholder

Native Android/iOS apps are explicitly out of scope for the MVP (spec section 4.2) and belong
to Phase 2 of the roadmap document.

This directory exists now, empty, because spec section 9.3 asks for the monorepo shape to be in
place from day one so that the Phase 2 Expo/React Native app can consume `@parking/core`,
`@parking/types`, and `@parking/api-client` rather than reimplementing them.

Nothing here is built or deployed. When Phase 2 starts, scaffold an Expo app in this directory
and add it to the Turborepo pipeline.

**What is already reusable today:** pricing, refunds, the booking state machine, and access
pass issuing/verification all live in `packages/core` with no DOM or Next.js dependency, and
run unchanged on React Native's Hermes runtime.
