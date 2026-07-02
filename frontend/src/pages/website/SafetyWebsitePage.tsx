import { safetyItems, safetyPrimitives } from '../../components/website/content/website-content';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

const sensitiveFields = ['身体信息', '精确位置', '联系方式', '活动轨迹', '个人偏好信号'];
const governanceItems = ['查看审计记录', '撤回授权', '举报用户或活动', '删除数据请求'];
const safetyAssuranceItems = [
  ['公开前', '用户能看清需求卡会展示什么。'],
  ['联系前', '邀请、私信和好友动作独立确认。'],
  ['异常时', '举报、撤回和删除请求有明确入口。'],
] as const;

export function SafetyWebsitePage() {
  return (
    <>
      <WebsiteHero name="safety" />
      <WebsiteSection label="安全机制" title="每个关键动作都要可解释、可确认、可追溯。">
        <div className="fm-safety-ledger" aria-label="FitMeet 默认安全协议">
          <div className="fm-safety-ledger__copy">
            <span>Default protocol</span>
            <h3>先保护人，再推进连接。</h3>
            <p>
              FitMeet 把安全做在流程里：公开前、匹配前、私信前和加好友前都保留清晰边界。
            </p>
          </div>
          <div className="fm-safety-ledger__rows">
            {safetyPrimitives.map(([title, body]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="fm-policy-table">
          {safetyItems.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="fm-safety-assurance-strip" aria-label="关键动作安全承诺">
          {safetyAssuranceItems.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection label="敏感数据" title="连接越简单，边界越要清楚。" tone="deep">
        <div className="fm-private-data-panel">
          <p>
            FitMeet 的公开 Discover
            卡只展示本次需求需要的信息。更细的联系方式、精确位置和敏感画像默认留在用户本人界面。
          </p>
          <div>
            {sensitiveFields.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </WebsiteSection>
      <WebsiteSection id="governance" label="治理闭环" title="出现问题时，用户知道去哪里处理。">
        <div className="fm-governance-row">
          {governanceItems.map((item) => (
            <article key={item}>
              <h3>{item}</h3>
              <p>安全入口必须清楚、短路径、可操作，而不是藏在长文档里。</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
    </>
  );
}
