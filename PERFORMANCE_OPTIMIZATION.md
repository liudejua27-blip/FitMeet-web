# ⚡ 性能优化指南 - 支持上万人同时在线

## 📊 当前架构评估

你的应用采用了现代化的技术栈：
- **前端**: React + Vite + TypeScript
- **后端**: NestJS + TypeScript
- **数据库**: PostgreSQL + MongoDB + Redis
- **消息队列**: Kafka
- **实时通信**: Socket.IO

## 🎯 性能优化目标

支持 **10,000+ 并发用户**需要在以下方面进行优化：

### 1. 数据库性能优化

#### PostgreSQL 优化
```sql
-- 为常用查询字段添加索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_meets_date ON meets(date);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- 复合索引优化
CREATE INDEX idx_posts_category_created ON posts(category_id, created_at DESC);
CREATE INDEX idx_meets_type_date ON meets(type, date);

-- 分析查询性能
EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;
```

#### MongoDB 优化
```javascript
// 为消息和通知集合添加索引
db.messages.createIndex({ conversationId: 1, createdAt: -1 });
db.messages.createIndex({ senderId: 1, createdAt: -1 });
db.notifications.createIndex({ userId: 1, read: 1, createdAt: -1 });
db.conversations.createIndex({ participants: 1, updatedAt: -1 });
```

#### Redis 缓存策略
```typescript
// backend/src/redis/cache.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class CacheService {
  constructor(private redisService: RedisService) {}

  // 缓存用户信息（1小时）
  async cacheUser(userId: number, userData: any) {
    const redis = this.redisService.getClient();
    await redis.setex(`user:${userId}`, 3600, JSON.stringify(userData));
  }

  // 缓存热门帖子（5分钟）
  async cacheHotPosts(posts: any[]) {
    const redis = this.redisService.getClient();
    await redis.setex('posts:hot', 300, JSON.stringify(posts));
  }

  // 缓存用户会话
  async cacheSession(sessionId: string, data: any, ttl: number = 86400) {
    const redis = this.redisService.getClient();
    await redis.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
  }

  // 使用 Redis 计数器
  async incrementViewCount(postId: number) {
    const redis = this.redisService.getClient();
    return redis.incr(`post:${postId}:views`);
  }
}
```

### 2. API 性能优化

#### 分页优化
```typescript
// 使用游标分页代替偏移分页
export class PostsService {
  async getPostsCursor(cursor?: number, limit: number = 20) {
    const query = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .orderBy('post.id', 'DESC')
      .limit(limit);

    if (cursor) {
      query.where('post.id < :cursor', { cursor });
    }

    const posts = await query.getMany();
    const nextCursor = posts.length > 0 ? posts[posts.length - 1].id : null;

    return { posts, nextCursor };
  }
}
```

#### 批量查询优化
```typescript
// 使用 DataLoader 解决 N+1 查询问题
import DataLoader from 'dataloader';

export class UserLoader {
  private loader: DataLoader<number, User>;

  constructor(private userRepo: Repository<User>) {
    this.loader = new DataLoader(async (userIds: number[]) => {
      const users = await this.userRepo.findByIds(userIds);
      const userMap = new Map(users.map(u => [u.id, u]));
      return userIds.map(id => userMap.get(id));
    });
  }

  load(userId: number) {
    return this.loader.load(userId);
  }
}
```

#### 响应压缩
```typescript
// 已在 main.ts 中启用 compression
// 确保大型 JSON 响应被压缩
```

### 3. 前端性能优化

#### 代码分割和懒加载
```typescript
// frontend/src/App.tsx
import { lazy, Suspense } from 'react';

const HomePage = lazy(() => import('./pages/HomePage'));
const MeetPage = lazy(() => import('./pages/MeetPage'));
const CoachPage = lazy(() => import('./pages/CoachPage'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/meet" element={<MeetPage />} />
        <Route path="/coach" element={<CoachPage />} />
      </Routes>
    </Suspense>
  );
}
```

#### 虚拟滚动
```typescript
// 对于长列表使用虚拟滚动
import { useVirtualizer } from '@tanstack/react-virtual';

function PostList({ posts }: { posts: Post[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <PostCard post={posts[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 图片优化
```typescript
// 使用懒加载和占位符
function OptimizedImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={{ contentVisibility: 'auto' }}
    />
  );
}
```

### 4. WebSocket 优化

#### 连接池管理
```typescript
// backend/src/messages/messages.gateway.ts
export class MessagesGateway {
  private readonly MAX_CONNECTIONS_PER_USER = 3;
  private userConnections = new Map<number, Set<string>>();

  async handleConnection(client: Socket) {
    const userId = await this.validateToken(client);
    
    // 限制每个用户的连接数
    const connections = this.userConnections.get(userId) || new Set();
    if (connections.size >= this.MAX_CONNECTIONS_PER_USER) {
      client.disconnect();
      return;
    }

    connections.add(client.id);
    this.userConnections.set(userId, connections);
  }
}
```

#### 消息批处理
```typescript
// 批量发送通知，减少 WebSocket 消息数量
export class NotificationService {
  private batchQueue = new Map<number, any[]>();
  private batchTimer: NodeJS.Timeout;

  queueNotification(userId: number, notification: any) {
    if (!this.batchQueue.has(userId)) {
      this.batchQueue.set(userId, []);
    }
    this.batchQueue.get(userId).push(notification);

    // 每 100ms 批量发送一次
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), 100);
    }
  }

  private flushBatch() {
    for (const [userId, notifications] of this.batchQueue) {
      this.gateway.sendBatchNotifications(userId, notifications);
    }
    this.batchQueue.clear();
    this.batchTimer = null;
  }
}
```

### 5. 负载均衡和水平扩展

#### 使用 PM2 集群模式
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'fitness-backend',
    script: './dist/main.js',
    instances: 'max', // 使用所有 CPU 核心
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
```

#### Redis 会话共享
```typescript
// 使用 Redis 存储会话，支持多实例
import * as session from 'express-session';
import * as connectRedis from 'connect-redis';

const RedisStore = connectRedis(session);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 86400000, // 1 day
    },
  }),
);
```

### 6. Kafka 消息队列优化

#### 异步处理耗时任务
```typescript
// backend/src/kafka/producers/notification.producer.ts
@Injectable()
export class NotificationProducer {
  constructor(private kafkaService: KafkaService) {}

  async sendNotification(userId: number, type: string, data: any) {
    // 异步发送通知，不阻塞主流程
    await this.kafkaService.send('notifications', {
      userId,
      type,
      data,
      timestamp: Date.now(),
    });
  }
}

// backend/src/kafka/consumers/notification.consumer.ts
@Injectable()
export class NotificationConsumer {
  @OnEvent('notifications')
  async handleNotification(message: any) {
    // 批量处理通知
    await this.notificationService.create(message);
    await this.gateway.sendNotification(message.userId, message);
  }
}
```

### 7. 监控和性能分析

#### 添加性能监控
```typescript
// backend/src/common/interceptors/performance.interceptor.ts
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Performance');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        if (duration > 1000) {
          this.logger.warn(`Slow request: ${method} ${url} took ${duration}ms`);
        }
      }),
    );
  }
}
```

## 📈 压力测试

### 使用 Artillery 进行压力测试
```yaml
# artillery-test.yml
config:
  target: 'https://your-domain.com'
  phases:
    - duration: 60
      arrivalRate: 100  # 每秒 100 个用户
      name: "Warm up"
    - duration: 300
      arrivalRate: 500  # 每秒 500 个用户
      name: "Sustained load"
    - duration: 120
      arrivalRate: 1000 # 每秒 1000 个用户
      name: "Peak load"

scenarios:
  - name: "Browse posts"
    flow:
      - get:
          url: "/api/feed"
      - think: 2
      - get:
          url: "/api/feed?page=2"
```

运行测试：
```bash
artillery run artillery-test.yml
```

## 🎯 性能指标目标

- **响应时间**: 
  - P50 < 100ms
  - P95 < 500ms
  - P99 < 1000ms

- **吞吐量**: 
  - 支持 10,000+ 并发连接
  - 处理 50,000+ 请求/分钟

- **数据库**:
  - 查询时间 < 50ms
  - 连接池利用率 < 80%

- **缓存命中率**: > 80%

- **错误率**: < 0.1%

## 🔧 性能优化检查清单

- [ ] 数据库索引已优化
- [ ] 实现 Redis 缓存策略
- [ ] API 响应启用压缩
- [ ] 前端代码分割和懒加载
- [ ] 图片使用 CDN 和懒加载
- [ ] WebSocket 连接池管理
- [ ] 使用消息队列处理异步任务
- [ ] 配置负载均衡
- [ ] 启用 HTTP/2
- [ ] 配置性能监控
- [ ] 完成压力测试
- [ ] 优化慢查询

## 📚 推荐工具

- **性能监控**: New Relic, DataDog, Prometheus + Grafana
- **错误追踪**: Sentry
- **日志分析**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **压力测试**: Artillery, JMeter, k6
- **数据库监控**: pgAdmin, MongoDB Compass
- **APM**: Application Performance Monitoring

## 🚀 下一步行动

1. 立即实施数据库索引优化
2. 配置 Redis 缓存热点数据
3. 进行压力测试验证性能
4. 配置监控和告警系统
5. 根据监控数据持续优化
