import { useState } from 'react'
import { useInvitationKeys, InviteKeyWithPlaintext } from 'hooks/useInvitationKeys'
import { KeyStatus } from 'models/authority'

const statusColors: Record<KeyStatus, string> = {
  ACTIVE: '#4caf50',
  USED: '#2196f3',
  REVOKED: '#f44336',
  EXPIRED: '#9e9e9e',
}

const statusLabels: Record<KeyStatus, string> = {
  ACTIVE: '可用',
  USED: '已使用',
  REVOKED: '已吊销',
  EXPIRED: '已过期',
}

export const InviteManagerPanel = () => {
  const {
    keys,
    generateKey,
    revokeKey,
    cleanupExpiredKeys,
    isGenerating,
    error,
    isRoomCreator,
  } = useInvitationKeys()

  const [ttlValue, setTtlValue] = useState(24)
  const [ttlUnit, setTtlUnit] = useState<'hours' | 'days' | 'months' | 'years'>('hours')
  const [generatedKey, setGeneratedKey] = useState<InviteKeyWithPlaintext | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [saveHistory, setSaveHistory] = useState(() => {
    return localStorage.getItem('chitchatter_save_invite_history') === 'true'
  })

  const getTtlHours = () => {
    switch (ttlUnit) {
      case 'hours': return ttlValue
      case 'days': return ttlValue * 24
      case 'months': return ttlValue * 24 * 30
      case 'years': return ttlValue * 24 * 365
    }
  }

  if (!isRoomCreator) {
    return null
  }

  const handleGenerate = async () => {
    const key = await generateKey(getTtlHours())
    if (key) {
      setGeneratedKey(key)
      setShowKey(true)
      if (saveHistory && key.plaintext) {
        const saved = JSON.parse(localStorage.getItem('chitchatter_invite_history') || '[]')
        saved.push({ hash: key.hash, plaintext: key.plaintext, createdAt: key.createdAt })
        localStorage.setItem('chitchatter_invite_history', JSON.stringify(saved))
      }
    }
  }

  const handleRevoke = async (hash: string) => {
    if (window.confirm('确定要吊销这个密钥吗？')) {
      await revokeKey(hash)
    }
  }

  const handleCleanup = async () => {
    const count = await cleanupExpiredKeys()
    if (count > 0) {
      alert(`已清理 ${count} 个过期密钥`)
    } else {
      alert('没有过期密钥需要清理')
    }
  }

  const handleCopyKey = (plaintext?: string) => {
    const text = plaintext || generatedKey?.plaintext
    if (text) {
      navigator.clipboard.writeText(text)
      alert('密钥已复制到剪贴板')
    }
  }

  const toggleSaveHistory = () => {
    const newValue = !saveHistory
    setSaveHistory(newValue)
    localStorage.setItem('chitchatter_save_invite_history', String(newValue))
  }

  const getHistoryForKey = (hash: string) => {
    const saved = JSON.parse(localStorage.getItem('chitchatter_invite_history') || '[]')
    return saved.find((item: any) => item.hash === hash)
  }

  const activeCount = keys.filter(k => k.status === 'ACTIVE').length
  const usedCount = keys.filter(k => k.status === 'USED').length
  const expiredCount = keys.filter(k => {
    // Check if key is expired by comparing expiration date
    return new Date(k.expiration).getTime() < Date.now()
  }).length

  return (
    <div style={{ 
      padding: '10px', 
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: '6px',
      marginBottom: '8px',
      maxWidth: '100%',
      fontSize: '12px',
      color: '#333'
    }}>
      <h3 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          margin: '0 0 10px 0', 
          fontSize: '14px', 
          color: '#333',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        {isCollapsed ? '▶' : '▼'} 🔑 邀请密钥管理
      </h3>
      {!isCollapsed && <>

      {/* 统计信息 */}
      <div style={{ marginBottom: '10px', display: 'flex', gap: '6px', fontSize: '11px', flexWrap: 'wrap' }}>
        <div style={{ padding: '4px 8px', backgroundColor: 'rgba(76, 175, 80, 0.15)', borderRadius: '3px', color: '#2e7d32' }}>
          <strong>可用:</strong> {activeCount}
        </div>
        <div style={{ padding: '4px 8px', backgroundColor: 'rgba(33, 150, 243, 0.15)', borderRadius: '3px', color: '#1565c0' }}>
          <strong>已使用:</strong> {usedCount}
        </div>
        <div style={{ padding: '4px 8px', backgroundColor: 'rgba(158, 158, 158, 0.15)', borderRadius: '3px', color: '#616161' }}>
          <strong>已过期:</strong> {expiredCount}
        </div>
      </div>

      {/* 生成密钥 */}
      <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: 'rgba(240, 240, 240, 0.8)', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h4 style={{ margin: '0', fontSize: '12px', color: '#333' }}>生成新密钥</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#666', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={saveHistory}
              onChange={toggleSaveHistory}
              style={{ cursor: 'pointer' }}
            />
            保存历史
          </label>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', fontSize: '11px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            有效期:
            <input
              type="number"
              value={ttlValue}
              onChange={e => setTtlValue(Number(e.target.value))}
              min={1}
              style={{ padding: '3px 6px', width: '50px', borderRadius: '3px', border: '1px solid #ccc', fontSize: '11px' }}
            />
            <select
              value={ttlUnit}
              onChange={e => setTtlUnit(e.target.value as any)}
              style={{ padding: '3px 6px', borderRadius: '3px', border: '1px solid #ccc', fontSize: '11px' }}
            >
              <option value="hours">小时</option>
              <option value="days">天</option>
              <option value="months">月</option>
              <option value="years">年</option>
            </select>
          </label>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{
              padding: '4px 10px',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              fontSize: '11px',
            }}
          >
            {isGenerating ? '生成中...' : '生成'}
          </button>
          <button
            onClick={handleCleanup}
            style={{
              padding: '4px 10px',
              backgroundColor: '#9e9e9e',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            清理过期
          </button>
        </div>

        {/* 显示生成的密钥 */}
        {showKey && generatedKey?.plaintext && (
          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(255, 243, 205, 0.95)', borderRadius: '4px' }}>
            <strong style={{ fontSize: '11px', color: '#333' }}>⚠️ 密钥生成成功！请立即复制：</strong>
            <div style={{
              marginTop: '6px',
              padding: '6px',
              backgroundColor: 'white',
              border: '2px solid #ffc107',
              borderRadius: '3px',
              fontSize: '13px',
              fontFamily: 'monospace',
              textAlign: 'center',
              wordBreak: 'break-all',
              color: '#333'
            }}>
              {generatedKey.plaintext}
            </div>
            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
              <button
                onClick={() => handleCopyKey()}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                复制
              </button>
              <button
                onClick={() => setShowKey(false)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ padding: '6px', backgroundColor: 'rgba(255, 235, 238, 0.95)', color: '#c62828', borderRadius: '3px', marginBottom: '8px', fontSize: '11px' }}>
          {error}
        </div>
      )}

      {/* 密钥列表 */}
      <div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#333' }}>密钥列表 ({keys.length})</h4>
        {keys.length === 0 ? (
          <p style={{ color: '#999', fontSize: '11px', margin: '0' }}>暂无密钥</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {[...keys].reverse().map((key, index) => (
              <div
                key={key.hash}
                style={{
                  padding: '6px',
                  border: '1px solid rgba(0,0,0,0.15)',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(250, 250, 250, 0.9)',
                  fontSize: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          backgroundColor: statusColors[key.status],
                          color: 'white',
                          borderRadius: '2px',
                          fontSize: '10px',
                        }}
                      >
                        {statusLabels[key.status]}
                      </span>
                      <span style={{ fontSize: '10px', color: '#666' }}>
                        #{keys.length - index}
                      </span>
                      {key.usedBy && (
                        <span 
                          title={key.usedBy}
                          style={{ 
                            fontSize: '9px',
                            color: '#2196f3',
                            cursor: 'pointer',
                            fontFamily: 'monospace'
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(key.usedBy!)
                            alert('User ID 已复制')
                          }}
                        >
                          {key.usedBy.substring(0, 8)}...{key.usedBy.substring(key.usedBy.length - 4)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '9px', color: '#666' }}>
                      <div>创建: {new Date(key.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      <div>过期: {new Date(key.expiration).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      {(() => {
                        const history = getHistoryForKey(key.hash)
                        return history ? (
                          <div style={{ marginTop: '3px', padding: '3px', backgroundColor: 'rgba(255, 243, 205, 0.5)', borderRadius: '2px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '9px' }}>{history.plaintext}</span>
                          </div>
                        ) : null
                      })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {(() => {
                      const history = getHistoryForKey(key.hash)
                      return history ? (
                        <button
                          onClick={() => handleCopyKey(history.plaintext)}
                          style={{
                            padding: '3px 8px',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '10px',
                          }}
                        >
                          复制
                        </button>
                      ) : null
                    })()}
                    {(key.status === 'ACTIVE' || key.status === 'USED') && (
                      <button
                        onClick={() => handleRevoke(key.hash)}
                        style={{
                          padding: '3px 8px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '10px',
                        }}
                      >
                        吊销
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      }
    </div>
  )
}
