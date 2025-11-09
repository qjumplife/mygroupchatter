import { useContext } from 'react'
import { RoomContext } from 'contexts/RoomContext'

export const DebugRoomAuthority = () => {
  const {
    isRoomCreator,
    groupClaim,
    contentKey,
    creatorPrivateKey,
  } = useContext(RoomContext)

  const checkLocalStorage = () => {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith('chitchatter_creator_')
    )
    console.log('🔍 LocalStorage 创建者键:', keys)
    
    if (keys.length > 0) {
      keys.forEach(key => {
        const data = localStorage.getItem(key)
        if (data) {
          try {
            const parsed = JSON.parse(data)
            console.log(`✅ ${key}:`, {
              hasIV: !!parsed.iv,
              hasData: !!parsed.data,
              ivLength: parsed.iv?.length,
              dataLength: parsed.data?.length,
            })
          } catch (e) {
            console.error(`❌ 解析失败 ${key}:`, e)
          }
        }
      })
    } else {
      console.log('❌ 未找到创建者信息')
    }
  }

  return (
    <div style={{ 
      padding: '20px', 
      margin: '20px',
      border: '2px solid #2196f3',
      borderRadius: '8px',
      backgroundColor: '#f5f5f5',
      fontFamily: 'monospace'
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#2196f3' }}>
        🔐 房间权限系统调试
      </h3>
      
      <div style={{ marginBottom: '15px' }}>
        <strong>状态检查：</strong>
        <div style={{ marginLeft: '20px', marginTop: '5px' }}>
          <div>
            <span style={{ color: isRoomCreator ? '#4caf50' : '#f44336' }}>
              {isRoomCreator ? '✅' : '❌'}
            </span>
            {' '}isRoomCreator: <strong>{String(isRoomCreator)}</strong>
          </div>
          <div>
            <span style={{ color: groupClaim ? '#4caf50' : '#f44336' }}>
              {groupClaim ? '✅' : '❌'}
            </span>
            {' '}groupClaim: {groupClaim ? (
              <span>
                v{groupClaim.version}, {groupClaim.keyset.length} keys
              </span>
            ) : 'null'}
          </div>
          <div>
            <span style={{ color: contentKey ? '#4caf50' : '#f44336' }}>
              {contentKey ? '✅' : '❌'}
            </span>
            {' '}contentKey: {contentKey ? contentKey.type : 'null'}
          </div>

          <div>
            <span style={{ color: creatorPrivateKey ? '#4caf50' : '#f44336' }}>
              {creatorPrivateKey ? '✅' : '❌'}
            </span>
            {' '}creatorPrivateKey: {creatorPrivateKey ? creatorPrivateKey.type : 'null'}
          </div>
        </div>
      </div>

      {groupClaim && (
        <div style={{ marginBottom: '15px' }}>
          <strong>GroupClaim 详情：</strong>
          <div style={{ 
            marginLeft: '20px', 
            marginTop: '5px',
            backgroundColor: 'white',
            padding: '10px',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            <div>版本: {groupClaim.version}</div>
            <div>创建时间: {groupClaim.createdAt}</div>
            <div>更新时间: {groupClaim.timestamp}</div>
            <div>创建者: {groupClaim.creatorId.substring(0, 8)}...</div>
            <div>密钥数量: {groupClaim.keyset.length}</div>
            <div>签名长度: {groupClaim.signature.length} 字符</div>
          </div>
        </div>
      )}

      <button
        onClick={checkLocalStorage}
        style={{
          padding: '10px 20px',
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        检查 LocalStorage
      </button>

      <div style={{ 
        marginTop: '15px',
        padding: '10px',
        backgroundColor: '#fff3cd',
        borderRadius: '4px',
        fontSize: '12px'
      }}>
        <strong>💡 提示：</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
          <li>只有私有房间才会初始化权限系统</li>
          <li>首次创建房间时会生成新的权限信息</li>
          <li>重新加入时会从 localStorage 恢复</li>
          <li>打开浏览器控制台查看详细日志</li>
        </ul>
      </div>
    </div>
  )
}
