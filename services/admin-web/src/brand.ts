export const BRAND = {
  chineseName: '逻栖工枢',
  englishName: 'LogicNest WorkHub',
  productSlug: 'logicnest-workhub',
  adminTitle: '逻栖工枢 · 运营中心',
  /**
   * 由品牌资产流程将甲方确认的原样 PNG 放入仓库 assets/brand 后生效。
   * 不在管理后台中裁切、重绘、换色或生成 Logo 变体。
   */
  logoSource: '/logicnest-logo-reference.jpg',
  colors: {
    ink950: '#111111',
    ink900: '#181818',
    ink800: '#242424',
    ink700: '#303030',
    neutral500: '#52525b',
    neutral400: '#71717a',
    warning: '#a16207',
    surface: '#f7f7f5',
    text: '#18181b',
  },
} as const;

export const APP_TITLE = BRAND.adminTitle;
