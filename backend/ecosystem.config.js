// PM2 配置文件 - 生产环境集群模式
module.exports = {
  apps: [
    {
      name: 'fitness-backend',
      script: './dist/main.js',
      instances: 'max', // 使用所有 CPU 核心
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      // 内存限制
      max_memory_restart: '1G',
      // 日志配置
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      // 优雅关闭
      kill_timeout: 5000,
      listen_timeout: 3000,
      // 健康检查
      health_check: {
        enable: true,
        interval: 30000,
        path: '/api/health',
      },
    },
  ],
};
