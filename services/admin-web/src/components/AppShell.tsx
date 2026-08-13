import {
  AuditOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DesktopOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Button,
  Dropdown,
  Layout,
  Menu,
  Space,
  Tooltip,
  Typography,
  type MenuProps,
} from 'antd';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BRAND, APP_TITLE } from '../brand';
import { useAuth } from '../auth/AuthContext';
import { OPERATIONS_NAV_ITEMS, OPERATIONS_PAGE_TITLES } from '../operationsUi';

const { Header, Sider, Content } = Layout;

function BrandMark({ collapsed }: { collapsed: boolean }) {
  const [logoAvailable, setLogoAvailable] = useState(true);
  return (
    <div className={`brand-mark ${collapsed ? 'brand-mark-collapsed' : ''}`}>
      {logoAvailable ? (
        <img
          src={BRAND.logoSource}
          alt={BRAND.chineseName}
          onError={() => setLogoAvailable(false)}
        />
      ) : (
        <span className="brand-fallback" aria-hidden="true">
          逻
        </span>
      )}
      {!collapsed && (
        <span className="brand-wordmark">
          <strong>{BRAND.chineseName}</strong>
          <small>{BRAND.englishName}</small>
        </span>
      )}
    </div>
  );
}

const NAV_ICONS: Record<string, ReactNode> = {
  '/dashboard': <DashboardOutlined />,
  '/users': <TeamOutlined />,
  '/plans': <KeyOutlined />,
  '/devices': <ClusterOutlined />,
  '/catalog': <AppstoreOutlined />,
  '/desktop-releases': <DesktopOutlined />,
  '/audit-logs': <AuditOutlined />,
};

const NAV_ITEMS = OPERATIONS_NAV_ITEMS.map((item) => ({
  ...item,
  icon: NAV_ICONS[item.key],
}));

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logout, hasPermission } = useAuth();

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      NAV_ITEMS.filter((item) => hasPermission(item.permission)).map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
      })),
    [hasPermission],
  );

  useEffect(() => {
    document.title = `${OPERATIONS_PAGE_TITLES[location.pathname] || BRAND.adminTitle} · ${BRAND.adminTitle}`;
  }, [location.pathname]);

  const selectedKey =
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key ||
    '/dashboard';

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
  };

  const userMenu: MenuProps['items'] = [
    {
      key: 'identity',
      disabled: true,
      label: (
        <div className="identity-menu-item">
          <strong>{admin?.username}</strong>
          <span>{admin?.role}</span>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    },
  ];

  const onUserMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (key !== 'logout') return;
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={72}
        trigger={null}
      >
        <div className="sider-topline">
          <BrandMark collapsed={collapsed} />
          <Tooltip title={collapsed ? '展开导航' : '收起导航'}>
            <Button
              type="text"
              className="collapse-button"
              aria-label={collapsed ? '展开导航' : '收起导航'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
          </Tooltip>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
        />
        <div className="sider-footer">
          <SafetyCertificateOutlined />
          {!collapsed && <span>关键操作留痕</span>}
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-title-wrap">
            <Typography.Title level={4} className="header-title">
              {OPERATIONS_PAGE_TITLES[location.pathname] || BRAND.adminTitle}
            </Typography.Title>
          </div>
          <Dropdown menu={{ items: userMenu, onClick: onUserMenuClick }} trigger={['click']}>
            <Button type="text" className="account-button">
              <Avatar size={30} icon={<UserOutlined />} />
              <span className="account-name">{admin?.username}</span>
            </Button>
          </Dropdown>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
        <footer className="app-footer">
          <Space size={6}>
            <span>{APP_TITLE}</span>
            <span aria-hidden="true">·</span>
            <span>关键操作将记录审计日志</span>
          </Space>
        </footer>
      </Layout>
    </Layout>
  );
}
