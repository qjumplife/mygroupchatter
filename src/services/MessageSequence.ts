/**
 * 消息序列号服务
 * 用于检测消息丢失
 */

// 消息向量：记录每个用户的消息序号列表
export interface MessageVector {
  [userId: string]: number[]  // userId -> 消息序号列表
}

// 带序号的消息
export interface SequencedMessage {
  seq: number              // 本消息的序号
  vector: MessageVector    // 发送时看到的最近10条消息
}

class MessageSequenceService {
  private sequences: Map<string, number> = new Map()  // roomId -> 当前序号
  private messageHistory: Map<string, Array<{userId: string, seq: number}>> = new Map()  // roomId -> 消息历史
  
  /**
   * 获取下一个序号并更新历史
   */
  getNextSequence(roomId: string, userId: string): SequencedMessage {
    // 获取当前序号
    const currentSeq = this.sequences.get(roomId) || 0
    const nextSeq = currentSeq + 1
    this.sequences.set(roomId, nextSeq)
    
    // 添加到历史
    const history = this.messageHistory.get(roomId) || []
    history.push({ userId, seq: nextSeq })
    this.messageHistory.set(roomId, history)
    
    // 获取最近10条的向量
    const recentVector = this.getRecentVector(roomId)
    
    return {
      seq: nextSeq,
      vector: recentVector
    }
  }
  
  /**
   * 接收消息时更新历史
   */
  updateVector(roomId: string, authorId: string, seq: number, receivedVector: MessageVector) {
    const history = this.messageHistory.get(roomId) || []
    
    // 添加接收到的消息
    history.push({ userId: authorId, seq })
    
    // 合并接收到的向量中的消息
    for (const [userId, seqs] of Object.entries(receivedVector)) {
      for (const s of seqs) {
        if (!history.some(h => h.userId === userId && h.seq === s)) {
          history.push({ userId, seq: s })
        }
      }
    }
    
    this.messageHistory.set(roomId, history)
  }
  
  /**
   * 检测缺失的消息
   */
  detectMissing(roomId: string, authorId: string, seq: number): number[] {
    const history = this.messageHistory.get(roomId) || []
    const userSeqs = history
      .filter(h => h.userId === authorId)
      .map(h => h.seq)
      .sort((a, b) => a - b)
    
    if (userSeqs.length === 0) return []
    
    const lastSeen = Math.max(...userSeqs)
    if (seq <= lastSeen) return []
    
    // 缺失的序号
    const missing: number[] = []
    for (let i = lastSeen + 1; i < seq; i++) {
      missing.push(i)
    }
    
    return missing
  }
  
  /**
   * 获取最近10条消息的向量
   */
  private getRecentVector(roomId: string): MessageVector {
    const history = this.messageHistory.get(roomId) || []
    const recent = history.slice(-10)  // 最近10条
    
    // 按用户分组
    const vector: MessageVector = {}
    for (const { userId, seq } of recent) {
      if (!vector[userId]) {
        vector[userId] = []
      }
      vector[userId].push(seq)
    }
    
    return vector
  }
  
  /**
   * 格式化向量为可读字符串
   */
  formatVector(vector: MessageVector): string {
    const parts: string[] = []
    
    for (const [userId, seqs] of Object.entries(vector)) {
      const shortId = userId.substring(0, 8)
      parts.push(`${shortId}:${seqs.join(' ')}`)
    }
    
    return parts.join(', ')
  }
  
  /**
   * 重置房间（重新登录时）
   */
  reset(roomId: string) {
    this.sequences.delete(roomId)
    this.messageHistory.delete(roomId)
  }
}

export const messageSequence = new MessageSequenceService()
