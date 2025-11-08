// 使用 undefined 让 Trystero 使用默认 tracker 列表
// 默认列表: https://github.com/dmotz/trystero/blob/main/src/torrent.js#L6
let trackerUrls: string[] | undefined = undefined

// If a tracker URL has been provided via the VITE_TRACKER_URL environment
// variable, prioritize using it. This is mainly relevant for local development
// when using the `npm run dev` script. If you are hosting your own Chitchatter
// instance, consider populating the trackerUrls above instead.
if (import.meta.env.VITE_TRACKER_URL) {
  trackerUrls = [import.meta.env.VITE_TRACKER_URL]
}

export { trackerUrls }
