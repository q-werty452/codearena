import * as vscode from "vscode";

/**
 * Виртуальные файлы только для чтения (схема codearena:):
 * /teacher/<файл> — код учителя у ученика, /students/<имя>/<файл> — код ученика у учителя.
 * Файлы живут в памяти и не попадают на диск.
 */
export class LessonFs implements vscode.FileSystemProvider {
  static readonly scheme = "codearena";
  private files = new Map<string, { data: Uint8Array; mtime: number }>();
  private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  static uri(path: string): vscode.Uri {
    return vscode.Uri.from({ scheme: LessonFs.scheme, path });
  }

  set(uri: vscode.Uri, text: string): void {
    const existed = this.files.has(uri.path);
    this.files.set(uri.path, { data: new TextEncoder().encode(text), mtime: Date.now() });
    this.emitter.fire([{ type: existed ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }
  stat(uri: vscode.Uri): vscode.FileStat {
    const f = this.files.get(uri.path);
    if (!f) {
      // Папки — виртуальные.
      if ([...this.files.keys()].some((k) => k.startsWith(uri.path.replace(/\/?$/, "/")))) return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return { type: vscode.FileType.File, ctime: f.mtime, mtime: f.mtime, size: f.data.byteLength, permissions: vscode.FilePermission.Readonly };
  }
  readDirectory(): [string, vscode.FileType][] {
    return [];
  }
  readFile(uri: vscode.Uri): Uint8Array {
    const f = this.files.get(uri.path);
    if (!f) throw vscode.FileSystemError.FileNotFound(uri);
    return f.data;
  }
  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions();
  }
  writeFile(): void {
    throw vscode.FileSystemError.NoPermissions();
  }
  delete(): void {
    throw vscode.FileSystemError.NoPermissions();
  }
  rename(): void {
    throw vscode.FileSystemError.NoPermissions();
  }
}
