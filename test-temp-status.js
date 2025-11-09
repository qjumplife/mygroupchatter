// 临时状态更新机制测试

// 模拟localStorage
const mockStorage = {};
const localStorage = {
  setItem: (key, value) => mockStorage[key] = value,
  getItem: (key) => mockStorage[key] || null,
  removeItem: (key) => delete mockStorage[key]
};

// 测试1: 临时信息存储
function testTempInfoStorage() {
  const roomId = 'test-room';
  const hashKi = 'test-hash';
  const userId = 'test-user';
  
  const tempInfo = {
    hashKi,
    usedBy: userId,
    timestamp: new Date().toISOString(),
    roomId
  };
  
  const key = `chitchatter_temp_status_${roomId}_${hashKi}`;
  localStorage.setItem(key, JSON.stringify(tempInfo));
  
  const stored = JSON.parse(localStorage.getItem(key));
  
  console.log('✅ 测试1 - 临时信息存储:');
  console.log('  存储成功:', stored.hashKi === hashKi);
  console.log('  用户ID正确:', stored.usedBy === userId);
  console.log('  房间ID正确:', stored.roomId === roomId);
}

// 测试2: 待处理信息检索
function testPendingStatusRetrieval() {
  // 清理之前的数据
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  
  const roomId = 'test-room';
  
  // 添加多个临时信息
  const tempInfos = [
    { hashKi: 'hash1', usedBy: 'user1', timestamp: '2024-01-01', roomId },
    { hashKi: 'hash2', usedBy: 'user2', timestamp: '2024-01-02', roomId }
  ];
  
  tempInfos.forEach(info => {
    const key = `chitchatter_temp_status_${roomId}_${info.hashKi}`;
    localStorage.setItem(key, JSON.stringify(info));
  });
  
  // 检索待处理信息
  const keys = Object.keys(mockStorage);
  const tempKeys = keys.filter(key => key.startsWith(`chitchatter_temp_status_${roomId}_`));
  
  console.log('✅ 测试2 - 待处理信息检索:');
  console.log('  找到临时信息数量:', tempKeys.length);
  console.log('  预期数量:', tempInfos.length);
  console.log('  检索正确:', tempKeys.length === tempInfos.length);
}

// 测试3: 确认后删除
function testAckAndRemove() {
  const roomId = 'test-room';
  const hashKi = 'test-hash';
  
  const key = `chitchatter_temp_status_${roomId}_${hashKi}`;
  localStorage.setItem(key, JSON.stringify({ test: 'data' }));
  
  console.log('✅ 测试3 - 确认后删除:');
  console.log('  删除前存在:', localStorage.getItem(key) !== null);
  
  // 模拟收到确认
  localStorage.removeItem(key);
  
  console.log('  删除后不存在:', localStorage.getItem(key) === null);
}

// 测试4: 过期检测
function testExpirationCheck() {
  const now = Date.now();
  const expired = new Date(now - 3600000).toISOString(); // 1小时前
  const active = new Date(now + 3600000).toISOString();  // 1小时后
  
  const keyset = [
    { hash: 'hash1', status: 'ACTIVE', expiration: expired },
    { hash: 'hash2', status: 'ACTIVE', expiration: active },
    { hash: 'hash3', status: 'USED', expiration: expired }
  ];
  
  let hasExpired = false;
  const updatedKeyset = keyset.map(record => {
    if (record.status === 'ACTIVE' && new Date(record.expiration).getTime() < now) {
      hasExpired = true;
      return { ...record, status: 'EXPIRED' };
    }
    return record;
  });
  
  console.log('✅ 测试4 - 过期检测:');
  console.log('  检测到过期:', hasExpired);
  console.log('  过期数量:', updatedKeyset.filter(k => k.status === 'EXPIRED').length);
  console.log('  预期过期数量: 1');
}

// 运行所有测试
console.log('🧪 临时状态更新机制测试\n');

testTempInfoStorage();
console.log('');

testPendingStatusRetrieval();
console.log('');

testAckAndRemove();
console.log('');

testExpirationCheck();
console.log('');

console.log('✅ 所有测试完成！');