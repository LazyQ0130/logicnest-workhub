import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Button, Col, Row, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/adminApi';
import type { DashboardStats } from '../api/types';
import { Permission } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorPanel, LoadingPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { errorMessage } from '../utils/ui';

const STAT_CONFIG = [
  {
    key: 'registeredUsers' as const,
    label: '注册用户',
    hint: '累计创建账号',
    icon: <TeamOutlined />,
  },
  {
    key: 'activeEntitlements' as const,
    label: '有效会员',
    hint: '当前未过期授权',
    icon: <CheckCircleOutlined />,
  },
  {
    key: 'newUsersToday' as const,
    label: '今日新增',
    hint: '今日注册用户',
    icon: <UserAddOutlined />,
  },
  {
    key: 'onlineDevices' as const,
    label: '在线设备',
    hint: '按心跳超时计算',
    icon: <CloudServerOutlined />,
  },
  {
    key: 'expiringSoon' as const,
    label: '即将到期',
    hint: '近 7 天内到期',
    icon: <ClockCircleOutlined />,
  },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [stats, setStats] = useState<DashboardStats>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setStats(await adminApi.dashboard());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="运营概览"
        title="运营概览"
        description="掌握账号、会员授权与设备在线状态，敏感动作均可在审计日志中追溯。"
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新数据
          </Button>
        }
      />
      {error ? (
        <Panel>
          <ErrorPanel message={error} onRetry={() => void load()} />
        </Panel>
      ) : loading && !stats ? (
        <Panel>
          <LoadingPanel />
        </Panel>
      ) : (
        <Row gutter={[16, 16]}>
          {STAT_CONFIG.map((item) => (
            <Col key={item.key} xs={24} sm={12} xl={24 / STAT_CONFIG.length}>
              <div className="stat-card">
                <div className="stat-card-top">
                  <span className="stat-icon">{item.icon}</span>
                  <Tag bordered={false}>{item.hint}</Tag>
                </div>
                <Statistic title={item.label} value={stats?.[item.key] ?? 0} />
              </div>
            </Col>
          ))}
        </Row>
      )}
      <Panel className="dashboard-welcome">
        <div className="welcome-icon">
          <CalendarOutlined />
        </div>
        <div>
          <Typography.Title level={4}>今天也保持清晰可控</Typography.Title>
          <Typography.Paragraph>
            建议定期查看即将到期会员与异常设备，封停、解绑和重置密码等操作会自动留下审计记录。
          </Typography.Paragraph>
        </div>
      </Panel>
      <Panel className="quick-actions">
        <div className="panel-heading">
          <div>
            <Typography.Title level={4}>快捷入口</Typography.Title>
            <Typography.Text type="secondary">从常用运营动作开始</Typography.Text>
          </div>
        </div>
        <div className="quick-action-grid">
          {hasPermission(Permission.UsersRead) && (
            <Button className="quick-action" onClick={() => navigate('/users')}>
              <TeamOutlined />
              <span>查找用户</span>
              <ArrowRightOutlined />
            </Button>
          )}
          {hasPermission(Permission.LicenseKeysWrite) && (
            <Button className="quick-action" onClick={() => navigate('/plans?tab=keys')}>
              <KeyIcon />
              <span>生成卡密</span>
              <ArrowRightOutlined />
            </Button>
          )}
          {hasPermission(Permission.DevicesRead) && (
            <Button className="quick-action" onClick={() => navigate('/devices')}>
              <CloudServerOutlined />
              <span>检查设备</span>
              <ArrowRightOutlined />
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function KeyIcon() {
  return <span className="inline-key-icon">⌁</span>;
}
