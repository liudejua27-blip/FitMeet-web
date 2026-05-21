import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import dataSource from '../src/database/data-source';
import { User } from '../src/users/user.entity';
import { UserSocialProfile } from '../src/users/user-social-profile.entity';
import {
  SocialRequestGenderPreference,
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../src/social-requests/social-request.entity';

const SEED_KEY = 'living-social-20260521';
const PASSWORD = 'FitMeet@2026';

type SeedPerson = {
  key: string;
  name: string;
  gender: string;
  age: number;
  city: string;
  area: string;
  lat: number;
  lng: number;
  gym: string;
  mbti: string;
  zodiac: string;
  color: string;
  sports: string[];
  lifestyle: string[];
  traits: string[];
  goals: string[];
  wantToMeet: string[];
  preferredTraits: string[];
  avoidTraits: string[];
  weekday: string;
  weekend: string;
  slice: string;
  title: string;
  description: string;
  activityType: string;
  requestType: SocialRequestType;
  radiusKm: number;
};

const people: SeedPerson[] = [
  {
    key: 'qd-linyizhou',
    name: '林一舟',
    gender: '男',
    age: 29,
    city: '青岛',
    area: '市南-五四广场',
    lat: 36.0607,
    lng: 120.3826,
    gym: '威尔仕五四广场店',
    mbti: 'ENTJ',
    zodiac: '天秤座',
    color: '#22C55E',
    sports: ['海边慢跑', '力量训练', '拉伸'],
    lifestyle: ['手冲咖啡', 'AI 产品', '周末看展'],
    traits: ['目标感强', '准时', '边界清楚'],
    goals: ['稳定减脂', '半马备赛'],
    wantToMeet: ['下班后能稳定运动的人', '聊得来但不越界的朋友'],
    preferredTraits: ['真诚', '自律', '不临时鸽'],
    avoidTraits: ['上来索要联系方式', '迟到不说明', '强度硬卷'],
    weekday: '周二、周四 19:30 后',
    weekend: '周日上午海边轻松跑',
    slice: '下班后常从五四广场跑到奥帆，跑完会买一杯无糖拿铁，喜欢边走边聊产品想法。',
    title: '周四晚五四广场 6km 轻松跑',
    description: '配速 6:30 左右，跑完在奥帆附近拉伸十分钟，适合想恢复运动节奏的人。',
    activityType: '轻松跑',
    requestType: SocialRequestType.RunningPartner,
    radiusKm: 6,
  },
  {
    key: 'qd-suxiaoman',
    name: '苏小满',
    gender: '女',
    age: 27,
    city: '青岛',
    area: '崂山-石老人',
    lat: 36.0969,
    lng: 120.4753,
    gym: '乐刻石老人店',
    mbti: 'ENFP',
    zodiac: '双子座',
    color: '#F97316',
    sports: ['瑜伽', '普拉提', '海边散步'],
    lifestyle: ['胶片摄影', '早午餐', '播客'],
    traits: ['松弛', '表达欲强', '会照顾新手'],
    goals: ['改善体态', '规律早睡'],
    wantToMeet: ['温和的运动搭子', '喜欢生活记录的人'],
    preferredTraits: ['礼貌', '稳定', '聊天自然'],
    avoidTraits: ['油腻玩笑', '打探隐私', '推销课程'],
    weekday: '周三 20:00 后',
    weekend: '周六上午 10 点前后',
    slice: '周末会去海边拍照片，运动强度不追求狠，比较看重舒服和长期坚持。',
    title: '周六石老人日出瑜伽和咖啡',
    description: '先在海边做 40 分钟舒缓拉伸，再去附近咖啡店坐一会儿，适合慢热型社交。',
    activityType: '瑜伽拉伸',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 5,
  },
  {
    key: 'sh-chenyan',
    name: '陈砚',
    gender: '男',
    age: 32,
    city: '上海',
    area: '徐汇-衡山路',
    lat: 31.2046,
    lng: 121.4437,
    gym: '超级猩猩徐汇店',
    mbti: 'INTJ',
    zodiac: '摩羯座',
    color: '#3B82F6',
    sports: ['力量训练', '划船机', '城市骑行'],
    lifestyle: ['独立书店', '低糖饮食', '技术播客'],
    traits: ['安静', '逻辑强', '可靠'],
    goals: ['增肌', '改善肩颈'],
    wantToMeet: ['能互相监督训练的人', '喜欢深聊但不尬聊的人'],
    preferredTraits: ['守时', '尊重节奏', '有复盘习惯'],
    avoidTraits: ['训练时拍摄他人', '临时改地点', '过度比较身材'],
    weekday: '工作日 20:15 后',
    weekend: '周日下午',
    slice: '做后端架构，常在晚饭后训练，喜欢把每次训练重量记到 Notion。',
    title: '徐汇晚间力量互相保护训练',
    description: '深蹲、卧推、划船机为主，互相保护动作，不卷重量，训练后可简单复盘。',
    activityType: '力量训练',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 4,
  },
  {
    key: 'sh-luoya',
    name: '罗雅',
    gender: '女',
    age: 30,
    city: '上海',
    area: '静安-南京西路',
    lat: 31.2299,
    lng: 121.4592,
    gym: 'Pure 静安嘉里中心',
    mbti: 'INFJ',
    zodiac: '巨蟹座',
    color: '#A855F7',
    sports: ['普拉提', '椭圆机', '徒步'],
    lifestyle: ['香气', '美术馆', '城市漫步'],
    traits: ['细腻', '慢热', '观察力强'],
    goals: ['体态管理', '提高心肺'],
    wantToMeet: ['有审美也有边界感的人', '周末能一起探索城市的人'],
    preferredTraits: ['温和', '干净清爽', '不强势'],
    avoidTraits: ['催促见面', '评价外貌', '问收入'],
    weekday: '周一、周三晚',
    weekend: '周六午后',
    slice: '平时做品牌设计，喜欢把运动和城市散步连在一起，见面更偏公共空间。',
    title: '静安普拉提后咖啡散步',
    description: '先上一节基础普拉提，再沿南京西路附近散步，不交换联系方式，站内先聊。',
    activityType: '普拉提',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 3,
  },
  {
    key: 'bj-xuhe',
    name: '许赫',
    gender: '男',
    age: 34,
    city: '北京',
    area: '朝阳-望京',
    lat: 39.9968,
    lng: 116.4695,
    gym: '中田健身望京店',
    mbti: 'ESTJ',
    zodiac: '狮子座',
    color: '#EF4444',
    sports: ['拳击', '力量训练', '夜跑'],
    lifestyle: ['创业复盘', '脱口秀', '精酿'],
    traits: ['直接', '行动快', '保护欲强'],
    goals: ['减压', '保持体能'],
    wantToMeet: ['能一起练拳的朋友', '做事靠谱的人'],
    preferredTraits: ['坦诚', '抗压', '不拧巴'],
    avoidTraits: ['情绪勒索', '酒后失控', '线下私密场所'],
    weekday: '周二、周五 21:00 前',
    weekend: '周日上午',
    slice: '做 B2B 销售管理，压力大时会去打沙袋，讲话直接但会提前确认边界。',
    title: '望京拳击体验搭子',
    description: '新手友好，主要练基础步伐和打靶，结束后可在商场公共区喝水聊天。',
    activityType: '拳击',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 5,
  },
  {
    key: 'bj-tangning',
    name: '唐宁',
    gender: '女',
    age: 26,
    city: '北京',
    area: '海淀-五道口',
    lat: 39.9929,
    lng: 116.3373,
    gym: '五道口学院路健身房',
    mbti: 'INTP',
    zodiac: '水瓶座',
    color: '#06B6D4',
    sports: ['游泳', '羽毛球', '拉伸'],
    lifestyle: ['机器学习', '二手书', '猫咖'],
    traits: ['慢热', '好奇心重', '不爱客套'],
    goals: ['肩颈放松', '保持心肺'],
    wantToMeet: ['能轻松聊天的同城朋友', '学习和运动都能互相提醒的人'],
    preferredTraits: ['尊重沉默', '不冒犯', '有耐心'],
    avoidTraits: ['上来查户口', '催回复', '炫耀学历'],
    weekday: '周四晚 19:00 后',
    weekend: '周日下午',
    slice: '读研期间养成游泳习惯，现在写模型代码久了会用羽毛球找回身体感。',
    title: '五道口羽毛球双打补位',
    description: '水平中等偏新手，想找一位能轮换练球的搭子，场地 AA，节奏轻松。',
    activityType: '羽毛球',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 4,
  },
  {
    key: 'sz-jiangnan',
    name: '姜南',
    gender: '男',
    age: 28,
    city: '深圳',
    area: '南山-科技园',
    lat: 22.5431,
    lng: 113.9345,
    gym: '超级猩猩科技园店',
    mbti: 'ENTP',
    zodiac: '射手座',
    color: '#84CC16',
    sports: ['HIIT', '篮球', '骑行'],
    lifestyle: ['硬件创业', '粤式早茶', '海边骑行'],
    traits: ['外向', '点子多', '能带气氛'],
    goals: ['提高爆发力', '控制熬夜'],
    wantToMeet: ['有创业状态的人', '愿意一起运动后复盘的人'],
    preferredTraits: ['开放', '执行力强', '幽默'],
    avoidTraits: ['只聊融资八卦', '不尊重女性', '无边界推销'],
    weekday: '周三 20:00 后',
    weekend: '周六傍晚',
    slice: '白天在科技园做硬件产品，晚上喜欢用篮球或 HIIT 把脑子清空。',
    title: '科技园 HIIT 后聊产品',
    description: '45 分钟循环训练，强度可调；结束后在公共区聊产品、运动和深圳生活。',
    activityType: 'HIIT',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 5,
  },
  {
    key: 'sz-wenqing',
    name: '温晴',
    gender: '女',
    age: 31,
    city: '深圳',
    area: '福田-香蜜湖',
    lat: 22.5489,
    lng: 114.0407,
    gym: '香蜜公园跑团',
    mbti: 'ISFJ',
    zodiac: '处女座',
    color: '#14B8A6',
    sports: ['公园跑', '瑜伽', '爬山'],
    lifestyle: ['做饭', '植物', '周末短途'],
    traits: ['细致', '稳定', '会倾听'],
    goals: ['稳定跑量', '放松肩颈'],
    wantToMeet: ['安全感强的运动朋友', '能长期约固定时间的人'],
    preferredTraits: ['守时', '干净', '情绪稳定'],
    avoidTraits: ['突然改路线', '夜间偏僻地点', '冒犯边界'],
    weekday: '周二、周四早 7:30',
    weekend: '周日香蜜公园慢跑',
    slice: '做财务分析，喜欢把一天从晨跑开始，周末会给自己煮一锅汤。',
    title: '香蜜公园晨跑 4km',
    description: '早上不赶速度，跑完拉伸和买早餐，适合想把运动放回生活的人。',
    activityType: '晨跑',
    requestType: SocialRequestType.RunningPartner,
    radiusKm: 4,
  },
  {
    key: 'hz-yuyao',
    name: '余尧',
    gender: '男',
    age: 30,
    city: '杭州',
    area: '西湖-黄龙',
    lat: 30.2722,
    lng: 120.1289,
    gym: '黄龙体育中心',
    mbti: 'ISTJ',
    zodiac: '金牛座',
    color: '#0EA5E9',
    sports: ['羽毛球', '骑行', '核心训练'],
    lifestyle: ['茶馆', '开源项目', '夜游西湖'],
    traits: ['稳', '认真', '低调'],
    goals: ['提高耐力', '减少久坐'],
    wantToMeet: ['同频的球友', '安静但不冷场的人'],
    preferredTraits: ['靠谱', '不浮夸', '愿意 AA'],
    avoidTraits: ['临时放鸽子', '打球情绪化', '过度打听职业'],
    weekday: '周一、周三晚',
    weekend: '周六上午',
    slice: '做数据库相关工作，周末喜欢从黄龙骑到北山街，停下来喝一杯龙井。',
    title: '黄龙羽毛球 90 分钟',
    description: '订双人场，先热身再拉高远和双打，结束后附近简单吃饭可选。',
    activityType: '羽毛球',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 5,
  },
  {
    key: 'hz-muxi',
    name: '穆溪',
    gender: '女',
    age: 25,
    city: '杭州',
    area: '滨江-星光大道',
    lat: 30.2085,
    lng: 120.212,
    gym: '乐刻滨江店',
    mbti: 'INFP',
    zodiac: '双鱼座',
    color: '#EC4899',
    sports: ['舞蹈', '普拉提', '散步'],
    lifestyle: ['插画', '中古店', '甜品探店'],
    traits: ['温柔', '想象力强', '慢热'],
    goals: ['体态改善', '规律运动'],
    wantToMeet: ['有审美的女生朋友', '一起慢慢变好的搭子'],
    preferredTraits: ['温和', '不评判', '会分享生活'],
    avoidTraits: ['评头论足', '强推课程', '催着拍照'],
    weekday: '周五晚',
    weekend: '周日下午',
    slice: '白天做插画外包，晚上练舞，最近想从宅家状态慢慢走出来。',
    title: '滨江零基础爵士舞体验',
    description: '一起上一节入门课，动作跟不上也没关系，结束后可以买杯热饮聊聊。',
    activityType: '舞蹈',
    requestType: SocialRequestType.FitnessPartner,
    radiusKm: 4,
  },
];

const morePeople: SeedPerson[] = [
  ['cd-zhoumo', '周墨', '男', 33, '成都', '高新-交子大道', 30.5745, 104.0657, '交子公园跑道', 'ENFJ', '白羊座', '#F59E0B', ['夜跑', '网球', '徒步'], ['川菜', '播客', '产品增长'], ['热情', '会组织', '照顾节奏'], ['减脂', '提升心肺'], ['同城运动朋友', '产品/创业交流伙伴'], ['大方', '不端着', '行动稳定'], ['酒局压力', '边界不清', '迟到'], '周二 20:00 后', '周六上午', '做增长运营，喜欢把运动安排得像小型项目，但不会给别人压力。', '交子公园夜跑和轻聊', '5km 以内，不拼配速，跑完在灯光球场附近拉伸。', '夜跑', SocialRequestType.RunningPartner, 6],
  ['cd-jianglai', '江莱', '女', 28, '成都', '武侯-玉林', 30.632, 104.053, '玉林社区健身房', 'ESFP', '双子座', '#FB7185', ['尊巴', '羽毛球', 'CityWalk'], ['小酒馆', 'vlog', '宠物友好咖啡'], ['开朗', '有分寸', '不冷场'], ['保持活力', '结识同城朋友'], ['轻松有趣的人', '愿意一起探索街区的人'], ['幽默', '礼貌', '情绪稳定'], ['冒犯玩笑', '硬劝喝酒', '私密地点'], '周三晚', '周日下午', '住玉林多年，喜欢街边小店和舒服的聊天，不喜欢第一次见面太正式。', '玉林 CityWalk 加羽毛球', '先在社区球馆打一小时，再沿小巷走走，公共路线安全。', '羽毛球', SocialRequestType.FitnessPartner, 4],
  ['gz-liangchen', '梁辰', '男', 27, '广州', '天河-珠江新城', 23.1201, 113.321, '天河体育中心', 'ESTP', '射手座', '#10B981', ['篮球', '力量训练', '短跑'], ['粤语歌', '早茶', '球鞋'], ['爽快', '外向', '讲义气'], ['提高弹跳', '规律训练'], ['球友', '能吃早茶的朋友'], ['不玻璃心', '守时', '会沟通'], ['场上吵架', '临时鸽', '上来借钱'], '周四 19:30', '周日上午', '做广告客户执行，压力大时会去投篮，球风认真但不较劲。', '天体半场篮球三缺一', '找一位能打半场的搭子，强度中等，结束后可附近吃点东西。', '篮球', SocialRequestType.FitnessPartner, 5],
  ['gz-xiahe', '夏禾', '女', 29, '广州', '越秀-东山口', 23.123, 113.295, '东山口普拉提工作室', 'ISFP', '天蝎座', '#8B5CF6', ['普拉提', '游泳', '散步'], ['老房子咖啡', '展览', '粤菜'], ['敏感', '审美在线', '慢热'], ['改善体态', '减少焦虑'], ['舒服的女生朋友', '尊重慢热的人'], ['温柔', '干净', '不催促'], ['评价身材', '打探收入', '拍照不问'], '周一晚', '周六下午', '做室内设计，常在东山口看老建筑，运动更喜欢细水长流。', '东山口普拉提和咖啡', '基础器械课，结束后在附近公共咖啡店坐一会儿。', '普拉提', SocialRequestType.FitnessPartner, 3],
  ['nj-hanxu', '韩叙', '男', 31, '南京', '玄武-鸡鸣寺', 32.0617, 118.7969, '玄武湖跑道', 'INFJ', '处女座', '#64748B', ['玄武湖跑', '徒步', '核心训练'], ['历史书', '手账', '清淡饮食'], ['克制', '认真', '会倾听'], ['半马恢复', '睡眠稳定'], ['安静靠谱的跑友', '能慢慢熟悉的人'], ['真诚', '低调', '稳定'], ['过度热情', '问私生活', '夜间偏僻路线'], '周三 20:00', '周日清晨', '在出版社做编辑，喜欢清晨玄武湖人少的时候慢跑。', '玄武湖清晨慢跑', '一圈以内，配速 7 分左右，适合恢复和聊天。', '慢跑', SocialRequestType.RunningPartner, 5],
  ['nj-yeyu', '叶榆', '女', 26, '南京', '建邺-河西', 32.003, 118.73, '奥体中心', 'ENTP', '水瓶座', '#06B6D4', ['飞盘', '网球', '椭圆机'], ['独立电影', '桌游', '咖啡'], ['机灵', '会接梗', '边界明确'], ['提高体能', '扩大社交圈'], ['有趣但靠谱的人', '运动后能聊电影的人'], ['幽默', '尊重规则', '不油腻'], ['性别刻板玩笑', '临时改规则', '贴太近'], '周五晚', '周六傍晚', '做用户研究，喜欢观察人，也希望运动社交别太功利。', '河西飞盘新手局', '规则先讲清，强度友好，结束后可以一起买饮料。', '飞盘', SocialRequestType.Custom, 6],
  ['xa-qiaomu', '乔木', '男', 35, '西安', '雁塔-大雁塔', 34.2226, 108.959, '曲江池跑道', 'ISTP', '金牛座', '#92400E', ['骑行', '慢跑', '自由重量'], ['博物馆', '面馆', '修车'], ['沉稳', '手巧', '话不多'], ['保持腰背力量', '周末骑行'], ['靠谱骑友', '不介意安静的人'], ['稳妥', '不冒险', '会看路况'], ['危险骑行', '酒后运动', '问工作单位'], '周二晚', '周日上午', '做工业设计，周末常从曲江骑到浐灞，喜欢路线和天气都提前确认。', '曲江到浐灞轻骑行', '20km 左右，戴头盔，沿主路和绿道走，不拼速度。', '骑行', SocialRequestType.Custom, 8],
  ['xa-luyin', '陆吟', '女', 24, '西安', '碑林-小寨', 34.229, 108.945, '小寨瑜伽馆', 'ENFP', '双鱼座', '#F43F5E', ['瑜伽', '舞蹈', 'CityWalk'], ['汉服拍照', '甜品', 'livehouse'], ['明亮', '爱分享', '会照顾情绪'], ['体态改善', '认识同城女生'], ['女生运动搭子', '喜欢拍生活照片的人'], ['温柔', '不评判', '有安全意识'], ['偷拍', '强聊感情', '不尊重拒绝'], '周四晚', '周六下午', '刚毕业做新媒体，想把社交从线上拉回真实生活。', '小寨瑜伽和甜品散步', '基础流瑜伽，结束后可去商场公共区坐坐。', '瑜伽', SocialRequestType.FitnessPartner, 4],
  ['xm-shenran', '沈燃', '男', 28, '厦门', '思明-环岛路', 24.445, 118.095, '环岛路跑道', 'ENFP', '狮子座', '#F97316', ['海边跑', '桨板', '力量训练'], ['海鲜排档', '民谣', '旅行'], ['阳光', '主动', '会带路'], ['提升心肺', '保持线条'], ['爱海边运动的人', '周末能早起的人'], ['爽朗', '不拖沓', '安全意识强'], ['危险下水', '夜间陌生海滩', '过度亲密'], '周三傍晚', '周日上午', '做旅游产品，熟悉环岛路线，喜欢把运动安排得像短旅行。', '环岛路日落跑', '5km 轻松跑，公共路线，跑完可在海边买水聊天。', '海边跑', SocialRequestType.RunningPartner, 7],
  ['xm-linyue', '林悦', '女', 30, '厦门', '湖里-五缘湾', 24.526, 118.158, '五缘湾运动馆', 'ISFJ', '巨蟹座', '#2DD4BF', ['游泳', '普拉提', '快走'], ['做饭', '海边发呆', '读小说'], ['温和', '稳定', '慢热'], ['规律运动', '少熬夜'], ['稳定的同城搭子', '能尊重生活节奏的人'], ['干净', '有礼貌', '不急躁'], ['打探住址', '催联系方式', '过度评价'], '周一、周三晚', '周日傍晚', '做行政管理，喜欢把五缘湾当作下班后的缓冲区。', '五缘湾快走和拉伸', '沿湾区快走 40 分钟，结束后做拉伸，适合恢复体力。', '快走', SocialRequestType.CityWalk, 5],
].map(([key, name, gender, age, city, area, lat, lng, gym, mbti, zodiac, color, sports, lifestyle, traits, goals, wantToMeet, preferredTraits, avoidTraits, weekday, weekend, slice, title, description, activityType, requestType, radiusKm]) => ({
  key,
  name,
  gender,
  age,
  city,
  area,
  lat,
  lng,
  gym,
  mbti,
  zodiac,
  color,
  sports,
  lifestyle,
  traits,
  goals,
  wantToMeet,
  preferredTraits,
  avoidTraits,
  weekday,
  weekend,
  slice,
  title,
  description,
  activityType,
  requestType,
  radiusKm,
})) as SeedPerson[];

const generatedPeople: SeedPerson[] = Array.from({ length: 30 }, (_, index) => {
  const names = [
    '顾南星', '许知夏', '程望', '沈青禾', '梁屿', '安若', '周澈', '叶澄', '秦朗', '宋屿白',
    '陶然', '黎朵', '江野', '方知微', '孟序', '温言', '陆星河', '尹禾', '贺川', '苏念',
    '白景行', '林栀', '许听晚', '纪云深', '盛夏', '罗岚', '唐亦舟', '夏安', '顾清越', '闻璟',
  ];
  const cities = [
    ['青岛', '市北-台东', 36.087, 120.355, '台东社区健身房'],
    ['上海', '浦东-世纪公园', 31.218, 121.55, '世纪公园跑道'],
    ['北京', '东城-东四', 39.925, 116.417, '东四社区健身房'],
    ['深圳', '宝安-前海', 22.552, 113.895, '前海运动公园'],
    ['杭州', '拱墅-大运河', 30.313, 120.141, '运河体育公园'],
    ['成都', '锦江-太古里', 30.653, 104.081, '太古里乐刻'],
    ['广州', '海珠-琶洲', 23.098, 113.366, '琶洲会展公园'],
    ['南京', '秦淮-夫子庙', 32.021, 118.788, '秦淮河步道'],
    ['西安', '未央-大明宫', 34.293, 108.959, '大明宫跑道'],
    ['厦门', '集美-杏林湾', 24.606, 118.057, '杏林湾绿道'],
  ] as const;
  const sportSets = [
    ['慢跑', '核心训练', '拉伸'], ['力量训练', '划船机', '椭圆机'], ['羽毛球', '快走', '瑜伽'],
    ['骑行', '徒步', '自重训练'], ['游泳', '普拉提', '散步'], ['篮球', '短跑', '力量训练'],
  ];
  const lifeSets = [
    ['咖啡', '播客', '城市观察'], ['做饭', '植物', '读书'], ['独立电影', '展览', '书店'],
    ['创业产品', '效率工具', '早睡'], ['旅行攻略', '摄影', '小店探路'], ['桌游', 'livehouse', '夜市'],
  ];
  const traitSets = [
    ['真诚', '稳定', '守时'], ['慢热', '细腻', '有边界'], ['外向', '会带气氛', '不冒犯'],
    ['理性', '专注', '低调'], ['松弛', '爱分享', '有耐心'], ['行动派', '直接', '靠谱'],
  ];
  const city = cities[index % cities.length];
  const sports = sportSets[index % sportSets.length];
  const lifestyle = lifeSets[(index + 2) % lifeSets.length];
  const traits = traitSets[(index + 4) % traitSets.length];
  const isRun = sports.some((item) => item.includes('跑'));
  const isWalk = sports.some((item) => item.includes('散步') || item.includes('快走'));
  const requestType = isRun
    ? SocialRequestType.RunningPartner
    : isWalk
      ? SocialRequestType.CityWalk
      : SocialRequestType.FitnessPartner;
  const weekdayOptions = ['周二晚 19:30', '周三晚 20:00', '周四早 7:30', '周五晚 19:00'];
  const weekendOptions = ['周六上午', '周六傍晚', '周日上午', '周日下午'];
  const titlePrefix = isRun ? '轻松跑' : isWalk ? '快走散步' : sports[0];
  return {
    key: `living-${String(index + 21).padStart(2, '0')}`,
    name: names[index],
    gender: index % 2 === 0 ? '男' : '女',
    age: 24 + (index % 13),
    city: city[0],
    area: city[1],
    lat: city[2],
    lng: city[3],
    gym: city[4],
    mbti: ['ENFP', 'INFJ', 'ISTJ', 'ENTJ', 'ISFP', 'ENTP'][index % 6],
    zodiac: ['白羊座', '金牛座', '双子座', '巨蟹座', '天秤座', '射手座'][index % 6],
    color: ['#22C55E', '#F97316', '#3B82F6', '#EC4899', '#14B8A6', '#A855F7'][index % 6],
    sports,
    lifestyle,
    traits,
    goals: ['规律运动', index % 3 === 0 ? '减脂塑形' : '提高心肺'],
    wantToMeet: ['同城运动搭子', '能自然聊天的朋友'],
    preferredTraits: ['守时', '尊重边界', '情绪稳定'],
    avoidTraits: ['临时放鸽子', '索要联系方式', '第一次见面去私密场所'],
    weekday: weekdayOptions[index % weekdayOptions.length],
    weekend: weekendOptions[index % weekendOptions.length],
    slice: `平时在${city[1].split('-')[1]}附近活动，喜欢把${sports[0]}和${lifestyle[0]}放进日常，不追求社交效率，更看重舒服和长期。`,
    title: `${city[1].split('-')[1]}${titlePrefix}搭子`,
    description: `${weekdayOptions[index % weekdayOptions.length]}出发，强度可商量，优先公共路线和公开场馆，结束后可以简单拉伸或买水。`,
    activityType: titlePrefix,
    requestType,
    radiusKm: 4 + (index % 4),
  };
});

const seedPeople = [...people, ...morePeople, ...generatedPeople];

function ageRange(age: number) {
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  return '35-44';
}

function daysFromNow(days: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function profileCard(person: SeedPerson) {
  return {
    basic: {
      nickname: person.name,
      city: person.city,
      ageRange: ageRange(person.age),
      gender: person.gender,
      zodiac: person.zodiac,
    },
    personality: {
      mbti: person.mbti,
      traits: person.traits,
      socialStyle: person.traits.includes('慢热') ? '慢热但真诚' : '自然主动',
      communicationStyle: '站内先聊清楚时间、地点和边界',
    },
    interests: {
      sports: person.sports,
      lifestyle: person.lifestyle,
      socialScenes: ['同城约练', '公共场所轻社交'],
    },
    preferences: {
      wantToMeet: person.wantToMeet,
      preferredTraits: person.preferredTraits,
      avoid: person.avoidTraits,
    },
    relationshipIntent: {
      goals: person.goals,
      openness: 'medium',
    },
    availability: {
      weekdays: person.weekday,
      weekends: person.weekend,
    },
    visibility: {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: false,
    },
    matchSignals: matchSignals(person),
    summary: `${person.slice} 适合${person.sports.slice(0, 2).join('、')}，偏好${person.preferredTraits.slice(0, 2).join('、')}的同城连接。`,
  };
}

function matchSignals(person: SeedPerson) {
  return {
    publicTags: [...person.sports, ...person.traits.slice(0, 2), person.city],
    privatePreferenceTags: [...person.wantToMeet, ...person.preferredTraits],
    sensitivePrivateTags: ['工作单位不公开', '联系方式不公开'],
    matchKeywords: [...person.sports, ...person.lifestyle, ...person.goals],
    confidence: 0.82,
    source: SEED_KEY,
  };
}

async function main() {
  if (seedPeople.length !== 50) {
    throw new Error(`Expected 50 seed people, got ${seedPeople.length}`);
  }

  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);
  const profileRepo = dataSource.getRepository(UserSocialProfile);
  const requestRepo = dataSource.getRepository(UserSocialRequest);
  const password = await bcrypt.hash(PASSWORD, 10);

  let usersUpserted = 0;
  let profilesUpserted = 0;
  let requestsUpserted = 0;

  for (const [index, person] of seedPeople.entries()) {
    const email = `${person.key}@fitmeet.local`;
    const user =
      (await userRepo.findOne({ where: { email } })) ??
      userRepo.create({ email, password });

    Object.assign(user, {
      password: user.password || password,
      name: person.name,
      avatar: person.name.slice(0, 1),
      color: person.color,
      gender: person.gender,
      age: person.age,
      city: person.city,
      lat: person.lat,
      lng: person.lng,
      locationUpdatedAt: new Date(),
      acceptNearbyMatch: true,
      gym: person.gym,
      bio: person.slice,
      singleCert: index % 5 === 0,
      verified: index % 3 !== 0,
      interestTags: [...person.sports, ...person.lifestyle].slice(0, 8),
      trainingDays: 90 + index * 7,
      trainingCount: 18 + index * 3,
      caloriesBurned: 18000 + index * 950,
      bestRecords: [{ name: person.sports[0] ?? '运动', value: person.title }],
      isCoach: false,
      trustScore: 8 + (index % 12),
      socialTrustCount: 1 + (index % 5),
    });
    const savedUser = await userRepo.save(user);
    usersUpserted += 1;

    const card = profileCard(person);
    await profileRepo.save(
      profileRepo.create({
        userId: savedUser.id,
        gender: person.gender,
        nickname: person.name,
        ageRange: ageRange(person.age),
        city: person.city,
        zodiac: person.zodiac,
        mbti: person.mbti,
        traits: person.traits,
        socialStyle: card.personality.socialStyle,
        communicationStyle: card.personality.communicationStyle,
        nearbyArea: person.area,
        fitnessGoals: person.goals,
        interestTags: [...person.sports, ...person.lifestyle].slice(0, 10),
        lifestyleTags: person.lifestyle,
        socialScenes: ['同城约练', '站内先聊', '公共场馆'],
        wantToMeet: person.wantToMeet,
        preferredTraits: person.preferredTraits,
        avoidTraits: person.avoidTraits,
        relationshipGoals: person.goals,
        openness: 'medium',
        availableTimes: [person.weekday, person.weekend],
        weekdayAvailability: person.weekday,
        weekendAvailability: person.weekend,
        socialPreference: '先站内沟通，再确认公共地点和运动强度。',
        rejectRules: person.avoidTraits.join('；'),
        privacyBoundary: '不公开手机号、微信、精确住址、工作单位和收入信息。',
        profileDiscoverable: true,
        agentCanRecommendMe: true,
        agentCanStartChatAfterApproval: false,
        hideSensitiveTags: true,
        aiSummary: card.summary,
        aiProfileCard: card,
        matchSignals: card.matchSignals,
        sensitiveTagDecisions: {
          工作单位不公开: { status: 'hidden', category: 'identity' },
          联系方式不公开: { status: 'hidden', category: 'contact' },
        },
      }),
    );
    profilesUpserted += 1;

    const existingRequest = await requestRepo
      .createQueryBuilder('request')
      .where('request.userId = :userId', { userId: savedUser.id })
      .andWhere("request.metadata ->> 'seedKey' = :seedKey", { seedKey: SEED_KEY })
      .andWhere("request.metadata ->> 'personKey' = :personKey", { personKey: person.key })
      .getOne();
    const request = existingRequest ?? requestRepo.create({ userId: savedUser.id });
    const start = daysFromNow(2 + (index % 18), index % 4 === 0 ? 8 : index % 4 === 1 ? 14 : 19);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    Object.assign(request, {
      userId: savedUser.id,
      agentId: null,
      source: SocialRequestSource.Manual,
      type: person.requestType,
      title: person.title,
      description: person.description,
      rawText: `${person.title}。${person.description} ${person.slice}`,
      city: person.city,
      lat: person.lat,
      lng: person.lng,
      radiusKm: person.radiusKm,
      timeStart: start,
      timeEnd: end,
      genderPreference: SocialRequestGenderPreference.Any,
      ageMin: Math.max(18, person.age - 6),
      ageMax: Math.min(45, person.age + 8),
      interestTags: [...person.sports, ...person.lifestyle].slice(0, 8),
      activityType: person.activityType,
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      agentAllowed: true,
      requireUserConfirmation: true,
      status: UserSocialRequestStatus.Matching,
      visibility: SocialRequestVisibility.Public,
      metadata: {
        seedKey: SEED_KEY,
        personKey: person.key,
        lifeSlice: person.slice,
        publicPlaceOnly: true,
        confirmationPolicy: 'all_outbound_actions_require_owner_confirmation',
      },
      expiresAt: daysFromNow(30 + (index % 10), 23),
    });
    await requestRepo.save(request);
    requestsUpserted += 1;
  }

  await dataSource.destroy();
  console.log(
    `[${SEED_KEY}] users=${usersUpserted}, profiles=${profilesUpserted}, requests=${requestsUpserted}, password=${PASSWORD}`,
  );
}

main().catch(async (error) => {
  console.error(error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
