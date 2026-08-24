/**
 * FileDropzone 组件测试 —— 四状态齐全（DESIGN_SYSTEM §3 / 区域 2 要点 1）：
 * 空态（拖入提示+示例文案）/ 进行中（字节+百分比）/ 错误（类型/超限原因+换一种方式）/ 成功（文件已就绪）。
 */
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { FileDropzone } from './FileDropzone';

function makeFile(name: string, size = 1024, type = 'text/html'): File {
  return new File([new Uint8Array(size)], name, { type });
}

const FILE_INPUT_LABEL = '选择作品文件（.html / .htm / .zip）';

describe('FileDropzone（四状态）', () => {
  it('空态：拖入提示 + 示例文案 + 选择文件按钮', () => {
    renderWithProviders(<FileDropzone value={null} onChange={() => {}} />);
    expect(screen.getByText('把作品文件拖到这里')).toBeInTheDocument();
    expect(screen.getByText(/HTML 文件（≤20MB）或 zip 压缩包（≤50MB）/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择文件' })).toBeInTheDocument();
  });

  it('成功态：选择合法 html → 文件已就绪 + 文件名与大小 + onChange 回传', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<FileDropzone value={null} onChange={onChange} />);
    const file = makeFile('game.html', 2 * 1024 * 1024);
    await user.upload(screen.getByLabelText(FILE_INPUT_LABEL), file);
    expect(onChange).toHaveBeenCalledWith(file);

    // 受控回填后展示成功态
    renderWithProviders(<FileDropzone value={file} onChange={() => {}} />);
    expect(screen.getByTestId('dropzone-ready')).toBeInTheDocument();
    expect(screen.getByTestId('dropzone-file-name')).toHaveTextContent('game.html');
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更换文件' })).toBeInTheDocument();
  });

  it('错误态：非 html/zip 类型 → 就地报错 + 换一种方式', async () => {
    const onChange = vi.fn();
    renderWithProviders(<FileDropzone value={null} onChange={onChange} />);
    // userEvent.upload 会按 accept 过滤掉 .exe（拿不到文件），用 fireEvent 直接注入触发校验路径
    fireEvent.change(screen.getByLabelText(FILE_INPUT_LABEL), {
      target: { files: [new File(['x'], 'evil.exe', { type: 'text/html' })] },
    });
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/仅支持 \.html \/ \.htm 单文件（≤20MB）或 \.zip 压缩包（≤50MB）/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换一种方式' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新选择' })).toBeInTheDocument();
  });

  it('错误态：html 超过 20MB → 超限原因', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileDropzone value={null} onChange={() => {}} />);
    await user.upload(screen.getByLabelText(FILE_INPUT_LABEL), makeFile('big.html', 20 * 1024 * 1024 + 1));
    expect(screen.getByText(/文件超过 20MB 上限/)).toBeInTheDocument();
  });

  it('错误态：zip 超过 50MB → 超限原因（区分 html/zip 限额）', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileDropzone value={null} onChange={() => {}} />);
    await user.upload(screen.getByLabelText(FILE_INPUT_LABEL), makeFile('big.zip', 50 * 1024 * 1024 + 1, 'application/zip'));
    expect(screen.getByText(/文件超过 50MB 上限/)).toBeInTheDocument();
  });

  it('进行中态：progress 传入 → 字节 + 百分比进度条（Q2）', () => {
    renderWithProviders(
      <FileDropzone
        value={null}
        onChange={() => {}}
        progress={{ loaded: 5 * 1024 * 1024, total: 10 * 1024 * 1024, percent: 50 }}
      />,
    );
    expect(screen.getByTestId('dropzone-uploading')).toBeInTheDocument();
    expect(screen.getByText(/5\.0 MB \/ 10\.0 MB · 50%/)).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('外部 error 传入 → 错误态展示（上传失败三件事）', () => {
    renderWithProviders(
      <FileDropzone value={null} onChange={() => {}} error="作品上传失败。文件超过 50MB 上限（当前 68MB）。下一步：压缩文件后重试。" />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/作品上传失败/)).toBeInTheDocument();
  });
});
