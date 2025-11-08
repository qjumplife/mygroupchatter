import { Room } from 'components/Room'
import { useContext, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

import { WholePageLoading } from 'components/Loading'
import { PasswordPrompt } from 'components/PasswordPrompt'
import { allowAdvancedRoomLinkSharing } from 'components/Shell/constants'
import { ShellContext } from 'contexts/ShellContext'
import { useThrottledRoomMount } from 'hooks/useThrottledRoomMount'
import { encryption } from 'services/Encryption'
import { notification } from 'services/Notification'

interface PublicRoomProps {
  userId: string
}

export function PrivateRoom({ userId }: PublicRoomProps) {
  const { roomId = '' } = useParams()
  const { setTitle, peerList, showAlert, peerRoomRef } = useContext(ShellContext)
  const canMount = useThrottledRoomMount(roomId)
  const navigate = useNavigate()
  const [isDuplicateUser, setIsDuplicateUser] = useState(false)

  const urlParams = new URLSearchParams(window.location.hash.substring(1))

  if (allowAdvancedRoomLinkSharing && window.location.hash.length > 0) {
    // Clear secret from address bar
    window.history.replaceState(window.history.state, '', '#')
  }

  const [secret, setSecret] = useState(urlParams.get('secret') ?? '')

  // 组件加载时立即检查是否重复
  useEffect(() => {
    const roomSessionKey = `chitchatter_in_room_${roomId}`
    const existingSession = localStorage.getItem(roomSessionKey)
    
    console.log('[PrivateRoom] 检查重复登录:', { roomId, roomSessionKey, existingSession })
    
    if (existingSession) {
      console.log('[PrivateRoom] 检测到重复，阻止进入')
      setIsDuplicateUser(true)
      showAlert('该房间已在另一个标签页中打开', { severity: 'error' })
    }
  }, [roomId, showAlert])

  useEffect(() => {
    notification.requestPermission()
    
    // 监听标签页关闭/刷新事件
    const handleBeforeUnload = () => {
      const roomSessionKey = `chitchatter_in_room_${roomId}`
      localStorage.removeItem(roomSessionKey)
      console.log('[PrivateRoom] 清除房间标记')
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      const roomSessionKey = `chitchatter_in_room_${roomId}`
      localStorage.removeItem(roomSessionKey)
    }
  }, [roomId])

  useEffect(() => {
    setTitle(`Room: ${roomId}`)
  }, [roomId, setTitle])

  const handlePasswordEntered = async (password: string, inviteKey?: string) => {
    if (password.length !== 0) {
      // 再次检查是否重复（防止竞态条件）
      const roomSessionKey = `chitchatter_in_room_${roomId}`
      const existingSession = localStorage.getItem(roomSessionKey)
      
      if (existingSession) {
        console.log('[PrivateRoom] 输入密码时检测到重复')
        setIsDuplicateUser(true)
        showAlert('该房间已在另一个标签页中打开', { severity: 'error' })
        return
      }
      
      const encodedSecret = await encryption.encodePassword(roomId, password)
      
      // 如果有邀请码，先存储（进入房间后会自动验证）
      if (inviteKey) {
        sessionStorage.setItem(`invite_key_${roomId}`, inviteKey)
      }
      
      setSecret(encodedSecret)
      
      // 标记该房间已在浏览器中打开
      localStorage.setItem(roomSessionKey, 'true')
      console.log('[PrivateRoom] 设置房间标记:', roomSessionKey)
    }
  }

  if (urlParams.has('pwd') && !urlParams.has('secret'))
    handlePasswordEntered(urlParams.get('pwd') ?? '')

  const awaitingSecret = secret.length === 0

  if (!canMount) {
    return <WholePageLoading />
  }

  if (isDuplicateUser) {
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

  return awaitingSecret ? (
    <PasswordPrompt
      isOpen={awaitingSecret}
      onPasswordEntered={handlePasswordEntered}
    />
  ) : (
    <Room userId={userId} roomId={roomId} password={secret} />
  )
}
