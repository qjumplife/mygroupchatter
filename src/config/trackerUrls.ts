// 使用 undefined 让 Trystero 使用默认的 nostr 策略（不需要 tracker）
let trackerUrls: string[] | undefined = undefined

// If a tracker URL has been provided via the VITE_TRACKER_URL environment
// variable, prioritize using it. This is mainly relevant for local development
// when using the `npm run dev` script. If you are hosting your own Chitchatter
// instance, consider populating the trackerUrls above instead.
if (import.meta.env.VITE_TRACKER_URL) {
  trackerUrls.unshift(import.meta.env.VITE_TRACKER_URL)
}

// If no tracker URL overrides have been provided, set trackerUrls to undefined
// to allow Trystero to use the default list (linked above).
if (!trackerUrls.length) {
  trackerUrls = undefined
}

export { trackerUrls }
