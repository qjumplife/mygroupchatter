// 国内网络环境下，公共 tracker 都被墙，必须自建 tracker
// 自建教程: npm install -g bittorrent-tracker && bittorrent-tracker --ws true --port 443
let trackerUrls: string[] | undefined = [
  // 尝试一些可能可用的 tracker
  // 国内可访问的 tracker
  'wss://tracker.sloppyta.co:443/announce',
  'wss://tracker.novage.com.ua:443/announce',
  'wss://tracker.ghostchu-services.top:443/announce',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
  // 备用 tracker
  'wss://tracker.openwebtorrent.com:443/announce',
  'wss://tracker.webtorrent.dev:443/announce',
  'wss://tracker.files.fm:7073/announce',
  'wss://tracker.btorrent.xyz:443/announce',
  'wss://tracker.btorrent.xyz',
  'wss://qot.abir.top:443/announce',
  'wss://spacetradersapi-chatbox.herokuapp.com:443/announce'
]

// 如果设置了环境变量，优先使用（用于自建 tracker）
if (import.meta.env.VITE_TRACKER_URL) {
  trackerUrls = [import.meta.env.VITE_TRACKER_URL, ...trackerUrls]
}

// 如果没有任何 tracker，设置为 undefined 使用 Trystero 默认列表
if (!trackerUrls || trackerUrls.length === 0) {
  trackerUrls = undefined
}

export { trackerUrls }
