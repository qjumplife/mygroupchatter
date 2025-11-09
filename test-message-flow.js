// 测试邀请码状态更新消息流程

console.log('🧪 测试邀请码状态更新消息流程\n');

// 1. 用户验证成功后发送的消息
const statusNotification = {
  type: 'STATUS_UPDATE_NOTIFICATION',
  hashKi: 'abc123hash',
  newStatus: 'USED',
  usedBy: 'user456',
  timestamp: '2024-01-01T12:00:00Z'
};

console.log('📤 用户发送的状态更新通知:');
console.log(JSON.stringify(statusNotification, null, 2));

// 2. 管理员解析逻辑测试
function parseStatusNotification(data) {
  console.log('\n🔍 管理员解析消息:');
  
  // 检查消息类型
  if (data.type !== 'STATUS_UPDATE_NOTIFICATION') {
    console.log('❌ 消息类型不匹配:', data.type);
    return false;
  }
  
  // 检查必需字段
  const requiredFields = ['hashKi', 'newStatus', 'usedBy', 'timestamp'];
  for (const field of requiredFields) {
    if (!data[field]) {
      console.log(`❌ 缺少必需字段: ${field}`);
      return false;
    }
  }
  
  // 检查状态值
  if (data.newStatus !== 'USED') {
    console.log('❌ 无效的状态值:', data.newStatus);
    return false;
  }
  
  console.log('✅ 消息解析成功');
  console.log(`  邀请码哈希: ${data.hashKi}`);
  console.log(`  新状态: ${data.newStatus}`);
  console.log(`  使用者: ${data.usedBy}`);
  console.log(`  时间戳: ${data.timestamp}`);
  
  return true;
}

// 3. 测试解析
const parseResult = parseStatusNotification(statusNotification);

// 4. 管理员回复的确认消息
if (parseResult) {
  const ackMessage = {
    type: 'STATUS_UPDATE_ACK',
    hashKi: statusNotification.hashKi,
    timestamp: new Date().toISOString()
  };
  
  console.log('\n📤 管理员回复的确认消息:');
  console.log(JSON.stringify(ackMessage, null, 2));
}

// 5. 测试管理员ping/pong机制
console.log('\n🏓 测试管理员检测机制:');

const adminPing = {
  type: 'ADMIN_PING',
  roomId: 'room123',
  timestamp: new Date().toISOString()
};

const adminPong = {
  type: 'ADMIN_PONG', 
  roomId: 'room123',
  timestamp: new Date().toISOString()
};

console.log('📤 用户发送PING:');
console.log(JSON.stringify(adminPing, null, 2));

console.log('\n📤 管理员回复PONG:');
console.log(JSON.stringify(adminPong, null, 2));

console.log('\n✅ 消息流程测试完成！');