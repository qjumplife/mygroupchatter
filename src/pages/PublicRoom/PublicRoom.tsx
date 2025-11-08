import { useContext, useEffect, useState } from 'react'
import { Room } from 'components/Room'
import { useParams, useNavigate } from 'react-router-dom'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

import { WholePageLoading } from 'components/Loading'
import { ShellContext } from 'contexts/ShellContext'
import { useThrottledRoomMount } from 'hooks/useThrottledRoomMount'
import { notification } from 'services/Notification'

interface PublicRoomProps {
  userId: string
}

export function PublicRoom({ userId }: PublicRoomProps) {
  const { roomId = '' } = useParams()
  const { setTitle, showAlert } = useContext(ShellContext)
  const canMount = useThrottledRoomMount(roomId)
  const navigate = useNavigate()
  const [isDuplicateRoom, setIsDuplicateRoom] = useState(false)

  useEffect(() => {
    notification.requestPermission()
    
    // 检查该房间是否已在浏览器的其他标签页中打开
    const roomSessionKey = `chitchatter_in_room_${roomId}`
    const existingSession = localStorage.getItem(roomSessionKey)
    
    if (existingSession) {
      setIsDuplicateRoom(true)
      showAlert('该房间已在另一个标签页中打开', { severity: 'error' })
      return
    }
    
    // 标记该房间已在浏览器中打开
    localStorage.setItem(roomSessionKey, 'true')
    
    // 监听标签页关闭/刷新事件
    const handleBeforeUnload = () => {
      localStorage.removeItem(roomSessionKey)
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      localStorage.removeItem(roomSessionKey)
    }
  }, [roomId, showAlert])

  useEffect(() => {
    setTitle(`Room: ${roomId}`)
  }, [roomId, setTitle])

  if (isDuplicateRoom) {
    return (
      <Dialog open={true}>
        <DialogTitle>房间已打开</DialogTitle>
        <DialogContent>
          <DialogContentText>
            该房间已在另一个标签页中打开，一个浏览器只能打开一个房间标签页。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => navigate('/')}>返回首页</Button>
        </DialogActions>
      </Dialog>
    )
  }

  return canMount ? (
    <Room userId={userId} roomId={roomId} />
  ) : (
    <WholePageLoading />
  )
}
