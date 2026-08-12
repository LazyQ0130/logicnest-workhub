import {
  CloudUploadOutlined,
  EditOutlined,
  InboxOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  type TableProps,
  type UploadFile,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../api/adminApi';
import { DesktopReleaseStatus, Permission, type DesktopRelease } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorPanel, EmptyPanel, LoadingPanel } from '../components/Feedback';
import { PageIntro, Panel } from '../components/PageIntro';
import { formatDateTime } from '../utils/format';
import { errorMessage } from '../utils/ui';

interface UploadValues {
  version: string;
  changeLogZhTitle: string;
  changeLogZhContent: string;
  changeLogEnTitle: string;
  changeLogEnContent: string;
}

interface EditValues {
  changeLogZhTitle: string;
  changeLogZhContent: string;
  changeLogEnTitle: string;
  changeLogEnContent: string;
}

const statusOptions = [
  { value: DesktopReleaseStatus.Draft, label: '草稿' },
  { value: DesktopReleaseStatus.Published, label: '已发布' },
  { value: DesktopReleaseStatus.Withdrawn, label: '已撤回' },
  { value: DesktopReleaseStatus.Archived, label: '已归档' },
];

function statusTag(status: DesktopReleaseStatus) {
  const presentation = {
    [DesktopReleaseStatus.Draft]: { color: 'gold', label: '草稿' },
    [DesktopReleaseStatus.Published]: { color: 'success', label: '已发布' },
    [DesktopReleaseStatus.Withdrawn]: { color: 'error', label: '已撤回' },
    [DesktopReleaseStatus.Archived]: { color: 'default', label: '已归档' },
  }[status];
  return <Tag color={presentation.color}>{presentation.label}</Tag>;
}

const splitLines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export function DesktopReleasesPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.DesktopReleasesWrite);
  const { message, modal } = App.useApp();
  const [status, setStatus] = useState<DesktopReleaseStatus>();
  const [items, setItems] = useState<DesktopRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<DesktopRelease>();
  const [uploadForm] = Form.useForm<UploadValues>();
  const [editForm] = Form.useForm<EditValues>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setItems((await adminApi.desktopReleases({ platform: 'win32', arch: 'x64', status })).items);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const uploadRelease = async (values: UploadValues) => {
    const file = uploadFiles[0]?.originFileObj;
    if (!file) {
      message.warning('请选择 Windows EXE 安装包');
      return;
    }
    setUploading(true);
    try {
      await adminApi.uploadDesktopRelease({
        version: values.version.trim(),
        platform: 'win32',
        arch: 'x64',
        changeLogZh: { title: values.changeLogZhTitle.trim(), content: splitLines(values.changeLogZhContent) },
        changeLogEn: { title: values.changeLogEnTitle.trim(), content: splitLines(values.changeLogEnContent) },
        file,
      });
      message.success('桌面版本草稿已创建');
      setUploadOpen(false);
      setUploadFiles([]);
      uploadForm.resetFields();
      await load();
    } catch (uploadError) {
      message.error(errorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (record: DesktopRelease) => {
    setEditing(record);
    editForm.setFieldsValue({
      changeLogZhTitle: record.changeLogZh.title,
      changeLogZhContent: record.changeLogZh.content.join('\n'),
      changeLogEnTitle: record.changeLogEn.title,
      changeLogEnContent: record.changeLogEn.content.join('\n'),
    });
  };

  const saveEdit = async (values: EditValues) => {
    if (!editing) return;
    try {
      await adminApi.updateDesktopRelease(editing.id, {
        changeLogZh: { title: values.changeLogZhTitle.trim(), content: splitLines(values.changeLogZhContent) },
        changeLogEn: { title: values.changeLogEnTitle.trim(), content: splitLines(values.changeLogEnContent) },
      });
      message.success('更新日志已保存');
      setEditing(undefined);
      await load();
    } catch (saveError) {
      message.error(errorMessage(saveError));
    }
  };

  const confirmAction = (record: DesktopRelease, action: 'publish' | 'withdraw') => {
    const isPublish = action === 'publish';
    modal.confirm({
      title: isPublish ? `发布版本 ${record.version}？` : `撤回版本 ${record.version}？`,
      content: isPublish ? '发布后客户端会在下一次检查时看到该版本。' : '撤回后客户端将不再获得该版本，系统会尝试恢复上一版本。',
      okText: isPublish ? '确认发布' : '确认撤回',
      okButtonProps: isPublish ? undefined : { danger: true },
      onOk: async () => {
        try {
          if (isPublish) await adminApi.publishDesktopRelease(record.id);
          else await adminApi.withdrawDesktopRelease(record.id);
          message.success(isPublish ? '版本已发布' : '版本已撤回');
          await load();
        } catch (actionError) {
          message.error(errorMessage(actionError));
        }
      },
    });
  };

  const columns: TableProps<DesktopRelease>['columns'] = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 120 },
    { title: '平台', key: 'platform', width: 110, render: (_, record) => `${record.platform}/${record.arch}` },
    { title: '安装包', key: 'asset', render: (_, record) => record.asset ? <Typography.Text ellipsis style={{ maxWidth: 240 }}>{record.asset.originalName}</Typography.Text> : '-' },
    { title: '大小', key: 'size', width: 110, render: (_, record) => record.asset ? `${(record.asset.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '发布时间', dataIndex: 'publishedAt', key: 'publishedAt', width: 180, render: (value: string | null) => value ? formatDateTime(value) : '-' },
    ...(canWrite ? [{
      title: '操作', key: 'actions', width: 190,
      render: (_: unknown, record: DesktopRelease) => (
        <Space>
          {record.status === DesktopReleaseStatus.Draft && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>}
          {(record.status === DesktopReleaseStatus.Draft || record.status === DesktopReleaseStatus.Archived || record.status === DesktopReleaseStatus.Withdrawn) && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => confirmAction(record, 'publish')}>发布</Button>}
          {record.status === DesktopReleaseStatus.Published && <Button size="small" danger icon={<InboxOutlined />} onClick={() => confirmAction(record, 'withdraw')}>撤回</Button>}
        </Space>
      ),
    }] : []),
  ];

  return (
    <>
      <PageIntro
        eyebrow="发布管理"
        title="桌面版本"
        description="上传、审核和发布 LogicNest WorkHub 的桌面安装包。"
        actions={<Space wrap><Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>{canWrite && <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setUploadOpen(true)}>上传版本</Button>}</Space>}
      />
      <Panel>
        <Space className="catalog-toolbar" wrap>
          <Select allowClear placeholder="全部状态" value={status} options={statusOptions} onChange={setStatus} style={{ width: 140 }} />
        </Space>
        {loading ? <LoadingPanel label="正在加载桌面版本" /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyPanel description="暂无桌面版本" /> : <Table rowKey="id" columns={columns} dataSource={items} pagination={{ pageSize: 20 }} scroll={{ x: 1100 }} />}
      </Panel>

      <Modal title="上传桌面版本" open={uploadOpen} onCancel={() => setUploadOpen(false)} onOk={() => void uploadForm.submit()} confirmLoading={uploading} okText="创建草稿">
        <Form form={uploadForm} layout="vertical" onFinish={(values) => void uploadRelease(values)}>
          <Form.Item name="version" label="版本号" rules={[{ required: true, pattern: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/ }]}><Input placeholder="例如 2026.8.8" /></Form.Item>
          <Form.Item label="Windows x64 安装包" required><Upload.Dragger accept=".exe,application/vnd.microsoft.portable-executable" maxCount={1} beforeUpload={() => false} fileList={uploadFiles} onChange={({ fileList }) => setUploadFiles(fileList.slice(-1))}><p className="ant-upload-drag-icon"><CloudUploadOutlined /></p><p className="ant-upload-text">选择或拖入 EXE 安装包</p><p className="ant-upload-hint">上传后服务端会计算 SHA-256，当前仅支持 Windows x64。</p></Upload.Dragger></Form.Item>
          <Form.Item name="changeLogZhTitle" label="中文更新标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="changeLogZhContent" label="中文更新内容" rules={[{ required: true }]}><Input.TextArea rows={3} placeholder="每行一条" /></Form.Item>
          <Form.Item name="changeLogEnTitle" label="英文更新标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="changeLogEnContent" label="英文更新内容" rules={[{ required: true }]}><Input.TextArea rows={3} placeholder="One item per line" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑更新日志" open={Boolean(editing)} onCancel={() => setEditing(undefined)} onOk={() => editForm.submit()} okText="保存">
        <Form form={editForm} layout="vertical" onFinish={(values) => void saveEdit(values)}>
          <Form.Item name="changeLogZhTitle" label="中文更新标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="changeLogZhContent" label="中文更新内容" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="changeLogEnTitle" label="英文更新标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="changeLogEnContent" label="英文更新内容" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
