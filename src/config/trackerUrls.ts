// WebTorrent tracker 列表（必须是 wss:// 协议）
let trackerUrls: string[] | undefined = [
  // 国内可访问的 tracker
  'wss://tracker.sloppyta.co:443/announce',
  'wss://tracker.novage.com.ua:443/announce',
  'wss://tracker.ghostchu-services.top:443/announce',

  // 备用 tracker
  'wss://tracker.openwebtorrent.com:443/announce',
  'wss://tracker.webtorrent.dev:443/announce',
  'wss://tracker.files.fm:7073/announce',
  'wss://tracker.btorrent.xyz:443/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://qot.abir.top:443/announce',
  'wss://spacetradersapi-chatbox.herokuapp.com:443/announce'
  
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
