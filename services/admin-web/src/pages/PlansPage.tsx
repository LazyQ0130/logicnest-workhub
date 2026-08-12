import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  type TableProps,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { adminApi } from '../api/adminApi';
import {
  type GenerateKeysResponse,
  type LicenseKeyRecord,
  LicenseKeyStatus,
  LicenseMode,
  type LicensePolicy,
  type MembershipPlan,
  type PageResponse,
  Permission,
  PlanStatus,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { downloadText, formatDateTime, normalizeGeneratedKeys } from '../utils/format';
import { errorMessage } from '../utils/ui';

interface PlanFormValues {
  code: string;
  name: string;
  durationDays: number;
}

interface GenerateFormValues {
  planId: string;
  count: number;
  expiresAt?: Dayjs;
}

function planStatusTag(status: PlanStatus) {
  return status === PlanStatus.Active ? (
    <Tag color="success">启用</Tag>
  ) : (
    <Tag color="default">已停用</Tag>
  );
}

function keyStatusTag(status: LicenseKeyStatus) {
  const map: Record<LicenseKeyStatus, { color: string; label: string }> = {
    [LicenseKeyStatus.Unused]: { color: 'blue', label: '未使用' },
    [LicenseKeyStatus.Redeemed]: { color: 'success', label: '已兑换' },
    [LicenseKeyStatus.Revoked]: { color: 'error', label: '已吊销' },
    [LicenseKeyStatus.Expired]: { color: 'default', label: '已过期' },
  };
  const item = map[status] || { color: 'default', label: status };
  return <Tag color={item.color}>{item.label}</Tag>;
}

export function PlansPage() {
  const { hasPermission } = useAuth();
  const canWritePlans = hasPermission(Permission.PlansWrite);
  const canReadKeys = hasPermission(Permission.LicenseKeysRead);
  const canWriteKeys = hasPermission(Permission.LicenseKeysWrite);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'keys' ? 'keys' : 'plans',
  );
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string>();
  const [editingPlan, setEditingPlan] = useState<MembershipPlan>();
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planForm] = Form.useForm<PlanFormValues>();
  const [keys, setKeys] = useState<PageResponse<LicenseKeyRecord>>({
    items: [], total: 0, page: 1, pageSize: 20,
  });
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState<string>();
  const [keySearchInput, setKeySearchInput] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [keyStatus, setKeyStatus] = useState<LicenseKeyStatus>();
  const [keyPlanId, setKeyPlanId] = useState<string>();
  const [keyBatchId, setKeyBatchId] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm] = Form.useForm<GenerateFormValues>();
  const [generated, setGenerated] = useState<GenerateKeysResponse>();
  const [licensePolicy, setLicensePolicy] = useState<LicensePolicy>();
  const [policyLoading, setPolicyLoading] = useState(true);
  const { modal, message } = App.useApp();

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(undefined);
    try {
      const response = await adminApi.plans();
      setPlans(Array.isArray(response) ? response : (response as unknown as { items: MembershipPlan[] }).items || []);
    } catch (loadError) {
      setPlansError(errorMessage(loadError));
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadLicensePolicy = useCallback(async () => {
    setPolicyLoading(true);
    try {
      setLicensePolicy(await adminApi.licensePolicy());
    } catch (loadError) {
      message.error(errorMessage(loadError));
    } finally {
      setPolicyLoading(false);
    }
  }, [message]);

  const loadKeys = useCallback(async (page = keys.page, pageSize = keys.pageSize) => {
    setKeysLoading(true);
    setKeysError(undefined);
    try {
      setKeys(await adminApi.licenseKeys({ page, pageSize, search: keySearch, status: keyStatus, planId: keyPlanId, batchId: keyBatchId.trim() }));
    } catch (loadError) {
      setKeysError(errorMessage(loadError));
    } finally {
      setKeysLoading(false);
    }
  }, [keyBatchId, keyPlanId, keySearch, keyStatus, keys.page, keys.pageSize]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);
  useEffect(() => { void loadLicensePolicy(); }, [loadLicensePolicy]);
  useEffect(() => {
    if (activeTab === 'keys' && canReadKeys) void loadKeys(1, 20);
    // Filters intentionally reset page; adding loadKeys here would also make
    // the effect react to the response's pagination state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canReadKeys, keyPlanId, keySearch, keyStatus, keyBatchId]);

  const openCreatePlan = () => {
    setEditingPlan(undefined);
    planForm.resetFields();
    setPlanModalOpen(true);
  };

  const openEditPlan = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    planForm.setFieldsValue({ code: plan.code, name: plan.name, durationDays: plan.durationDays });
    setPlanModalOpen(true);
  };

  const savePlan = async (values: PlanFormValues) => {
    if (editingPlan) {
      await adminApi.updatePlan(editingPlan.id, { name: values.name.trim(), durationDays: values.durationDays });
      message.success('套餐已更新');
    } else {
      await adminApi.createPlan({ code: values.code.trim().toUpperCase(), name: values.name.trim(), durationDays: values.durationDays });
      message.success('套餐已创建');
    }
    setPlanModalOpen(false);
    await loadPlans();
  };

  const togglePlan = (plan: MembershipPlan) => {
    const next = plan.status === PlanStatus.Active ? PlanStatus.Disabled : PlanStatus.Active;
    modal.confirm({
      title: next === PlanStatus.Active ? '启用此套餐？' : '停用此套餐？',
      content: next === PlanStatus.Disabled ? '停用后不能生成新的卡密，已兑换会员不受影响。' : '启用后可以继续生成此套餐卡密。',
      okText: next === PlanStatus.Active ? '启用' : '停用',
      onOk: async () => {
        await adminApi.updatePlan(plan.id, { status: next });
        message.success(next === PlanStatus.Active ? '套餐已启用' : '套餐已停用');
        await loadPlans();
      },
    });
  };

  const updateLicenseMode = async (mode: LicenseMode) => {
    await adminApi.updateLicensePolicy(mode);
    setLicensePolicy({ mode });
    message.success('授权模式已更新');
  };

  const deletePlan = (plan: MembershipPlan) => {
    modal.confirm({
      title: '删除此套餐？',
      content: '只有从未关联卡密或授权的套餐可以删除；正常运营建议使用停用。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        await adminApi.deletePlan(plan.id);
        message.success('套餐已删除');
        await loadPlans();
      },
    });
  };

  const planColumns: TableProps<MembershipPlan>['columns'] = [
    { title: '代码', dataIndex: 'code', key: 'code', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    { title: '套餐名称', dataIndex: 'name', key: 'name' },
    { title: '有效期', dataIndex: 'durationDays', key: 'durationDays', render: (value: number) => `${value} 天` },
    { title: '状态', dataIndex: 'status', key: 'status', render: (value: PlanStatus) => planStatusTag(value) },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => formatDateTime(value) },
    ...(canWritePlans ? [{
      title: '操作', key: 'actions', width: 240,
      render: (_: unknown, record: MembershipPlan) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditPlan(record)}>编辑</Button>
          <Button size="small" icon={record.status === PlanStatus.Active ? <StopOutlined /> : <UnlockOutlined />} onClick={() => togglePlan(record)}>
            {record.status === PlanStatus.Active ? '停用' : '启用'}
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deletePlan(record)} />
        </Space>
      ),
    }] : []),
  ];

  const generateKeys = async ({ planId, count, expiresAt }: GenerateFormValues) => {
    const response = await adminApi.generateLicenseKeys({ planId, count, expiresAt: expiresAt?.toISOString() });
    setGenerated(response);
    setGenerateOpen(false);
    generateForm.resetFields();
    message.success(`已生成 ${response.keys.length} 张卡密`);
    await loadKeys(1, keys.pageSize);
  };

  const downloadGeneratedCsv = () => {
    if (!generated) return;
    if (generated.csv) {
      downloadText(`license-keys-${generated.batch.id}.csv`, generated.csv, 'text/csv;charset=utf-8');
      return;
    }
    const rows = normalizeGeneratedKeys(generated.keys);
    const csv = `\uFEFF${['卡密', ...rows.map((row) => row.code)].map((value) => `"${value.replaceAll('"', '""')}"`).join('\r\n')}`;
    downloadText(`license-keys-${generated.batch.id}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const revokeKey = (record: LicenseKeyRecord) => {
    modal.confirm({
      title: '吊销此卡密？',
      content: '吊销后不可兑换；已经产生的授权也会在下一次校验时失效。',
      okText: '确认吊销',
      okButtonProps: { danger: true },
      onOk: async () => {
        await adminApi.revokeLicenseKey(record.id);
        message.success('卡密已吊销');
        await loadKeys();
      },
    });
  };

  const keyColumns: TableProps<LicenseKeyRecord>['columns'] = [
    { title: '卡密（脱敏）', key: 'code', render: (_, record) => <Typography.Text code>{record.maskedCode || record.codePreview || `••••-${record.lastFour || '----'}`}</Typography.Text> },
    { title: '套餐', key: 'plan', render: (_, record) => record.planName || plans.find((plan) => plan.id === record.planId)?.name || record.planId },
    { title: '状态', dataIndex: 'status', key: 'status', render: (value: LicenseKeyStatus, record: LicenseKeyRecord) => <Space size={4}>{keyStatusTag(value)}{record.reusableAfterUnbind && <Tag color="processing">解绑后可复用</Tag>}</Space> },
    { title: '批次', dataIndex: 'batchId', key: 'batchId', render: (value: string) => <Typography.Text copyable={{ text: value }}>{value}</Typography.Text> },
    { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => formatDateTime(value) },
    { title: '兑换时间', dataIndex: 'redeemedAt', key: 'redeemedAt', render: (value: string | null) => formatDateTime(value) },
    ...(canWriteKeys ? [{ title: '操作', key: 'actions', width: 110, render: (_: unknown, record: LicenseKeyRecord) => (
      <Button size="small" danger disabled={record.status === LicenseKeyStatus.Revoked || record.status === LicenseKeyStatus.Expired} onClick={() => revokeKey(record)}>吊销</Button>
    ) }] : []),
  ];

  const tabItems = [
    {
      key: 'plans', label: <span><KeyOutlined /> 套餐配置</span>,
      children: <Panel className="table-panel">
        {plansError ? <ErrorPanel message={plansError} onRetry={() => void loadPlans()} /> : plansLoading ? <LoadingPanel /> : <Table<MembershipPlan> rowKey="id" columns={planColumns} dataSource={plans} pagination={false} locale={{ emptyText: <EmptyPanel description="还没有套餐，请先创建一个" /> }} />}
      </Panel>,
    },
    ...(canReadKeys ? [{
      key: 'keys', label: '卡密列表', children: <LicenseKeysView
        keys={keys} loading={keysLoading} error={keysError} plans={plans} canWrite={canWriteKeys}
        searchInput={keySearchInput} setSearchInput={setKeySearchInput} setSearch={setKeySearch}
        status={keyStatus} setStatus={setKeyStatus} planId={keyPlanId} setPlanId={setKeyPlanId}
        batchId={keyBatchId} setBatchId={setKeyBatchId} onLoad={() => void loadKeys()}
        onPageChange={(page, pageSize) => void loadKeys(page, pageSize)} columns={keyColumns}
        onGenerate={() => setGenerateOpen(true)}
      />,
    }] : []),
  ];

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="会员授权"
        title="会员与卡密"
        description="管理天卡、月卡、年卡与一次性授权卡密。完整卡密只在生成结果与当次 CSV 下载中出现。"
        actions={<Space>
          <Button icon={<ReloadOutlined />} onClick={() => { void loadPlans(); if (activeTab === 'keys') void loadKeys(); }}>刷新</Button>
          {canWritePlans && activeTab === 'plans' && <Button type="primary" icon={<PlusOutlined />} onClick={openCreatePlan}>新建套餐</Button>}
          {canWriteKeys && activeTab === 'keys' && <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)} disabled={!plans.some((plan) => plan.status === PlanStatus.Active)}>批量制卡</Button>}
        </Space>}
      />
      <Panel className="filter-panel">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text strong>卡密授权模式</Typography.Text>
          <Typography.Text type="secondary">单设备模式下，解绑后同一账号可以把原卡密迁移到新设备；多设备模式允许同一账号在多台设备使用同一张卡密，但新设备登录会让旧登录失效。</Typography.Text>
          <Radio.Group
            value={licensePolicy?.mode}
            disabled={!canWritePlans || policyLoading}
            onChange={(event) => {
              void updateLicenseMode(event.target.value as LicenseMode).catch((error) => message.error(errorMessage(error)));
            }}
            options={[
              { value: LicenseMode.SingleDevice, label: '一卡一设备（解绑可换机）' },
              { value: LicenseMode.MultiDeviceSingleSession, label: '一卡多设备（单账号单在线）' },
            ]}
          />
        </Space>
      </Panel>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal title={editingPlan ? '编辑套餐' : '新建套餐'} open={planModalOpen} onCancel={() => setPlanModalOpen(false)} footer={null} destroyOnHidden>
        <Form form={planForm} layout="vertical" onFinish={(values) => void savePlan(values)}>
          <Form.Item name="code" label="套餐代码" rules={[{ required: true, message: '请输入套餐代码' }, { pattern: /^[A-Za-z0-9_-]+$/, message: '仅支持字母、数字、下划线和短横线' }]}>
            <Input disabled={Boolean(editingPlan)} placeholder="例如 DAY / MONTH / YEAR" />
          </Form.Item>
          <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: '请输入套餐名称' }]}><Input placeholder="例如：月卡" /></Form.Item>
          <Form.Item name="durationDays" label="有效期（天）" rules={[{ required: true, message: '请输入有效期' }]}><InputNumber min={1} max={3650} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Button type="primary" htmlType="submit" block>保存套餐</Button>
        </Form>
      </Modal>

      <Modal title="批量生成卡密" open={generateOpen} onCancel={() => setGenerateOpen(false)} footer={null} destroyOnHidden>
        <Typography.Paragraph type="secondary">单批最多 1000 张。生成后请立即下载 CSV；服务端不会长期保存完整卡密。</Typography.Paragraph>
        <Form form={generateForm} layout="vertical" onFinish={(values) => void generateKeys(values)} initialValues={{ count: 1 }}>
          <Form.Item name="planId" label="套餐" rules={[{ required: true, message: '请选择套餐' }]}><Select placeholder="请选择启用中的套餐" options={plans.filter((plan) => plan.status === PlanStatus.Active).map((plan) => ({ value: plan.id, label: `${plan.name} · ${plan.durationDays} 天` }))} /></Form.Item>
          <Form.Item name="count" label="生成数量" rules={[{ required: true, message: '请输入数量' }, { type: 'number', min: 1, max: 1000, message: '数量范围为 1–1000' }]}><InputNumber min={1} max={1000} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="expiresAt" label="卡密失效时间（可选）"><DatePicker showTime style={{ width: '100%' }} disabledDate={(date) => date.isBefore(dayjs().startOf('day'))} /></Form.Item>
          <Button type="primary" htmlType="submit" block>生成并查看结果</Button>
        </Form>
      </Modal>

      <Modal title="卡密生成结果（仅本次可见）" open={Boolean(generated)} onCancel={() => setGenerated(undefined)} footer={<Button type="primary" onClick={downloadGeneratedCsv}>下载 CSV</Button>} width={680} destroyOnHidden>
        <Typography.Paragraph type="warning">请立即下载并妥善保管。关闭此窗口后，后台不会再次展示完整卡密。</Typography.Paragraph>
        <div className="generated-key-list">{generated && normalizeGeneratedKeys(generated.keys).map((key, index) => <Typography.Text code key={`${key.code}-${index}`}>{key.code}</Typography.Text>)}</div>
      </Modal>
    </div>
  );
}

function LicenseKeysView({
  keys, loading, error, plans, canWrite, searchInput, setSearchInput, setSearch, status, setStatus, planId, setPlanId, batchId, setBatchId, onLoad, onPageChange, columns, onGenerate,
}: {
  keys: PageResponse<LicenseKeyRecord>;
  loading: boolean;
  error?: string;
  plans: MembershipPlan[];
  canWrite: boolean;
  searchInput: string;
  setSearchInput: (value: string) => void;
  setSearch: (value: string) => void;
  status?: LicenseKeyStatus;
  setStatus: (value: LicenseKeyStatus | undefined) => void;
  planId?: string;
  setPlanId: (value: string | undefined) => void;
  batchId: string;
  setBatchId: (value: string) => void;
  onLoad: () => void;
  onPageChange: (page: number, pageSize: number) => void;
  columns: TableProps<LicenseKeyRecord>['columns'];
  onGenerate: () => void;
}) {
  return (
    <div className="keys-view">
      <Panel className="filter-panel">
        <Form layout="inline" onFinish={() => setSearch(searchInput.trim())}>
          <Form.Item label="关键词"><Input allowClear value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="卡密末四位 / UID" style={{ width: 220 }} /></Form.Item>
          <Form.Item label="套餐"><Select allowClear value={planId} onChange={setPlanId} placeholder="全部套餐" style={{ width: 150 }} options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} /></Form.Item>
          <Form.Item label="状态"><Select allowClear value={status} onChange={setStatus} placeholder="全部状态" style={{ width: 130 }} options={Object.entries({ UNUSED: '未使用', REDEEMED: '已兑换', REVOKED: '已吊销', EXPIRED: '已过期' }).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item label="批次"><Input allowClear value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="批次 ID" style={{ width: 180 }} /></Form.Item>
          <Form.Item><Button type="primary" onClick={onLoad}>查询</Button></Form.Item>
        </Form>
      </Panel>
      {error ? <ErrorPanel message={error} onRetry={onLoad} /> : <Panel className="table-panel"><Table<LicenseKeyRecord> rowKey="id" loading={loading} columns={columns} dataSource={keys.items} scroll={{ x: 1100 }} locale={{ emptyText: <EmptyPanel description="没有符合条件的卡密" /> }} pagination={{ current: keys.page, pageSize: keys.pageSize, total: keys.total, showSizeChanger: true, showTotal: (total) => `共 ${total} 张`, onChange: onPageChange }} /></Panel>}
      {!canWrite && <Typography.Text type="secondary">当前角色仅可查看卡密。</Typography.Text>}
      {canWrite && <Button className="mobile-generate-button" icon={<PlusOutlined />} onClick={onGenerate}>批量制卡</Button>}
    </div>
  );
}
