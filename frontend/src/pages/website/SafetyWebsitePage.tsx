import { safetyItems } from '../../components/website/content/website-content';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

const sensitiveFields = ['身体信息', '精确位置', '联系方式', '活动轨迹', '个人偏好信号'];
const governanceItems = ['查看审计记录', '撤回授权', '举报用户或活动', '删除数据请求'];

export function SafetyWebsitePage() {
  return (
    <>
      <WebsiteHero name="safety" />
      <WebsiteSection label="安全机制" title="每个关键动作都要可解释、可确认、可追溯。">
        <div className="fm-policy-table">
          {safetyItems.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection label="敏感数据" title="默认隐藏，只在本人界面可见。" tone="deep">
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
      <WebsiteSection id="governance" label="治理闭环" title="出现问题时，用户知道该去哪里。">
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
