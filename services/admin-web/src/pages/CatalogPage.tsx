import {
  InboxOutlined,
  CloudUploadOutlined,
  EditOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  type TableProps,
  type UploadFile,
} from 'antd';
import { useCallback, useEffect, useMemo, useState, type Key } from 'react';

import { adminApi } from '../api/adminApi';
import {
  CatalogKind,
  CatalogReleaseStatus,
  Permission,
  type CatalogRelease,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorPanel, EmptyPanel, LoadingPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { formatDateTime } from '../utils/format';
import { errorMessage } from '../utils/ui';

interface EditValues {
  nameZh: string;
  nameEn?: string;
  descriptionZh: string;
  descriptionEn?: string;
  sortOrder: number;
  tags?: string;
}

const kindTabs = [
  { key: CatalogKind.Skill, label: '能力库' },
  { key: CatalogKind.Kit, label: '方案库' },
  { key: CatalogKind.Connector, label: '连接中心' },
];

const statusOptions = [
  { value: CatalogReleaseStatus.Draft, label: '草稿' },
  { value: CatalogReleaseStatus.Published, label: '已发布' },
  { value: CatalogReleaseStatus.Archived, label: '已归档' },
];

function statusTag(status: CatalogReleaseStatus) {
  const presentation = {
    [CatalogReleaseStatus.Draft]: { color: 'gold', label: '草稿' },
    [CatalogReleaseStatus.Published]: { color: 'success', label: '已发布' },
    [CatalogReleaseStatus.Archived]: { color: 'default', label: '已归档' },
  }[status];
  return <Tag color={presentation.color}>{presentation.label}</Tag>;
}

export function CatalogPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.CatalogWrite);
  const { message, modal } = App.useApp();
  const [kind, setKind] = useState<CatalogKind>(CatalogKind.Skill);
  const [status, setStatus] = useState<CatalogReleaseStatus>();
  const [items, setItems] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<Key[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<CatalogRelease>();
  const [editForm] = Form.useForm<EditValues>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await adminApi.catalogItems({ kind, status });
      setItems(result.items);
      setSelected([]);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => { void load(); }, [load]);

  const selectedRecords = useMemo(
    () => items.filter((item) => selected.includes(item.releaseId)),
    [items, selected],
  );

  const importArchive = async () => {
    const file = uploadFiles[0]?.originFileObj;
    if (!file) {
      message.warning('请选择目录 ZIP 包');
      return;
    }
    setImporting(true);
    try {
      const result = await adminApi.importCatalog(file);
      message.success(`已导入 ${result.items.length} 个草稿版本`);
      setImportOpen(false);
      setUploadFiles([]);
      setStatus(CatalogReleaseStatus.Draft);
      await load();
    } catch (importError) {
      message.error(errorMessage(importError));
    } finally {
      setImporting(false);
    }
  };

  const publishSelected = () => {
    const releaseIds = selectedRecords.filter((item) => item.status === CatalogReleaseStatus.Draft).map((item) => item.releaseId);
    if (releaseIds.length === 0) return message.warning('请选择草稿版本');
    modal.confirm({
      title: `发布 ${releaseIds.length} 个版本？`,
      content: '发布后，所有已登录客户端会在下一次目录同步时看到这些内容。',
      okText: '确认发布',
      onOk: async () => {
        await adminApi.publishCatalogReleases(releaseIds);
        message.success('目录内容已发布');
        await load();
      },
    });
  };

  const archiveSelected = () => {
    const releaseIds = selectedRecords.filter((item) => item.status !== CatalogReleaseStatus.Archived).map((item) => item.releaseId);
    if (releaseIds.length === 0) return message.warning('请选择可归档版本');
    modal.confirm({
      title: `归档 ${releaseIds.length} 个版本？`,
      content: '已发布内容归档后将从客户端目录中隐藏，用户本地已安装内容不受影响。',
      okText: '确认归档',
      okButtonProps: { danger: true },
      onOk: async () => {
        await adminApi.archiveCatalogReleases(releaseIds);
        message.success('目录内容已归档');
        await load();
      },
    });
  };

  const openEdit = (record: CatalogRelease) => {
    setEditing(record);
    editForm.setFieldsValue({
      nameZh: record.nameZh,
      nameEn: record.nameEn || undefined,
      descriptionZh: record.descriptionZh,
      descriptionEn: record.descriptionEn || undefined,
      sortOrder: record.sortOrder,
      tags: record.tags.join(', '),
    });
  };

  const saveEdit = async (values: EditValues) => {
    if (!editing) return;
    await adminApi.updateCatalogRelease(editing.releaseId, {
      ...values,
      nameZh: values.nameZh.trim(),
      nameEn: values.nameEn?.trim() || null,
      descriptionZh: values.descriptionZh.trim(),
      descriptionEn: values.descriptionEn?.trim() || null,
      tags: values.tags?.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) || [],
    });
    message.success('草稿信息已更新');
    setEditing(undefined);
    await load();
  };

  const columns: TableProps<CatalogRelease>['columns'] = [
    {
      title: '功能', key: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.nameZh}</Typography.Text>
          <Typography.Text type="secondary" className="catalog-slug">{record.slug}</Typography.Text>
        </Space>
      ),
    },
    { title: '版本', dataIndex: 'version', key: 'version', width: 110 },
    { title: '说明', dataIndex: 'descriptionZh', key: 'descriptionZh', ellipsis: true },
    { title: '资源', key: 'assets', width: 90, render: (_, record) => record.assets.length },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 180, render: formatDateTime },
    ...(canWrite ? [{
      title: '操作', key: 'actions', width: 90,
      render: (_: unknown, record: CatalogRelease) => record.status === CatalogReleaseStatus.Draft ? (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
      ) : null,
    }] : []),
  ];

  return (
    <>
      <PageIntro
        eyebrow="统一目录"
        title="功能发布"
        description="管理客户端能力库、方案库和连接中心的可见版本。"
        actions={(
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            {canWrite && <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>}
          </Space>
        )}
      />
      <Panel>
        <div className="catalog-toolbar">
          <Tabs items={kindTabs} activeKey={kind} onChange={(value) => setKind(value as CatalogKind)} />
          <Space wrap>
            <Select allowClear placeholder="全部状态" value={status} options={statusOptions} onChange={setStatus} style={{ width: 130 }} />
            {canWrite && <Button icon={<SendOutlined />} disabled={selected.length === 0} onClick={publishSelected}>发布</Button>}
            {canWrite && <Button danger icon={<InboxOutlined />} disabled={selected.length === 0} onClick={archiveSelected}>归档</Button>}
          </Space>
        </div>
        {loading ? <LoadingPanel label="正在加载功能目录" /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : items.length === 0 ? (
          <EmptyPanel description="暂无目录内容。导入批量包后，内容会先以草稿状态出现在这里。" />
        ) : (
          <Table<CatalogRelease>
            rowKey="releaseId"
            columns={columns}
            dataSource={items}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            rowSelection={canWrite ? { selectedRowKeys: selected, onChange: setSelected } : undefined}
            scroll={{ x: 900 }}
          />
        )}
      </Panel>

      <Modal title="批量导入功能目录" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => void importArchive()} confirmLoading={importing} okText="导入草稿">
        <Upload.Dragger
          accept=".zip,application/zip"
          maxCount={1}
          beforeUpload={() => false}
          fileList={uploadFiles}
          onChange={({ fileList }) => setUploadFiles(fileList.slice(-1))}
        >
          <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
          <p className="ant-upload-text">选择或拖入目录 ZIP 包</p>
          <p className="ant-upload-hint">包内必须在根目录包含 schemaVersion 为 1 的 manifest.json。</p>
        </Upload.Dragger>
      </Modal>

      <Modal title="编辑目录草稿" open={Boolean(editing)} onCancel={() => setEditing(undefined)} onOk={() => editForm.submit()} okText="保存">
        <Form form={editForm} layout="vertical" onFinish={(values) => void saveEdit(values)}>
          <Form.Item name="nameZh" label="中文名称" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>
          <Form.Item name="nameEn" label="英文名称"><Input maxLength={120} /></Form.Item>
          <Form.Item name="descriptionZh" label="中文说明" rules={[{ required: true, min: 4 }]}><Input.TextArea rows={4} maxLength={4000} showCount /></Form.Item>
          <Form.Item name="descriptionEn" label="英文说明"><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
          <Form.Item name="tags" label="标签"><Input placeholder="办公, 数据, 自动化" /></Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}><InputNumber min={-100000} max={100000} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
