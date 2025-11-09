import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import Chip from '@mui/material/Chip'
import { getRoomHistory, removeRoomFromHistory, RoomHistoryItem } from 'services/RoomHistory'
import { isCreator } from 'services/Authority'

export const RoomHistoryList = () => {
  const [history, setHistory] = useState<RoomHistoryItem[]>([])

  useEffect(() => {
    setHistory(getRoomHistory())
  }, [])

  const handleDelete = (roomId: string) => {
    console.log('[主页删除] 开始删除房间:', roomId)
    
    // 从房间历史中移除
    removeRoomFromHistory(roomId)
    
    // 清除所有相关的localStorage数据
    const allKeys = Object.keys(localStorage)
    const roomKeys = allKeys.filter(key => key.includes(roomId))
    roomKeys.forEach(key => {
      localStorage.removeItem(key)
      console.log('[主页删除] 清除localStorage键:', key)
    })
    
    // 清除sessionStorage中的相关数据
    const sessionKeys = Object.keys(sessionStorage)
    const roomSessionKeys = sessionKeys.filter(key => key.includes(roomId))
    roomSessionKeys.forEach(key => {
      sessionStorage.removeItem(key)
      console.log('[主页删除] 清除sessionStorage键:', key)
    })
    
    // 特别清除管理员相关数据
    const creatorKeys = [
      `chitchatter_creator_${roomId}`,
      `chitchatter_session_creator_${roomId}`,
      `chitchatter_room_password_${roomId}`,
      `chitchatter_groupclaim_${roomId}`,
      `invite_key_${roomId}`
    ]
    
    creatorKeys.forEach(key => {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
      console.log('[主页删除] 强制清除管理员键:', key)
    })
    
    // 清除邀请码历史
    localStorage.removeItem('chitchatter_invite_history')
    localStorage.removeItem('chitchatter_save_invite_history')
    
    console.log('[主页删除] 删除完成')
    setHistory(getRoomHistory())
  }

  const handleOpen = (item: RoomHistoryItem) => {
    const base = '/mygroupchatter'
    const path = item.password 
      ? `${base}/private/${item.roomId}` 
      : `${base}/public/${item.roomId}`
    window.open(path, '_blank')
  }

  if (history.length === 0) return null

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>房间历史</Typography>
      <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
        {history.map((item) => (
          <ListItem
            key={item.roomId}
            secondaryAction={
              <Box>
                <IconButton edge="end" onClick={() => handleOpen(item)} sx={{ mr: 1 }}>
                  <OpenInNewIcon />
                </IconButton>
                <IconButton edge="end" onClick={() => handleDelete(item.roomId)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            }
          >
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {item.roomId.length > 20 ? `${item.roomId.slice(0, 8)}...${item.roomId.slice(-4)}` : item.roomId}
                  </Typography>
                  {isCreator(item.roomId) && <Chip label="管理员" size="small" color="primary" />}
                  {item.password && <Chip label="私有" size="small" />}
                </Box>
              }
              secondary={new Date(item.lastAccess).toLocaleString()}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
