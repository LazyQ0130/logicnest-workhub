import {
  DisconnectOutlined,
  LockOutlined,
  ReloadOutlined,
  SearchOutlined,
  UnlockOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';
import {
  AccountStatus,
  Permission,
  type ManagedDevice,
  type PageResponse,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorPanel, EmptyPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { formatDateTime, formatRelativeStatus, maskIdentifier } from '../utils/format';
import { errorMessage } from '../utils/ui';

const PAGE_SIZE = 20;

export function DevicesPage() {
  const { modal, message } = App.useApp();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.DevicesWrite);
  const [devices, setDevices] = useState<PageResponse<ManagedDevice>>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AccountStatus>();
  const [online, setOnline] = useState<boolean>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (page = devices.page, pageSize = devices.pageSize) => {
    setLoading(true);
    setError(undefined);
    try {
      setDevices(await adminApi.devices({ page, pageSize, search, status, online }));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [devices.page, devices.pageSize, online, search, status]);

  useEffect(() => {
    void load(1, PAGE_SIZE);
    // Filters intentionally reset to the first page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, search, status]);

  const action = (device: ManagedDevice, kind: 'status' | 'unbind' | 'invalidate') => {
    if (kind === 'status') {
      const next = device.status === AccountStatus.Active ? AccountStatus.Suspended : AccountStatus.Active;
      modal.confirm({
        title: next === AccountStatus.Suspended ? '封停此设备？' : '解封此设备？',
        content: next === AccountStatus.Suspended ? '封停后设备授权会在下一次心跳时失效。' : '解封后设备可在账号与会员均正常时恢复使用。',
        okText: next === AccountStatus.Suspended ? '确认封停' : '确认解封',
        okButtonProps: { danger: next === AccountStatus.Suspended },
        onOk: async () => {
          await adminApi.setDeviceStatus(device.id, next);
          message.success(next === AccountStatus.Suspended ? '设备已封停' : '设备已解封');
          await load();
        },
      });
      return;
    }
    if (kind === 'unbind') {
      modal.confirm({
        title: '解除设备绑定？',
        content: '该操作会同时使现有会话失效，且会写入审计日志。',
        okText: '确认解绑',
        okButtonProps: { danger: true },
        onOk: async () => {
          await adminApi.unbindDevice(device.id);
          message.success('设备绑定已解除');
          await load();
        },
      });
      return;
    }
    modal.confirm({
      title: '强制会话失效？',
      content: '设备需要重新登录或重新完成授权校验。',
      okText: '确认失效',
      okButtonProps: { danger: true },
      onOk: async () => {
        await adminApi.invalidateDeviceSessions(device.id);
        message.success('设备会话已失效');
        await load();
      },
    });
  };

  const columns: TableProps<ManagedDevice>['columns'] = [
    {
      title: '设备摘要', key: 'device', width: 240,
      render: (_, record) => <div className="table-primary-cell"><Typography.Text strong>{maskIdentifier(record.fingerprintPreview || record.fingerprintDigest || record.id)}</Typography.Text><Typography.Text type="secondary">{record.uid ? `UID ${record.uid}` : '未返回 UID'}</Typography.Text></div>,
    },
    { title: '状态', key: 'status', render: (_, record) => <Space>{record.status === AccountStatus.Active ? <Tag color="success">正常</Tag> : <Tag color="error">已封停</Tag>}{record.online ? <Tag color="success" icon={<WifiOutlined />}>在线</Tag> : <Tag>离线</Tag>}</Space> },
    { title: '绑定时间', dataIndex: 'boundAt', key: 'boundAt', render: (value: string | null) => formatDateTime(value) },
    { title: '最后在线', dataIndex: 'lastSeenAt', key: 'lastSeenAt', render: (value: string | null, record) => <Space>{formatDateTime(value)}{formatRelativeStatus(record.online, value).label === '在线' && <span className="online-pulse" />}</Space> },
    { title: '客户端版本', dataIndex: 'clientVersion', key: 'clientVersion', render: (value: string | null) => value || '-' },
    { title: '最近 IP', dataIndex: 'lastIp', key: 'lastIp', render: (value: string | null) => value || '-' },
    ...(canWrite ? [{
      title: '操作', key: 'actions', width: 260,
      render: (_: unknown, record: ManagedDevice) => <Space size={4} wrap>
        <Button size="small" icon={record.status === AccountStatus.Active ? <LockOutlined /> : <UnlockOutlined />} danger={record.status === AccountStatus.Active} onClick={() => action(record, 'status')}>{record.status === AccountStatus.Active ? '封停' : '解封'}</Button>
        <Button size="small" icon={<DisconnectOutlined />} onClick={() => action(record, 'unbind')}>解绑</Button>
        <Button size="small" danger onClick={() => action(record, 'invalidate')}>失效会话</Button>
      </Space>,
    }] : []),
  ];

  return (
    <div className="page-stack">
      <PageIntro eyebrow="授权边界" title="设备" description="在线状态按心跳超时计算。封停、解绑或强制会话失效会在下一次客户端校验窗口生效。" actions={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>} />
      <Panel className="filter-panel">
        <Form layout="inline" onFinish={() => setSearch(searchInput.trim())}>
          <Form.Item label="搜索"><Input allowClear value={searchInput} onChange={(event) => setSearchInput(event.target.value)} prefix={<SearchOutlined />} placeholder="设备摘要 / UID / IP" style={{ width: 250 }} /></Form.Item>
          <Form.Item label="设备状态"><Select allowClear value={status} onChange={setStatus} placeholder="全部状态" style={{ width: 140 }} options={[{ value: AccountStatus.Active, label: '正常' }, { value: AccountStatus.Suspended, label: '已封停' }]} /></Form.Item>
          <Form.Item label="在线"><Select allowClear value={online} onChange={setOnline} placeholder="全部" style={{ width: 120 }} options={[{ value: true, label: '在线' }, { value: false, label: '离线' }]} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button></Form.Item>
        </Form>
      </Panel>
      <Panel className="table-panel">
        {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : <Table<ManagedDevice> rowKey="id" loading={loading} columns={columns} dataSource={devices.items} scroll={{ x: 1100 }} locale={{ emptyText: <EmptyPanel description="没有符合条件的设备" /> }} pagination={{ current: devices.page, pageSize: devices.pageSize, total: devices.total, showSizeChanger: true, showTotal: (total) => `共 ${total} 台设备`, onChange: (page, pageSize) => void load(page, pageSize) }} />}
      </Panel>
    </div>
  );
}
