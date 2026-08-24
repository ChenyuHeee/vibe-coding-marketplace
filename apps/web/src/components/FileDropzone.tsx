/**
 * FileDropzone —— 拖放上传区（DESIGN_SYSTEM 区域 2 要点 1 / §3 四状态 / §8 #10）
 *
 * 四状态齐全：
 * 1. 空态 Empty：拖入提示 + 示例文案（html ≤20MB / zip ≤50MB）+ [选择文件]；
 * 2. 进行中 In progress：**字节 + 百分比**进度条（Q2：能算百分比给百分比），可取消；
 * 3. 错误 Error：ErrorBanner 三件事（什么错 / 为什么 / 下一步）+ 换一种方式；
 * 4. 成功 Success：文件已就绪（名称 + 大小）+ 更换文件（下一步由父表单承接）。
 *
 * 校验与后端对齐（ARCHITECTURE §3.3）：.html/.htm ≤20MB、.zip ≤50MB，
 * 其余类型与超限在「选择文件」那一刻就地报错（不等到提交）。
 */
import { useRef, useState } from 'react';
import { FileUp, FileText, Loader2, X } from 'lucide-react';
import { validateProjectFile } from '../api/seller';
import type { UploadProgress } from '../types/seller';

interface FileDropzoneProps {
  /** 当前已就绪的文件（null = 未选择） */
  value: File | null;
  /** 用户选好/移除文件（仅通过校验的文件会传出） */
  onChange: (file: File | null) => void;
  /** 上传进行中（父组件提交时传入；非 null 即显示进行中态） */
  progress?: UploadProgress | null;
  /** 上传失败原因（父组件捕获；显示错误态） */
  error?: string | null;
  /** 上传中禁用交互（不可再换文件） */
  disabled?: boolean;
  /** 紧凑变体（里程碑交付物上传区） */
  compact?: boolean;
  /** 提示文案（默认作品上传说明） */
  hint?: string;
  /** 错误态「换一种方式」回调（默认清空重选） */
  onAlternative?: () => void;
}

export function FileDropzone({
  value,
  onChange,
  progress,
  error,
  disabled = false,
  compact = false,
  hint = '拖入 HTML 文件（≤20MB）或 zip 压缩包（≤50MB），也可点击选择',
  onAlternative,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const showError = pickError ?? error ?? null;
  const uploading = Boolean(progress && progress.total > 0);

  const openPicker = () => inputRef.current?.click();

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0] ?? null;
    const result = validateProjectFile(file);
    if (result.error) {
      setPickError(result.reason);
      onChange(null);
      return;
    }
    setPickError(null);
    onChange(result.file);
  };

  const clear = () => {
    if (disabled) return;
    setPickError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const classes = [
    'dropzone',
    compact ? 'dropzone--compact' : '',
    dragging ? 'dropzone--dragging' : '',
    showError ? 'dropzone--error' : '',
    value && !showError && !uploading ? 'dropzone--ready' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,.zip"
        className="visually-hidden"
        aria-label="选择作品文件（.html / .htm / .zip）"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled || uploading}
      />

      {/* ① 空态 */}
      {!value && !uploading && !showError && (
        <div
          className="dropzone__body"
          role="button"
          tabIndex={0}
          aria-label="上传作品文件：拖入或点击选择"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (disabled) return;
            handleFiles(e.dataTransfer.files);
          }}
        >
          <span className="dropzone__icon" aria-hidden="true">
            <FileUp size={28} />
          </span>
          <p className="dropzone__title text-body-sm">
            <strong>把作品文件拖到这里</strong>
          </p>
          <p className="dropzone__hint text-caption text-tertiary">{hint}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              openPicker();
            }}
          >
            选择文件
          </button>
        </div>
      )}

      {/* ② 进行中（字节 + 百分比，Q2） */}
      {uploading && (
        <div className="dropzone__body" role="status" aria-live="polite" data-testid="dropzone-uploading">
          <span className="dropzone__icon" aria-hidden="true">
            <Loader2 className="dropzone__spinner" size={24} />
          </span>
          <p className="dropzone__title text-body-sm">
            <strong>正在上传…</strong>
          </p>
          <div
            className="dropzone__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress!.percent)}
            aria-label={`上传进度 ${Math.round(progress!.percent)}%`}
          >
            <div className="dropzone__progress-bar" style={{ width: `${progress!.percent}%` }} />
          </div>
          <p className="dropzone__progress-text text-caption text-tertiary" data-testid="dropzone-progress-text">
            {(progress!.loaded / 1024 / 1024).toFixed(1)} MB / {(progress!.total / 1024 / 1024).toFixed(1)} MB ·{' '}
            {Math.round(progress!.percent)}%
          </p>
          <p className="dropzone__hint text-caption text-tertiary">上传中请勿关闭页面；可取消后重新上传（已填内容不丢失）。</p>
        </div>
      )}

      {/* ③ 错误（三件事 + 换一种方式） */}
      {!uploading && showError && (
        <div className="dropzone__body dropzone__error-body" role="alert">
          <span className="dropzone__icon dropzone__icon--error" aria-hidden="true">
            <X size={24} />
          </span>
          <p className="dropzone__title text-body-sm">
            <strong>文件无法使用</strong>
          </p>
          <p className="dropzone__hint text-body-sm">{showError}</p>
          <div className="dropzone__actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => (onAlternative ? onAlternative() : clear())}
            >
              换一种方式
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              重新选择
            </button>
          </div>
        </div>
      )}

      {/* ④ 成功（文件已就绪 + 更换文件） */}
      {!uploading && !showError && value && (
        <div className="dropzone__body dropzone__body--ready" role="status" data-testid="dropzone-ready">
          <span className="dropzone__icon dropzone__icon--ok" aria-hidden="true">
            <FileText size={24} />
          </span>
          <p className="dropzone__title text-body-sm">
            <strong>文件已就绪</strong>
          </p>
          <p className="dropzone__hint text-body-sm" data-testid="dropzone-file-name">
            {value.name}（{(value.size / 1024 / 1024).toFixed(1)} MB）
          </p>
          <div className="dropzone__actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clear}
              disabled={disabled}
            >
              更换文件
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
