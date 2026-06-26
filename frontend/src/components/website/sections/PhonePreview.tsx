import { appTabs } from '../content/website-content';

export function PhonePreview() {
  return (
    <div className="fm-phone-wrap">
      <div className="fm-phone" aria-label="FitMeet App 5 Tab 预览">
        <div className="fm-phone__top">
          <span>FitMeet</span>
          <small>Beta</small>
        </div>
        <div className="fm-phone__prompt">今晚想找低压力慢跑搭子，不尬聊，轻松一点</div>
        <div className="fm-phone__cards">
          <article>
            <strong>需求卡已生成</strong>
            <p>同区域 · 今晚有空 · 强度匹配</p>
          </article>
          <article>
            <strong>确认后发布到发现</strong>
            <p>公共场所 · 站内先聊 · 可撤回</p>
          </article>
        </div>
        <div className="fm-phone__tabs">
          {appTabs.map(([tab, body]) => (
            <span key={tab} title={body}>
              {tab}
            </span>
          ))}
        </div>
      </div>
      <div className="fm-app-tabs">
        {appTabs.map(([tab, body]) => (
          <article key={tab} className="fm-card">
            <h3>{tab}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
