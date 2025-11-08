let trackerUrls: string[] | undefined = [
  // 添加一些可用的公共 tracker
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.files.fm:7073/announce',
]

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
