import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Descriptions, Form, Input, Space, Table, Tag, Typography, type TableProps } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminApi';
import type { AuditLogRecord, PageResponse } from '../api/types';
import { ErrorPanel, EmptyPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { formatDateTime } from '../utils/format';
import { errorMessage } from '../utils/ui';

const PAGE_SIZE = 30;

export function AuditLogsPage() {
  const [logs, setLogs] = useState<PageResponse<AuditLogRecord>>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [actorInput, setActorInput] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (page = logs.page, pageSize = logs.pageSize) => {
    setLoading(true);
    setError(undefined);
    try {
      setLogs(await adminApi.auditLogs({ page, pageSize, actorType, action, targetType }));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [action, actorType, logs.page, logs.pageSize, targetType]);

  useEffect(() => {
    void load(1, PAGE_SIZE);
    // Filters intentionally reset to the first page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, actorType, targetType]);

  const columns = useMemo<TableProps<AuditLogRecord>['columns']>(() => [
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (value: string) => formatDateTime(value) },
    { title: '操作者', key: 'actor', render: (_, record) => <div className="table-primary-cell"><Typography.Text strong>{record.actorUsername || record.actorId || '-'}</Typography.Text><Typography.Text type="secondary">{record.actorType}</Typography.Text></div> },
    { title: '动作', dataIndex: 'action', key: 'action', render: (value: string) => <Tag color="blue">{value}</Tag> },
    { title: '目标', key: 'target', render: (_, record) => <Space direction="vertical" size={0}><span>{record.targetType}</span><Typography.Text type="secondary" copyable={record.targetId ? { text: record.targetId } : false}>{record.targetId || '-'}</Typography.Text></Space> },
    { title: '结果', dataIndex: 'result', key: 'result', render: (value: string | undefined) => <Tag color={value === 'SUCCESS' || value === 'success' ? 'success' : value ? 'error' : 'default'}>{value || '记录'}</Tag> },
    { title: '请求 ID', dataIndex: 'requestId', key: 'requestId', render: (value: string | null) => value ? <Typography.Text code copyable>{value}</Typography.Text> : '-' },
  ], []);

  return (
    <div className="page-stack">
      <PageIntro eyebrow="可追溯性" title="审计" description="敏感操作、登录与权限拒绝会在这里留下记录；手机号、卡密、令牌和原始设备标识不会写入日志。" actions={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>} />
      <Panel className="filter-panel">
        <Form layout="inline" onFinish={() => { setActorType(actorInput.trim()); setAction(actionInput.trim()); setTargetType(targetInput.trim()); }}>
          <Form.Item label="操作者类型"><Input allowClear value={actorInput} onChange={(event) => setActorInput(event.target.value)} placeholder="例如 ADMIN" style={{ width: 150 }} /></Form.Item>
          <Form.Item label="动作"><Input allowClear value={actionInput} onChange={(event) => setActionInput(event.target.value)} placeholder="例如 USER_SUSPEND" style={{ width: 180 }} /></Form.Item>
          <Form.Item label="目标类型"><Input allowClear value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="例如 USER / DEVICE" style={{ width: 180 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button></Form.Item>
        </Form>
      </Panel>
      <Panel className="table-panel">
        {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : <Table<AuditLogRecord> rowKey="id" loading={loading} columns={columns} dataSource={logs.items} scroll={{ x: 980 }} expandable={{ expandedRowRender: (record) => <Descriptions size="small" column={1} bordered><Descriptions.Item label="IP 地址">{record.ipAddress || '-'}</Descriptions.Item><Descriptions.Item label="元数据"><pre className="audit-json">{record.metadata ? JSON.stringify(record.metadata, null, 2) : '-'}</pre></Descriptions.Item></Descriptions>, rowExpandable: (record) => Boolean(record.metadata || record.ipAddress) }} locale={{ emptyText: <EmptyPanel description="暂无审计记录" /> }} pagination={{ current: logs.page, pageSize: logs.pageSize, total: logs.total, showSizeChanger: true, showTotal: (total) => `共 ${total} 条记录`, onChange: (page, pageSize) => void load(page, pageSize) }} />}
      </Panel>
    </div>
  );
}
