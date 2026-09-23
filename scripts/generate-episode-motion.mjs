#!/usr/bin/env node
/**
 * FROZEN. Premium Fal/Kling video is not the standard engine.
 * Use the MiniMax H3 worker once VIDEO_WORKER_URL is configured.
 */
console.error("PREMIUM_VIDEO_DISABLED: Kling/Fal video generation is frozen.")
console.error("STANDARD_VIDEO_PROVIDER=self_hosted_workflow")
console.error("Set PREMIUM_VIDEO_ALLOW=1 and PREMIUM_VIDEO_PROVIDER=kling only with explicit authorization.")
process.exit(2)
