/**
 * Backup/restore module for the local SQLite database.
 *
 * Exports the raw sql.js bytes, optionally encrypts with AES-256-GCM
 * (passphrase-derived via PBKDF2), and wraps in a JSON envelope with
 * metadata and a SHA-256 integrity checksum.
 *
 * File extension: .permish-backup
 */

import type { LocalDatabase } from '../local/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupMetadata {
  version: number;
  createdAt: string;
  schemaVersion: number;
  recordCounts: {
    users: number;
    events: number;
    profiles: number;
    submissions: number;
  };
}

export interface BackupFile {
  format: 'permish-backup';
  version: 1;
  metadata: BackupMetadata;
  encrypted: boolean;
  salt?: string; // base64, for PBKDF2 key derivation
  iv?: string; // base64, for AES-GCM
  checksum: string; // SHA-256 of unencrypted data
  data: string; // base64 encoded (encrypted or plain)
}

// ---------------------------------------------------------------------------
// BackupManager
// ---------------------------------------------------------------------------

export class BackupManager {
  private db: LocalDatabase;

  constructor(db: LocalDatabase) {
    this.db = db;
  }

  /**
   * Create a backup of the current database.
   * If a passphrase is provided the data is encrypted with AES-256-GCM.
   */
  async createBackup(
    passphrase?: string
  ): Promise<{ blob: Blob; metadata: BackupMetadata }> {
    // 1. Gather metadata (record counts, schema version)
    const metadata = await this.getMetadata();

    // 2. Export raw database bytes via sql.js
    const rawData = this.exportRawDatabase();

    // 3. Compute SHA-256 checksum of the unencrypted bytes
    const checksum = await this.sha256(rawData);

    // 4. Optionally encrypt
    let data: string;
    let salt: string | undefined;
    let iv: string | undefined;
    let encrypted = false;

    if (passphrase) {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const ivBytes = crypto.getRandomValues(new Uint8Array(12));
      const key = await this.deriveKey(passphrase, saltBytes);
      const encryptedBytes = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        key,
        rawData
      );
      data = this.toBase64(new Uint8Array(encryptedBytes));
      salt = this.toBase64(saltBytes);
      iv = this.toBase64(ivBytes);
      encrypted = true;
    } else {
      data = this.toBase64(rawData);
    }

    const backup: BackupFile = {
      format: 'permish-backup',
      version: 1,
      metadata,
      encrypted,
      salt,
      iv,
      checksum,
      data
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json'
    });
    return { blob, metadata };
  }

  /**
   * Restore a database from a previously-exported backup file.
   * Returns the metadata embedded in the backup.
   */
  async restoreBackup(file: File | Blob, passphrase?: string): Promise<BackupMetadata> {
    const text = await file.text();
    const backup: BackupFile = JSON.parse(text);

    // Validate envelope
    if (backup.format !== 'permish-backup') {
      throw new Error('Invalid backup file format');
    }
    if (backup.version !== 1) {
      throw new Error(`Unsupported backup version: ${backup.version}`);
    }

    let rawData: Uint8Array;

    if (backup.encrypted) {
      if (!passphrase) {
        throw new Error('This backup is encrypted. Please provide the passphrase.');
      }
      if (!backup.salt || !backup.iv) {
        throw new Error('Encrypted backup missing salt or IV');
      }

      const salt = this.fromBase64(backup.salt);
      const iv = this.fromBase64(backup.iv);
      const key = await this.deriveKey(passphrase, salt);
      const encryptedData = this.fromBase64(backup.data);

      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          encryptedData
        );
        rawData = new Uint8Array(decrypted);
      } catch {
        throw new Error('Decryption failed. Wrong passphrase?');
      }
    } else {
      rawData = this.fromBase64(backup.data);
    }

    // Verify integrity checksum
    const checksum = await this.sha256(rawData);
    if (checksum !== backup.checksum) {
      throw new Error('Backup integrity check failed. File may be corrupted.');
    }

    // Replace the live database with the backup data
    await this.importRawDatabase(rawData);

    return backup.metadata;
  }

  /**
   * Trigger a browser download of the backup blob.
   */
  downloadBackup(blob: Blob, filename?: string): void {
    const name =
      filename ||
      `permish-backup-${new Date().toISOString().slice(0, 10)}.permish-backup`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async getMetadata(): Promise<BackupMetadata> {
    const counts = await Promise.all([
      this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM users'),
      this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM events'),
      this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM child_profiles'),
      this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM submissions')
    ]);

    const schemaMeta = await this.db
      .query<{ value: string }>("SELECT value FROM local_meta WHERE key = 'schema_version'")
      .catch(() => [{ value: '1' }]);

    return {
      version: 1,
      createdAt: new Date().toISOString(),
      schemaVersion: parseInt(schemaMeta[0]?.value || '1'),
      recordCounts: {
        users: counts[0][0]?.count || 0,
        events: counts[1][0]?.count || 0,
        profiles: counts[2][0]?.count || 0,
        submissions: counts[3][0]?.count || 0
      }
    };
  }

  private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Chunked base64 encoding — avoids call-stack overflow that btoa() hits
   * when given a large Uint8Array via spread/fromCharCode.
   */
  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  private fromBase64(str: string): Uint8Array {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Access the raw sql.js export via the SqlJsDatabase-specific method.
   */
  private exportRawDatabase(): Uint8Array {
    return (this.db as any).exportDatabase();
  }

  private async importRawDatabase(data: Uint8Array): Promise<void> {
    return (this.db as any).importDatabase(data);
  }
}
