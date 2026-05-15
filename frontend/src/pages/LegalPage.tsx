import { Link } from 'react-router-dom';

type LegalPageType = 'privacy' | 'terms' | 'community';

interface LegalPageProps {
  type: LegalPageType;
}

const pages: Record<LegalPageType, {
  title: string;
  intro: string;
  updatedAt: string;
  sections: Array<{ heading: string; body: string[] }>;
}> = {
  privacy: {
    title: '隐私政策',
    intro: 'FitMeet 尊重并保护你的个人信息。本政策说明我们如何收集、使用、保存和保护你的信息。',
    updatedAt: '2026-04-30',
    sections: [
      {
        heading: '我们收集的信息',
        body: [
          '账号信息：邮箱、手机号、昵称、头像、城市、个人简介等你主动填写的资料。',
          '使用信息：发帖、评论、约练、关注、私信、举报等你在平台内产生的内容和操作记录。',
          '设备与日志信息：设备类型、浏览器信息、IP 地址、访问时间、错误日志等用于安全与稳定性排查的信息。',
        ],
      },
      {
        heading: '我们如何使用信息',
        body: [
          '用于提供注册登录、内容发布、约练匹配、消息通知、账号安全和客户支持。',
          '用于识别垃圾内容、违规行为和异常访问，维护社区秩序与服务安全。',
          '用于改进产品体验，例如分析功能使用情况、修复问题和优化推荐展示。',
        ],
      },
      {
        heading: '信息保存与保护',
        body: [
          '我们会在实现服务目的所需的期限内保存你的信息，并采取访问控制、加密传输、日志审计等措施降低泄露风险。',
          '你可以在账号设置中更新公开资料，也可以通过客服或举报入口申请更正、删除账号相关信息。',
        ],
      },
      {
        heading: '未成年人保护',
        body: [
          '未成年人应在监护人同意和指导下使用本服务。我们不鼓励未成年人单独参加线下约练。',
          '如监护人发现未成年人信息被不当收集或展示，可联系我们处理。',
        ],
      },
    ],
  },
  terms: {
    title: '用户协议',
    intro: '欢迎使用 FitMeet。本协议适用于你访问和使用 FitMeet 提供的健身社交、约练和消息服务。',
    updatedAt: '2026-04-30',
    sections: [
      {
        heading: '服务说明',
        body: [
          'FitMeet 当前版本面向用户免费开放，用于发现运动伙伴、发布运动动态、创建约练和进行站内交流。',
          '我们会持续优化服务，也可能根据运营需要调整部分功能、页面或规则，并在合理范围内进行提示。',
        ],
      },
      {
        heading: '账号与内容',
        body: [
          '你应保证注册信息真实、合法、有效，并妥善保管账号和登录凭证。',
          '你发布的文字、图片、视频、评论和消息应由你本人负责，不得侵犯他人权益或违反法律法规。',
        ],
      },
      {
        heading: '线下安全',
        body: [
          '约练属于用户自主发起的线下活动。请自行判断活动风险，选择公共、安全的地点，并提前告知亲友行程。',
          '如遇紧急情况，请优先联系公安、急救等公共服务机构，再通过平台提交举报或反馈。',
        ],
      },
      {
        heading: '违规处理',
        body: [
          '对于欺诈、骚扰、辱骂、违法内容、恶意营销、冒用身份等行为，我们有权采取删除内容、限制功能或封禁账号等措施。',
          '如你认为处理结果有误，可以通过举报说明或客服渠道提交申诉材料。',
        ],
      },
    ],
  },
  community: {
    title: '社区规范与举报说明',
    intro: 'FitMeet 希望每一次交流都真实、友善、安全。以下规范适用于动态、评论、约练、私信和个人资料。',
    updatedAt: '2026-04-30',
    sections: [
      {
        heading: '鼓励的行为',
        body: [
          '真实介绍运动水平、时间地点和活动要求，尊重不同年龄、性别、身材和训练目标的用户。',
          '准时沟通，无法赴约时及时说明；活动中遵守场馆规则和公共秩序。',
        ],
      },
      {
        heading: '禁止的行为',
        body: [
          '发布违法、暴力、色情、歧视、侮辱、威胁、骚扰、诈骗或侵犯隐私的内容。',
          '冒用他人身份，诱导用户进行站外交易，批量发布广告，或以任何方式破坏平台秩序。',
        ],
      },
      {
        heading: '举报与处理',
        body: [
          '你可以在相关内容、用户资料、私信或约练记录中提交举报，并尽量附上截图、时间、地点和说明。',
          '我们会根据证据和影响范围进行审核，必要时限制相关内容或账号，并保留配合主管机关处理的权利。',
        ],
      },
      {
        heading: '安全提醒',
        body: [
          '首次线下见面建议选择公开场所，不单独前往偏僻地点，不轻易透露身份证件、住址、银行卡等敏感信息。',
          '如发现现实安全风险，请立即离开现场并联系公共服务机构。',
        ],
      },
    ],
  },
};

export function LegalPage({ type }: LegalPageProps) {
  const page = pages[type];

  return (
    <div className="min-h-screen bg-base px-4 py-10 text-white sm:px-6">
      <article className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link to="/" className="text-sm font-semibold text-lime transition hover:text-white">
            返回首页
          </Link>
          <h1 className="mt-4 text-3xl font-display font-extrabold sm:text-4xl">
            {page.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted sm:text-base">
            {page.intro}
          </p>
          <p className="mt-3 text-xs text-textSofter">更新日期：{page.updatedAt}</p>
        </div>

        <div className="space-y-6">
          {page.sections.map((section) => (
            <section
              key={section.heading}
              className="rounded-lg border border-border bg-surface/70 p-5 sm:p-6"
            >
              <h2 className="text-lg font-display font-bold text-white">
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-textMuted">
                {section.body.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-lime/20 bg-lime/10 p-4 text-sm leading-7 text-textMuted">
          如需行使信息查询、更正、删除、注销或举报申诉等权利，请通过站内反馈入口联系 FitMeet 运营团队。
        </div>
      </article>
    </div>
  );
}
