export interface RoomHistoryItem {
  roomId: string
  password?: string
  isCreator: boolean
  lastAccess: string
}

const STORAGE_KEY = 'chitchatter_room_history'

export const getRoomHistory = (): RoomHistoryItem[] => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return []
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

export const addRoomToHistory = (roomId: string, password?: string, isCreator: boolean = false) => {
  const history = getRoomHistory()
  const existing = history.findIndex(item => item.roomId === roomId)
  
  const newItem: RoomHistoryItem = {
    roomId,
    password,
    isCreator,
    lastAccess: new Date().toISOString(),
  }
  
  if (existing !== -1) {
    history[existing] = newItem
  } else {
    history.unshift(newItem)
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)))
}

export const removeRoomFromHistory = (roomId: string) => {
  const history = getRoomHistory()
  const filtered = history.filter(item => item.roomId !== roomId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}
