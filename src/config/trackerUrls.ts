// 使用 undefined 让 Trystero 使用 nostr 策略（不需要 tracker，适合国内网络）
// nostr 通过中继服务器建立 P2P 连接，更稳定且不被墙
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
