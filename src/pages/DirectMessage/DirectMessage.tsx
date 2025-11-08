import { useContext } from 'react'
import { useParams } from 'react-router-dom'

import { Room } from 'components/Room'
import { ShellContext } from 'contexts/ShellContext'

export const DirectMessage = () => {
  const { peerId } = useParams<{ peerId: string }>()
  const { userId } = useContext(ShellContext)

  if (!peerId) {
    return <div>Invalid peer ID</div>
  }

  return (
    <Room
      roomId={`dm_${userId}_${peerId}`}
      userId={userId}
      targetPeerId={peerId}
    />
  )
}
