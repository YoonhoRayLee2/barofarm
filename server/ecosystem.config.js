module.exports = {
  apps: [{
    name: 'barofarm',
    script: './src/index.ts',
    interpreter: '/home/ec2-user/.bun/bin/bun',
    exec_mode: 'fork',
    cwd: '/home/ec2-user/barofarm/server',
    env_file: '/home/ec2-user/barofarm/server/.env'
  }]
}