import "server-only";

import { adminBucket } from "@/lib/firebase/admin";

// Supabase-style storage API on top of the project's default Cloud Storage
// bucket. Each former Supabase bucket becomes a top-level folder, so
// `storage.from("documents").upload("a/b.pdf")` writes `documents/a/b.pdf`.

type StorageError = { message: string };

type StorageResult<T> = { data: T; error: null } | { data: null; error: StorageError };

function toStorageError(error: unknown): StorageError {
  return { message: error instanceof Error ? error.message : String(error) };
}

class BucketApi {
  constructor(private readonly bucket: string) {}

  private file(path: string) {
    return adminBucket().file(`${this.bucket}/${path}`);
  }

  async upload(
    path: string,
    body: Buffer | Uint8Array | ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<StorageResult<{ path: string }>> {
    try {
      const file = this.file(path);

      if (!options?.upsert) {
        const [exists] = await file.exists();

        if (exists) {
          return { data: null, error: { message: "The resource already exists" } };
        }
      }

      const buffer = body instanceof ArrayBuffer ? Buffer.from(body) : Buffer.from(body);
      await file.save(buffer, {
        contentType: options?.contentType,
        resumable: false,
      });

      return { data: { path }, error: null };
    } catch (error) {
      return { data: null, error: toStorageError(error) };
    }
  }

  async remove(paths: string[]): Promise<StorageResult<{ name: string }[]>> {
    try {
      await Promise.all(paths.map((path) => this.file(path).delete({ ignoreNotFound: true })));
      return { data: paths.map((name) => ({ name })), error: null };
    } catch (error) {
      return { data: null, error: toStorageError(error) };
    }
  }

  async download(path: string): Promise<StorageResult<Blob>> {
    try {
      const [contents] = await this.file(path).download();
      return { data: new Blob([new Uint8Array(contents)]), error: null };
    } catch (error) {
      return { data: null, error: toStorageError(error) };
    }
  }

  async createSignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<StorageResult<{ signedUrl: string }>> {
    try {
      const [signedUrl] = await this.file(path).getSignedUrl({
        action: "read",
        expires: Date.now() + expiresInSeconds * 1000,
      });

      return { data: { signedUrl }, error: null };
    } catch (error) {
      return { data: null, error: toStorageError(error) };
    }
  }
}

export const storage = {
  from(bucket: string) {
    return new BucketApi(bucket);
  },
};
