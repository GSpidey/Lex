import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorageProvider } from "@lex/contracts";

@Injectable()
export class S3ObjectStorageProvider implements ObjectStorageProvider {
  private readonly client: S3Client;
  private readonly uploadClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      region: config.getOrThrow<string>("S3_REGION"),
      forcePathStyle: config.get<boolean>("S3_FORCE_PATH_STYLE") ?? true,
      credentials: { accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"), secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY") },
    });
    this.uploadClient = new S3Client({
      endpoint: config.get<string>("S3_PUBLIC_ENDPOINT") ?? config.getOrThrow<string>("S3_ENDPOINT"),
      region: config.getOrThrow<string>("S3_REGION"),
      forcePathStyle: config.get<boolean>("S3_FORCE_PATH_STYLE") ?? true,
      credentials: { accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"), secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY") },
    });
  }

  async createUpload(input: { objectKey: string; contentType: string; sizeBytes: number }) {
    const expiresIn = 300;
    const uploadUrl = await getSignedUrl(this.uploadClient, new PutObjectCommand({ Bucket: this.bucket, Key: input.objectKey, ContentType: input.contentType, ContentLength: input.sizeBytes }), { expiresIn });
    return { uploadUrl, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async createDownload(input: { objectKey: string; fileName: string }) {
    const expiresIn = 120;
    const downloadUrl = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: input.objectKey, ResponseContentDisposition: `attachment; filename="${input.fileName.replaceAll('"', "")}"` }), { expiresIn });
    return { downloadUrl, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async read(objectKey: string) {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    if (!object.Body) throw new Error("Stored object has no body");
    return object.Body.transformToByteArray();
  }

  async delete(objectKey: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey })); }
}
