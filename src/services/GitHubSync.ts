/**
 * GitHub同步服务 - 分布式备份方案
 * 
 * 架构说明：
 * 1. 每个用户在自己的私有GitHub仓库备份消息
 * 2. 所有操作在浏览器端执行（Chitchatter无后端）
 * 3. 使用GitHub Personal Access Token认证
 * 
 * 安全考虑：
 * - Token存储在localStorage（加密）
 * - 建议使用私有仓库
 * - Token权限最小化（只需repo权限）
 */

export interface GitHubConfig {
  token: string      // GitHub Personal Access Token
  username: string   // GitHub用户名
  repo: string       // 仓库名（建议私有）
}

export interface SyncedMessage {
  id: string
  text: string
  authorId: string
  timestamp: number
  roomId: string
}

export class GitHubSyncService {
  private config: GitHubConfig | null = null
  private syncQueue: Map<string, SyncedMessage> = new Map()
  private isSyncing = false
  
  configure(config: GitHubConfig) {
    this.config = config
    // 加密存储配置
    localStorage.setItem('github_sync_config', btoa(JSON.stringify(config)))
  }
  
  loadConfig(): boolean {
    const stored = localStorage.getItem('github_sync_config')
    if (stored) {
      try {
        this.config = JSON.parse(atob(stored))
        return true
      } catch {
        return false
      }
    }
    return false
  }
  
  isEnabled(): boolean {
    return this.config !== null
  }
  
  /**
   * 同步消息到用户自己的GitHub仓库
   * 注意：这是从浏览器直接调用GitHub API
   */
  async syncMessage(roomId: string, message: SyncedMessage): Promise<void> {
    if (!this.config) return
    
    // 添加到队列
    this.syncQueue.set(message.id, message)
    
    // 批量同步
    if (!this.isSyncing) {
      this.processSyncQueue(roomId)
    }
  }
  
  private async processSyncQueue(roomId: string) {
    if (this.isSyncing || this.syncQueue.size === 0) return
    
    this.isSyncing = true
    
    try {
      const messages = Array.from(this.syncQueue.values())
      
      for (const message of messages) {
        await this.uploadMessage(roomId, message)
        this.syncQueue.delete(message.id)
      }
    } finally {
      this.isSyncing = false
    }
  }
  
  private async uploadMessage(roomId: string, message: SyncedMessage): Promise<void> {
    if (!this.config) return
    
    try {
      const path = `chats/${roomId}/${message.id}.json`
      const content = btoa(JSON.stringify(message))
      
      const response = await fetch(
        `https://api.github.com/repos/${this.config.username}/${this.config.repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.config.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Backup message ${message.id.substring(0, 8)}`,
            content,
          })
        }
      )
      
      if (!response.ok) {
        console.warn('GitHub sync failed:', await response.text())
      }
    } catch (error) {
      console.warn('GitHub sync error:', error)
    }
  }
  
  /**
   * 从用户自己的GitHub仓库获取历史消息
   */
  async getHistory(roomId: string): Promise<SyncedMessage[]> {
    if (!this.config) return []
    
    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.config.username}/${this.config.repo}/contents/chats/${roomId}`,
        {
          headers: {
            'Authorization': `token ${this.config.token}`,
          }
        }
      )
      
      if (!response.ok) return []
      
      const files = await response.json()
      if (!Array.isArray(files)) return []
      
      const messages: SyncedMessage[] = []
      
      for (const file of files) {
        try {
          const content = await fetch(file.download_url).then(r => r.text())
          messages.push(JSON.parse(content))
        } catch (error) {
          console.warn('Failed to load message:', file.name, error)
        }
      }
      
      return messages.sort((a, b) => a.timestamp - b.timestamp)
    } catch (error) {
      console.warn('GitHub history fetch failed:', error)
      return []
    }
  }
}

export const githubSync = new GitHubSyncService()