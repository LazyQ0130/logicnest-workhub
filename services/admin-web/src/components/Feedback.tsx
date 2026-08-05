import { Alert, Button, Empty, Spin } from 'antd';

export function LoadingPanel({ label = '正在加载数据…' }: { label?: string }) {
  return (
    <div className="loading-panel">
      <Spin />
      <span>{label}</span>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Alert
      type="error"
      showIcon
      message="数据加载失败"
      description={message}
      action={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
    />
  );
}

export function EmptyPanel({ description = '暂无数据' }: { description?: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />;
}
