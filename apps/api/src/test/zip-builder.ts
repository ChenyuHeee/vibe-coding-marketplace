/**
 * 测试辅助：手工构造合法 zip（stored 无压缩），用于 zip 解压安全测试。
 * 可指定 unix 权限位（构造符号链接条目）与「声明大小」（构造超限条目）。
 */
import { crc32 } from 'node:zlib';

export interface ZipEntrySpec {
  name: string;
  data?: Buffer | string;
  /** unix 权限位：普通文件 0x81A4（0100644）；符号链接 0xA1FF（S_IFLNK） */
  mode?: number;
  /** 声明的解压后大小（可故意写大以触发总解压上限校验；不影响实际数据） */
  declaredSize?: number;
}

export function buildZip(entries: ZipEntrySpec[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8');
    const nameBuf = Buffer.from(e.name, 'utf8');
    const size = e.declaredSize ?? data.length;
    const crc = crc32(data);
    const mode = e.mode ?? 0x81a4;

    // 本地文件头
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(size >>> 0, 18); // compressed size（stored = 原大小）
    local.writeUInt32LE(size >>> 0, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    chunks.push(local, nameBuf, data);

    // 中央目录条目
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x0314, 4); // version made by（高字节 3 = UNIX）
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc >>> 0, 16);
    cd.writeUInt32LE(size >>> 0, 20);
    cd.writeUInt32LE(size >>> 0, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra len
    cd.writeUInt16LE(0, 32); // comment len
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE((mode << 16) >>> 0, 38); // external attrs（unix mode 高 16 位）
    cd.writeUInt32LE(offset >>> 0, 42); // local header offset
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset >>> 0, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}
