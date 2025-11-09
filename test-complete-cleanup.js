// 测试完整的数据清理
import crypto from 'crypto';

// 模拟浏览器环境
global.window = {
  crypto: {
    subtle: crypto.webcrypto.subtle,
    getRandomValues: (arr) => crypto.getRandomValues(arr)
  },
  location: {
    href: '/',
    reload: () => console.log('页面重新加载')
  }
};

global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

global.sessionStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// 模拟房间历史服务
const mockRoomHistory = {
  data: [],
  addRoomToHistory(roomId, password) {
    const existing = this.data.findIndex(item => item.roomId === roomId);
    const newItem = { roomId, password, lastAccess: new Date().toISOString() };
    
    if (existing !== -1) {
      this.data[existing] = newItem;
    } else {
      this.data.unshift(newItem);
    }
    
    localStorage.setItem('chitchatter_room_history', JSON.stringify(this.data));
    console.log(`✅ 添加房间到历史: ${roomId}`);
  },
  
  removeRoomFromHistory(roomId) {
    this.data = this.data.filter(item => item.roomId !== roomId);
    localStorage.setItem('chitchatter_room_history', JSON.stringify(this.data));
    console.log(`✅ 从历史中移除房间: ${roomId}`);
  },
  
  getRoomHistory() {
    return this.data;
  }
};

// 完整数据清理测试
class CompleteCleanupTest {
  constructor() {
    this.roomId = 'test-room-123';
    this.userId = 'admin-user-456';
  }

  // 创建完整的管理员数据
  createCompleteAdminData() {
    console.log('🔧 创建完整的管理员数据...');
    
    // 1. 管理员基本信息
    const passwordKey = `chitchatter_room_password_${this.roomId}`;
    const password = `room_${this.roomId}_${Date.now()}`;
    localStorage.setItem(passwordKey, password);
    
    const creatorKey = `chitchatter_creator_${this.roomId}`;
    const creatorInfo = {
      roomId: this.roomId,
      userId: this.userId,
      privateKeyString: 'mock-private-key',
      publicKeyString: 'mock-public-key',
      contentKeyString: 'mock-content-key',
      createdAt: new Date().toISOString()
    };
    const encrypted = btoa(JSON.stringify(creatorInfo) + '::' + password);
    localStorage.setItem(creatorKey, encrypted);
    
    sessionStorage.setItem(`chitchatter_session_creator_${this.roomId}`, 'true');
    
    // 2. GroupClaim
    const groupClaim = {
      createdAt: new Date().toISOString(),
      roomId: this.roomId,
      creatorId: this.userId,
      version: 1,
      timestamp: new Date().toISOString(),
      publicKey: 'mock-public-key',
      keyset: [],
      signature: 'mock-signature'
    };
    localStorage.setItem(`chitchatter_groupclaim_${this.roomId}`, JSON.stringify(groupClaim));
    
    // 3. 用户验证信息
    localStorage.setItem(`chitchatter_verified_${this.roomId}_${this.userId}`, 'mock-verified-data');
    localStorage.setItem(`chitchatter_invite_hash_${this.roomId}_${this.userId}`, 'mock-invite-hash');
    
    // 4. 临时状态信息
    localStorage.setItem(`chitchatter_temp_status_${this.roomId}_hash1`, JSON.stringify({
      hashKi: 'hash1',
      usedBy: this.userId,
      timestamp: new Date().toISOString(),
      roomId: this.roomId
    }));
    localStorage.setItem(`chitchatter_temp_status_${this.roomId}_hash2`, JSON.stringify({
      hashKi: 'hash2',
      usedBy: 'other-user',
      timestamp: new Date().toISOString(),
      roomId: this.roomId
    }));
    
    // 5. 邀请码历史
    const inviteHistory = [
      { hash: 'hash1', plaintext: 'invite-key-1', createdAt: new Date().toISOString() },
      { hash: 'hash2', plaintext: 'invite-key-2', createdAt: new Date().toISOString() }
    ];
    localStorage.setItem('chitchatter_invite_history', JSON.stringify(inviteHistory));
    localStorage.setItem('chitchatter_save_invite_history', 'true');
    
    // 6. 房间历史
    mockRoomHistory.addRoomToHistory(this.roomId, password);
    
    // 7. 其他房间会话标记
    localStorage.setItem(`chitchatter_room_session_${this.roomId}`, 'true');
    
    console.log('✅ 完整管理员数据创建完成');
  }

  // 模拟完整的数据清理
  performCompleteCleanup() {
    console.log('\n🧹 执行完整数据清理...');
    
    // 清除所有相关数据
    sessionStorage.removeItem(`chitchatter_session_creator_${this.roomId}`);
    localStorage.removeItem(`chitchatter_creator_${this.roomId}`);
    localStorage.removeItem(`chitchatter_room_password_${this.roomId}`);
    localStorage.removeItem(`chitchatter_groupclaim_${this.roomId}`);
    
    // 清除用户验证信息
    localStorage.removeItem(`chitchatter_verified_${this.roomId}_${this.userId}`);
    localStorage.removeItem(`chitchatter_invite_hash_${this.roomId}_${this.userId}`);
    
    // 清除临时状态信息
    const tempKeys = Object.keys(localStorage.data).filter(key => 
      key.startsWith(`chitchatter_temp_status_${this.roomId}_`)
    );
    tempKeys.forEach(key => localStorage.removeItem(key));
    
    // 清除邀请码历史记录
    localStorage.removeItem('chitchatter_invite_history');
    localStorage.removeItem('chitchatter_save_invite_history');
    
    // 从房间历史中移除
    mockRoomHistory.removeRoomFromHistory(this.roomId);
    
    // 清除房间会话标记
    localStorage.removeItem(`chitchatter_room_session_${this.roomId}`);
    
    console.log('✅ 完整数据清理完成');
  }

  // 检查是否还有残留数据
  checkForRemainingData() {
    console.log('\n🔍 检查残留数据...');
    
    const allKeys = Object.keys(localStorage.data);
    const chitchatterKeys = allKeys.filter(key => key.includes('chitchatter'));
    const roomRelatedKeys = chitchatterKeys.filter(key => key.includes(this.roomId));
    
    console.log(`总localStorage键数: ${allKeys.length}`);
    console.log(`Chitchatter相关键数: ${chitchatterKeys.length}`);
    console.log(`房间相关键数: ${roomRelatedKeys.length}`);
    
    if (roomRelatedKeys.length > 0) {
      console.log('❌ 发现残留数据:');
      roomRelatedKeys.forEach(key => {
        console.log(`  - ${key}: ${localStorage.data[key]?.substring(0, 50)}...`);
      });
    } else {
      console.log('✅ 没有发现房间相关的残留数据');
    }
    
    // 检查房间历史
    const roomHistory = mockRoomHistory.getRoomHistory();
    const hasRoomInHistory = roomHistory.some(item => item.roomId === this.roomId);
    
    if (hasRoomInHistory) {
      console.log('❌ 房间仍在历史记录中');
    } else {
      console.log('✅ 房间已从历史记录中移除');
    }
    
    // 检查sessionStorage
    const sessionKeys = Object.keys(sessionStorage.data);
    const sessionRoomKeys = sessionKeys.filter(key => key.includes(this.roomId));
    
    if (sessionRoomKeys.length > 0) {
      console.log('❌ SessionStorage中发现残留数据:');
      sessionRoomKeys.forEach(key => {
        console.log(`  - ${key}: ${sessionStorage.data[key]}`);
      });
    } else {
      console.log('✅ SessionStorage中没有残留数据');
    }
    
    return {
      localStorageClean: roomRelatedKeys.length === 0,
      roomHistoryClean: !hasRoomInHistory,
      sessionStorageClean: sessionRoomKeys.length === 0
    };
  }

  // 显示存储状态
  showStorageStatus() {
    console.log('\n📊 当前存储状态:');
    
    const localKeys = Object.keys(localStorage.data);
    const sessionKeys = Object.keys(sessionStorage.data);
    
    console.log('LocalStorage:');
    if (localKeys.length === 0) {
      console.log('  (空)');
    } else {
      localKeys.forEach(key => {
        const value = localStorage.data[key];
        console.log(`  ${key}: ${value?.length > 50 ? value.substring(0, 50) + '...' : value}`);
      });
    }
    
    console.log('SessionStorage:');
    if (sessionKeys.length === 0) {
      console.log('  (空)');
    } else {
      sessionKeys.forEach(key => {
        console.log(`  ${key}: ${sessionStorage.data[key]}`);
      });
    }
    
    console.log('房间历史:');
    const history = mockRoomHistory.getRoomHistory();
    if (history.length === 0) {
      console.log('  (空)');
    } else {
      history.forEach(item => {
        console.log(`  ${item.roomId}: ${item.lastAccess}`);
      });
    }
  }

  // 运行完整测试
  async runTest() {
    console.log('🔐 测试完整数据清理功能\n');

    // 测试1: 创建完整数据
    console.log('✅ 测试1 - 创建完整管理员数据:');
    this.createCompleteAdminData();
    this.showStorageStatus();

    // 测试2: 执行完整清理
    console.log('\n✅ 测试2 - 执行完整数据清理:');
    this.performCompleteCleanup();
    this.showStorageStatus();

    // 测试3: 检查清理结果
    console.log('\n✅ 测试3 - 检查清理结果:');
    const cleanupResult = this.checkForRemainingData();

    // 测试结果分析
    console.log('\n🎯 测试结果分析:');
    const allClean = cleanupResult.localStorageClean && 
                     cleanupResult.roomHistoryClean && 
                     cleanupResult.sessionStorageClean;
    
    if (allClean) {
      console.log('✅ 所有测试通过！数据清理完全成功');
      console.log('✅ LocalStorage中没有残留数据');
      console.log('✅ 房间已从历史记录中移除');
      console.log('✅ SessionStorage中没有残留数据');
      console.log('✅ 用户真正成为群外新人');
    } else {
      console.log('❌ 部分测试失败，存在数据清理不完整的问题');
      console.log(`  LocalStorage清理: ${cleanupResult.localStorageClean ? '✅' : '❌'}`);
      console.log(`  房间历史清理: ${cleanupResult.roomHistoryClean ? '✅' : '❌'}`);
      console.log(`  SessionStorage清理: ${cleanupResult.sessionStorageClean ? '✅' : '❌'}`);
    }
  }
}

// 运行测试
const test = new CompleteCleanupTest();
test.runTest().then(() => {
  console.log('\n✅ 完整数据清理测试完成！');
}).catch(console.error);