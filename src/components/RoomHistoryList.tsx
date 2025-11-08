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

export const RoomHistoryList = () => {
  const [history, setHistory] = useState<RoomHistoryItem[]>([])

  useEffect(() => {
    setHistory(getRoomHistory())
  }, [])

  const handleDelete = (roomId: string) => {
    removeRoomFromHistory(roomId)
    setHistory(getRoomHistory())
  }

  const handleOpen = (item: RoomHistoryItem) => {
    const base = '/mygroupchatter'
    const path = item.password 
      ? `${base}/private/${item.roomId}#pwd=${item.password}` 
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
                  {item.isCreator && <Chip label="管理员" size="small" color="primary" />}
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
