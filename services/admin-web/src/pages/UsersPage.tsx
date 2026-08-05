import {
  CheckOutlined,
  EyeOutlined,
  LockOutlined,
  ReloadOutlined,
  SearchOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
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
  type DeviceSummary,
  type ManagedUser,
  type PageResponse,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorPanel, LoadingPanel, EmptyPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { formatDateTime, formatPhone, maskIdentifier } from '../utils/format';
import { errorMessage } from '../utils/ui';

const PAGE_SIZE = 20;

function statusTag(status: AccountStatus) {
  return status === AccountStatus.Active ? (
    <Tag color="success">正常</Tag>
  ) : (
    <Tag color="error">已封停</Tag>
  );
}

function membershipFor(user: ManagedUser) {
  return user.membership || user.entitlement;
}

function membershipPlanLabel(user: ManagedUser): string {
  const membership = membershipFor(user);
  if (!membership) return '未激活';
  if (typeof membership.plan === 'string') return membership.plan;
  return membership.plan?.name || membership.plan?.code || membership.planName || membership.planCode || membership.status;
}

export function UsersPage() {
  const { modal, message } = App.useApp();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.UsersWrite);
  const [users, setUsers] = useState<PageResponse<ManagedUser>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<AccountStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<ManagedUser>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser>();
  const [resetForm] = Form.useForm<{ newPassword: string }>();

  const loadUsers = useCallback(
    async (page = users.page, pageSize = users.pageSize) => {
      setLoading(true);
      setError(undefined);
      try {
        const response = await adminApi.users({ page, pageSize, search, status });
        setUsers(response);
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [search, status, users.page, users.pageSize],
  );

  useEffect(() => {
    void loadUsers(1, PAGE_SIZE);
    // The filters are the deliberate inputs for this request; pagination is
    // reset when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const openDetail = async (user: ManagedUser) => {
    setDetailId(user.id);
    setDetail(user);
    setDetailLoading(true);
    try {
      setDetail(await adminApi.user(user.id));
    } catch (detailError) {
      message.error(errorMessage(detailError));
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = (user: ManagedUser) => {
    const nextStatus =
      user.status === AccountStatus.Active
        ? AccountStatus.Suspended
        : AccountStatus.Active;
    modal.confirm({
      title: nextStatus === AccountStatus.Suspended ? '封停此用户？' : '恢复此用户？',
      content:
        nextStatus === AccountStatus.Suspended
          ? '封停后，该用户的客户端授权将在下一次心跳时失效。'
          : '恢复后，该用户可在设备状态正常且会员有效时继续使用。',
      okText: nextStatus === AccountStatus.Suspended ? '确认封停' : '确认恢复',
      okButtonProps: { danger: nextStatus === AccountStatus.Suspended },
      onOk: async () => {
        await adminApi.setUserStatus(user.id, nextStatus);
        message.success(nextStatus === AccountStatus.Suspended ? '用户已封停' : '用户已恢复');
        await loadUsers();
        if (detailId === user.id) setDetail((current) => current && { ...current, status: nextStatus });
      },
    });
  };

  const submitResetPassword = async ({ newPassword }: { newPassword: string }) => {
    if (!resetUser) return;
    await adminApi.resetUserPassword(resetUser.id, newPassword);
    message.success('临时密码已重置，请通过安全渠道交付给用户');
    setResetUser(undefined);
    resetForm.resetFields();
  };

  const resetPassword = (user: ManagedUser) => {
    setResetUser(user);
    resetForm.resetFields();
  };

  const unbindDevice = (user: ManagedUser, device?: DeviceSummary) => {
    modal.confirm({
      title: '解除设备绑定？',
      content: '解除后，该设备的现有会话会失效，用户下次登录需要重新完成设备绑定。',
      okText: '确认解除',
      okButtonProps: { danger: true },
      onOk: async () => {
        await adminApi.unbindUserDevice(user.id, device?.id);
        message.success('设备绑定已解除');
        if (detailId === user.id) await openDetail(user);
        await loadUsers();
      },
    });
  };

  const columns: TableProps<ManagedUser>['columns'] = [
      {
        title: 'UID',
        dataIndex: 'uid',
        key: 'uid',
        render: (value: string) => <Typography.Text copyable>{value}</Typography.Text>,
      },
      {
        title: '手机号',
        key: 'phone',
        render: (_, record) => <Typography.Text copyable>{formatPhone(record.phone)}</Typography.Text>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        render: (value: AccountStatus) => statusTag(value),
      },
      {
        title: '会员到期',
        key: 'membership',
        render: (_, record) => {
          const membership = membershipFor(record);
          return membership?.expiresAt ? formatDateTime(membership.expiresAt) : <Tag>未激活</Tag>;
        },
      },
      {
        title: '最后在线',
        dataIndex: 'lastSeenAt',
        key: 'lastSeenAt',
        render: (value: string | null, record) => formatDateTime(value || record.lastOnlineAt),
      },
      {
        title: '客户端',
        dataIndex: 'clientVersion',
        key: 'clientVersion',
        render: (value: string | null) => value || '-',
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 220,
        render: (_, record) => (
          <Space size={4} wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record)}>
              详情
            </Button>
            {canWrite && (
              <>
                <Button
                  size="small"
                  icon={record.status === AccountStatus.Active ? <LockOutlined /> : <UnlockOutlined />}
                  danger={record.status === AccountStatus.Active}
                  onClick={() => updateStatus(record)}
                >
                  {record.status === AccountStatus.Active ? '封停' : '恢复'}
                </Button>
                <Button size="small" onClick={() => resetPassword(record)}>
                  重置密码
                </Button>
              </>
            )}
          </Space>
        ),
      },
  ];

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="账号与会员"
        title="用户"
        description="查看账号状态、会员授权和设备绑定；管理员可查看完整手机号。"
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void loadUsers()} loading={loading}>
            刷新
          </Button>
        }
      />
      <Panel className="filter-panel">
        <Form
          layout="inline"
          onFinish={() => {
            setSearch(searchInput.trim());
          }}
        >
          <Form.Item label="搜索">
            <Input
              allowClear
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="UID 或完整手机号"
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              allowClear
              value={status}
              onChange={(value) => setStatus(value)}
              placeholder="全部状态"
              style={{ width: 140 }}
              options={[
                { value: AccountStatus.Active, label: '正常' },
                { value: AccountStatus.Suspended, label: '已封停' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Panel>
      <Panel className="table-panel">
        {error ? (
          <ErrorPanel message={error} onRetry={() => void loadUsers()} />
        ) : (
          <Table<ManagedUser>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={users.items}
            scroll={{ x: 1100 }}
            locale={{ emptyText: <EmptyPanel description="没有符合条件的用户" /> }}
            pagination={{
              current: users.page,
              pageSize: users.pageSize,
              total: users.total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 个用户`,
              onChange: (page, pageSize) => void loadUsers(page, pageSize),
            }}
          />
        )}
      </Panel>

      <Drawer
        title="用户详情"
        open={Boolean(detailId)}
        onClose={() => setDetailId(undefined)}
        width={520}
        destroyOnHidden
      >
        {detailLoading && !detail ? (
          <LoadingPanel />
        ) : detail ? (
          <div className="detail-stack">
            <div className="detail-hero">
              <div className="detail-avatar">{detail.uid.slice(-2)}</div>
              <div>
                <Typography.Title level={4}>{detail.uid}</Typography.Title>
                <Space>{statusTag(detail.status)}<Typography.Text copyable>{formatPhone(detail.phone)}</Typography.Text></Space>
              </div>
            </div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="注册时间">{formatDateTime(detail.registeredAt || detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="最后登录">{formatDateTime(detail.lastLoginAt)}</Descriptions.Item>
              <Descriptions.Item label="最后在线">{formatDateTime(detail.lastSeenAt || detail.lastOnlineAt)}</Descriptions.Item>
              <Descriptions.Item label="客户端版本">{detail.clientVersion || '-'}</Descriptions.Item>
              <Descriptions.Item label="会员状态">
                {membershipPlanLabel(detail)}
              </Descriptions.Item>
              <Descriptions.Item label="到期时间">{formatDateTime(membershipFor(detail)?.expiresAt)}</Descriptions.Item>
            </Descriptions>
            <div>
              <Typography.Title level={5}>绑定设备</Typography.Title>
              {detail.devices?.length ? detail.devices.map((device) => (
                <div className="device-row" key={device.id}>
                  <div>
                    <Typography.Text strong>{maskIdentifier(device.fingerprintPreview || device.fingerprintHint || device.fingerprintDigest || device.id)}</Typography.Text>
                    <Typography.Text type="secondary" className="device-row-meta">
                      {device.clientVersion || '-'} · 最后在线 {formatDateTime(device.lastSeenAt)}
                    </Typography.Text>
                  </div>
                  {canWrite && <Button size="small" danger onClick={() => unbindDevice(detail, device)}>解除绑定</Button>}
                </div>
              )) : <EmptyPanel description="暂无绑定设备" />}
            </div>
            {canWrite && <Button
              block
              danger={detail.status === AccountStatus.Active}
              icon={detail.status === AccountStatus.Active ? <LockOutlined /> : <CheckOutlined />}
              onClick={() => updateStatus(detail)}
            >
              {detail.status === AccountStatus.Active ? '封停用户' : '恢复用户'}
            </Button>}
          </div>
        ) : null}
      </Drawer>

      <Modal
        title="重置用户密码"
        open={Boolean(resetUser)}
        onCancel={() => setResetUser(undefined)}
        destroyOnHidden
        footer={null}
      >
        <Typography.Paragraph type="secondary">
          为 {resetUser?.uid} 设置一次性临时密码。密码不会在审计日志中记录。
        </Typography.Paragraph>
        <Form form={resetForm} layout="vertical" onFinish={(values) => void submitResetPassword(values)}>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '密码至少 8 位' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>确认重置</Button>
        </Form>
      </Modal>
    </div>
  );
}
