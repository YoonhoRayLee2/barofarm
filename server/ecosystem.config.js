module.exports = {
  apps: [{
    name: 'barofarm',
    script: './src/index.ts',
    // 여기에 복사한 경로를 그대로 넣으세요
    interpreter: '/home/ec2-user/.bun/bin/bun',
    exec_mode: 'fork'
  }]
}